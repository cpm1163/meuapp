-- FASE 03: analyses run through the Anthropic Message Batches API (decided 08/10/2026; docs/compliance.md).
-- An Edge Function stops after 150 s on the free plan and a long report takes minutes, so the function
-- only submits the batch; a second call collects the result. Batches cost 50% less and end within 24 hours.

-- Batch that is processing the analysis. Set once by the server right after the submission.
alter table public.document_analyses add column provider_batch_id text
  check (provider_batch_id is null or provider_batch_id ~ '^[A-Za-z0-9_-]{1,128}$');

-- A submitted batch may take up to 24 hours; after that the analysis is considered abandoned.
create function module_private.batch_timeout()
returns interval language sql immutable set search_path = '' as $$ select interval '25 hours' $$;
revoke all on function module_private.batch_timeout() from public, anon, authenticated;

-- Same as 20261008000100, except that an analysis with a submitted batch is abandoned only after the batch timeout.
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

-- Server only (service role): records the batch right after it is created.
create function public.set_analysis_batch(analysis_id uuid, batch_id text, model text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.document_analyses a set provider_batch_id = set_analysis_batch.batch_id, model = set_analysis_batch.model
    where a.id = set_analysis_batch.analysis_id and a.status = 'processing' and a.provider_batch_id is null;
  if not found then raise exception 'analysis_not_available' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.start_document_analysis(uuid, text), public.set_analysis_batch(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.start_document_analysis(uuid, text) to authenticated;
grant execute on function public.set_analysis_batch(uuid, text, text) to service_role;

-- Version of the lab-report instructions the server runs (modules/lab-report/instructions.ts, INSTRUCTIONS_VERSION).
-- start_document_analysis records it on each analysis; the function refuses to run if its code is at another version.
update public.analysis_modules set active_version = 'lab-report/2-instructions/1', updated_at = now() where id = 'lab-report';
