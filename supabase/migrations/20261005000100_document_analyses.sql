-- FASE 03: analyses of a document by an analysis module.
-- Decisions of 05/10/2026:
-- 1. An analysis belongs to the user who requested it (the document owner). Sharing is one switch:
--    a shared analysis is visible to whoever can read the document (FASE 01 shares). No second list.
-- 2. A module in 'testing' can be used by users with an active grant, like 'active'.
-- Clients only read analyses and toggle sharing. Results are written by the analysis function (service role).

create table public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.analysis_modules(id) on delete restrict,
  -- Traceability: what produced this analysis.
  module_version text,
  terms_version text not null,
  model text check (model is null or length(model) <= 100),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  extraction jsonb check (extraction is null or jsonb_typeof(extraction) = 'object'),
  findings jsonb check (findings is null or jsonb_typeof(findings) = 'array'),
  failure_reason text check (failure_reason is null or failure_reason ~ '^[a-z_]{1,64}$'),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz check (completed_at is null or completed_at >= created_at),
  check ((status = 'processing') = (completed_at is null)),
  check (status = 'ready' or (extraction is null and findings is null and shared_at is null)),
  check (status <> 'ready' or (extraction is not null and findings is not null)),
  check (status = 'failed' or failure_reason is null),
  check (status <> 'failed' or failure_reason is not null)
);
create index document_analyses_document_idx on public.document_analyses(document_id, created_at desc);
create index document_analyses_requested_by_idx on public.document_analyses(requested_by);
-- At most one analysis in progress per document.
create unique index document_analyses_one_processing_idx on public.document_analyses(document_id)
  where status = 'processing';

alter table public.document_analyses enable row level security;
revoke all on public.document_analyses from public, anon, authenticated;
grant select on public.document_analyses to authenticated;
grant all on public.document_analyses to service_role;

-- The requester sees all of their analyses, even without the module today.
-- Others see an analysis only while it is shared and they can still read the document,
-- so revoking the document share also removes access to its shared analyses.
create policy analyses_read on public.document_analyses for select to authenticated
  using (requested_by = (select auth.uid())
    or (shared_at is not null and document_private.can_read_document(document_id)));

-- 2. 'testing' modules are usable by granted users.
create or replace function module_private.can_use_module(module_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.analysis_modules m
    where m.id = can_use_module.module_id and m.status in ('testing', 'active')
      and module_private.has_active_grant(m.id)
      and exists(select 1 from public.module_terms_acceptances t
        where t.user_id = (select auth.uid()) and t.module_id = m.id and t.terms_version = m.terms_version));
$$;

-- An analysis left in 'processing' longer than this is considered abandoned and can be replaced.
create function module_private.analysis_timeout()
returns interval language sql immutable set search_path = '' as $$ select interval '15 minutes' $$;
revoke all on function module_private.analysis_timeout() from public, anon, authenticated;

-- Called by the analysis function with the user's token, before downloading the file.
-- Checks module, grant, terms and ownership; reserves the document so two analyses never run at once.
create function public.start_document_analysis(document_id uuid, module_id text)
returns public.document_analyses language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); doc public.documents; module public.analysis_modules; analysis public.document_analyses;
begin
  if actor is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not module_private.can_use_module(start_document_analysis.module_id) then
    raise exception 'module_not_available' using errcode = '42501';
  end if;
  select * into doc from public.documents d where d.id = start_document_analysis.document_id and d.owner_id = actor for update;
  if not found then raise exception 'document_not_available' using errcode = '42501'; end if;
  if doc.status not in ('uploaded', 'processing', 'ready', 'failed') then
    raise exception 'invalid_document_state' using errcode = '22023';
  end if;
  update public.document_analyses a set status = 'failed', failure_reason = 'timeout', completed_at = now()
    where a.document_id = doc.id and a.status = 'processing' and a.created_at < now() - module_private.analysis_timeout();
  if exists(select 1 from public.document_analyses a where a.document_id = doc.id and a.status = 'processing') then
    raise exception 'analysis_in_progress' using errcode = '55006';
  end if;
  select * into module from public.analysis_modules m where m.id = start_document_analysis.module_id;
  insert into public.document_analyses(document_id, requested_by, module_id, module_version, terms_version)
    values(doc.id, actor, module.id, module.active_version, module.terms_version)
    returning * into analysis;
  update public.documents set status = 'processing' where id = doc.id;
  return analysis;
end;
$$;

-- Server only (service role). The document keeps 'deleting' if the owner started a deletion meanwhile.
create function public.complete_document_analysis(analysis_id uuid, extraction jsonb, findings jsonb, model text)
returns void language plpgsql security definer set search_path = '' as $$
declare analysis public.document_analyses;
begin
  select * into analysis from public.document_analyses a where a.id = complete_document_analysis.analysis_id for update;
  if not found or analysis.status <> 'processing' then raise exception 'analysis_not_available' using errcode = '22023'; end if;
  update public.document_analyses a set status = 'ready', extraction = complete_document_analysis.extraction,
      findings = complete_document_analysis.findings, model = complete_document_analysis.model, completed_at = now()
    where a.id = analysis.id;
  update public.documents d set status = 'ready' where d.id = analysis.document_id and d.status = 'processing';
end;
$$;

create function public.fail_document_analysis(analysis_id uuid, reason text, model text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare analysis public.document_analyses;
begin
  select * into analysis from public.document_analyses a where a.id = fail_document_analysis.analysis_id for update;
  if not found or analysis.status <> 'processing' then raise exception 'analysis_not_available' using errcode = '22023'; end if;
  update public.document_analyses a set status = 'failed', failure_reason = fail_document_analysis.reason,
      model = fail_document_analysis.model, completed_at = now()
    where a.id = analysis.id;
  update public.documents d set status = 'failed' where d.id = analysis.document_id and d.status = 'processing';
end;
$$;

-- 1. The requester shares or unshares one finished analysis.
create function public.set_analysis_shared(analysis_id uuid, shared boolean)
returns public.document_analyses language plpgsql security definer set search_path = '' as $$
declare analysis public.document_analyses;
begin
  select * into analysis from public.document_analyses a
    where a.id = set_analysis_shared.analysis_id and a.requested_by = auth.uid() for update;
  if not found then raise exception 'analysis_not_available' using errcode = '42501'; end if;
  if analysis.status <> 'ready' then raise exception 'analysis_not_ready' using errcode = '22023'; end if;
  update public.document_analyses a
    set shared_at = case when set_analysis_shared.shared then coalesce(a.shared_at, now()) end
    where a.id = analysis.id returning * into analysis;
  return analysis;
end;
$$;

revoke all on function public.start_document_analysis(uuid, text), public.complete_document_analysis(uuid, jsonb, jsonb, text),
  public.fail_document_analysis(uuid, text, text), public.set_analysis_shared(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.start_document_analysis(uuid, text), public.set_analysis_shared(uuid, boolean)
  to authenticated;
grant execute on function public.complete_document_analysis(uuid, jsonb, jsonb, text),
  public.fail_document_analysis(uuid, text, text) to service_role;
