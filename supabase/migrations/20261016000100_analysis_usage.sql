-- FASE 03: usage record of each analysis (decided 16/10/2026; docs/compliance.md, Travas de custo).
-- Deleting a document deletes its analyses, which erased the token history and freed slots in the daily limit.
-- analysis_usage keeps only numbers (who, when, module, model, tokens), with no link to the document,
-- so it survives the deletion; the daily limit now counts it.

create table public.analysis_usage (
  -- No foreign key to document_analyses: the row must outlive the analysis.
  analysis_id uuid primary key,
  requested_by uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.analysis_modules(id) on delete restrict,
  -- When the analysis started: the AI call is billed whether it succeeds or not.
  created_at timestamptz not null,
  model text check (model is null or length(model) <= 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  -- When the server recorded the tokens; null while the analysis has no provider result.
  recorded_at timestamptz,
  check ((recorded_at is null) = (input_tokens is null and output_tokens is null))
);
create index analysis_usage_requested_by_created_idx on public.analysis_usage(requested_by, created_at desc);

alter table public.analysis_usage enable row level security;
revoke all on public.analysis_usage from public, anon, authenticated;
grant select on public.analysis_usage to authenticated;
grant all on public.analysis_usage to service_role;
-- Each user reads only their own usage. Writes come only from the trigger and the server.
create policy analysis_usage_read on public.analysis_usage for select to authenticated
  using (requested_by = (select auth.uid()));

-- Every new analysis gets its usage row in the same transaction, whoever inserts it.
create function module_private.record_analysis_start()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.analysis_usage(analysis_id, requested_by, module_id, created_at)
    values (new.id, new.requested_by, new.module_id, new.created_at);
  return new;
end;
$$;
revoke all on function module_private.record_analysis_start() from public, anon, authenticated;
create trigger document_analyses_usage after insert on public.document_analyses
  for each row execute function module_private.record_analysis_start();

-- Analyses that already exist (their tokens were only logged by collect-analyses).
insert into public.analysis_usage(analysis_id, requested_by, module_id, created_at, model)
  select id, requested_by, module_id, created_at, model from public.document_analyses;

-- Server only (service role): tokens reported by the provider. Recorded once; a concurrent call is ignored.
create function public.record_analysis_usage(analysis_id uuid, model text, input_tokens integer, output_tokens integer)
returns void language sql security definer set search_path = '' as $$
  update public.analysis_usage u set model = coalesce(record_analysis_usage.model, u.model),
      input_tokens = coalesce(record_analysis_usage.input_tokens, 0), output_tokens = coalesce(record_analysis_usage.output_tokens, 0),
      recorded_at = now()
    where u.analysis_id = record_analysis_usage.analysis_id and u.recorded_at is null;
$$;
revoke all on function public.record_analysis_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_analysis_usage(uuid, text, integer, integer) to service_role;

-- Same as 20261008000200, except that the daily limit counts analysis_usage.
create or replace function public.start_document_analysis(document_id uuid, module_id text)
returns public.document_analyses language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); doc public.documents; module public.analysis_modules; analysis public.document_analyses;
  used integer; oldest timestamptz;
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
    where a.document_id = doc.id and a.status = 'processing'
      and a.created_at < now() - case when a.provider_batch_id is null
        then module_private.analysis_timeout() else module_private.batch_timeout() end;
  if exists(select 1 from public.document_analyses a where a.document_id = doc.id and a.status = 'processing') then
    raise exception 'analysis_in_progress' using errcode = '55006';
  end if;
  -- One start at a time per user, so two requests on different documents cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('daily_analysis_limit:' || actor::text, 0));
  select count(*), min(u.created_at) into used, oldest from public.analysis_usage u
    where u.requested_by = actor and u.created_at > now() - module_private.daily_analysis_window();
  if used >= module_private.daily_analysis_limit() then
    -- The detail tells the app when the oldest counted analysis leaves the window.
    raise exception 'daily_limit_reached' using errcode = '54000',
      detail = to_char((oldest + module_private.daily_analysis_window()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  select * into module from public.analysis_modules m where m.id = start_document_analysis.module_id;
  insert into public.document_analyses(document_id, requested_by, module_id, module_version, terms_version)
    values(doc.id, actor, module.id, module.active_version, module.terms_version)
    returning * into analysis;
  update public.documents set status = 'processing' where id = doc.id;
  return analysis;
end;
$$;
revoke all on function public.start_document_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.start_document_analysis(uuid, text) to authenticated;

-- Same as 20261008000100, counting analysis_usage.
create or replace function public.get_analysis_quota()
returns table(daily_limit integer, used integer, remaining integer, next_available_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select module_private.daily_analysis_limit(), q.used,
    greatest(module_private.daily_analysis_limit() - q.used, 0),
    q.oldest + module_private.daily_analysis_window()
  from (select count(*)::integer as used, min(u.created_at) as oldest from public.analysis_usage u
    where u.requested_by = auth.uid() and u.created_at > now() - module_private.daily_analysis_window()) q
  where auth.uid() is not null;
$$;
revoke all on function public.get_analysis_quota() from public, anon, authenticated;
grant execute on function public.get_analysis_quota() to authenticated;
