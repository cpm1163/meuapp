-- FASE 03: daily limit of analyses per user (cost guardrail, decided 08/10/2026; docs/compliance.md, Travas de custo).
-- Every analysis started in the last 24 hours counts, failed ones included, because the AI call was billed.
-- The check runs in start_document_analysis, before the file is downloaded and the AI is called.

-- Provisional value, to calibrate with real use. Changing it takes a small migration.
create function module_private.daily_analysis_limit()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;
create function module_private.daily_analysis_window()
returns interval language sql immutable set search_path = '' as $$ select interval '24 hours' $$;
revoke all on function module_private.daily_analysis_limit(), module_private.daily_analysis_window()
  from public, anon, authenticated;

-- Serves the count by requester and date; the composite index replaces the single-column one.
create index document_analyses_requested_by_created_idx on public.document_analyses(requested_by, created_at desc);
drop index public.document_analyses_requested_by_idx;

-- Same checks as before, plus the daily limit right before reserving the document.
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
    where a.document_id = doc.id and a.status = 'processing' and a.created_at < now() - module_private.analysis_timeout();
  if exists(select 1 from public.document_analyses a where a.document_id = doc.id and a.status = 'processing') then
    raise exception 'analysis_in_progress' using errcode = '55006';
  end if;
  -- One start at a time per user, so two requests on different documents cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('daily_analysis_limit:' || actor::text, 0));
  select count(*), min(a.created_at) into used, oldest from public.document_analyses a
    where a.requested_by = actor and a.created_at > now() - module_private.daily_analysis_window();
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

-- For the app: how many analyses the user still has and when the next one frees up.
create function public.get_analysis_quota()
returns table(daily_limit integer, used integer, remaining integer, next_available_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select module_private.daily_analysis_limit(), q.used,
    greatest(module_private.daily_analysis_limit() - q.used, 0),
    q.oldest + module_private.daily_analysis_window()
  from (select count(*)::integer as used, min(a.created_at) as oldest from public.document_analyses a
    where a.requested_by = auth.uid() and a.created_at > now() - module_private.daily_analysis_window()) q
  where auth.uid() is not null;
$$;

revoke all on function public.start_document_analysis(uuid, text), public.get_analysis_quota() from public, anon, authenticated;
grant execute on function public.start_document_analysis(uuid, text), public.get_analysis_quota() to authenticated;
