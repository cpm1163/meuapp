-- Alertas (docs/alerts.md, decided 29/10/2026): what needs the doctor's attention, shown on the home.
-- The database creates each alert when the event happens and removes it by itself when the pending item is resolved.
-- The doctor can view, mark as read and delete alerts; deleting an alert never touches the document.

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('document_unassigned', 'document_shared')),
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, kind, document_id)
);
create index alerts_user_idx on public.alerts(user_id, created_at desc);

alter table public.alerts enable row level security;
revoke all on public.alerts from public, anon, authenticated;
grant select, delete on public.alerts to authenticated;
grant update (read_at) on public.alerts to authenticated;
grant all on public.alerts to service_role;
create policy alerts_read_own on public.alerts for select to authenticated
  using (user_id = (select auth.uid()));
create policy alerts_update_own on public.alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy alerts_delete_own on public.alerts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Same rule as the app's patient screens: anyone who ever had the module, so an expired grant still sees the alert.
-- Without the module every document is unassigned, so that alert would never clear.
create function document_private.ever_had_patient_records(user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.module_grants g where g.user_id = ever_had_patient_records.user_id and g.module_id = 'patient-records');
$$;

-- A document gets an alert when it becomes available without a patient, or loses its patient.
-- Only those transitions create it, so an alert the doctor deleted does not return when the analysis changes status.
-- Linking the document, or starting its deletion, resolves it.
create function document_private.sync_unassigned_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare available text[] := array['uploaded', 'processing', 'ready', 'failed'];
begin
  if new.patient_id is null and new.status = any(available)
    and (tg_op = 'INSERT' or old.patient_id is not null or not old.status = any(available))
    and document_private.ever_had_patient_records(new.owner_id) then
    insert into public.alerts(user_id, kind, document_id) values(new.owner_id, 'document_unassigned', new.id)
      on conflict do nothing;
  elsif new.patient_id is not null or new.status = 'deleting' then
    delete from public.alerts a where a.document_id = new.id and a.kind = 'document_unassigned';
  end if;
  if new.status = 'deleting' then
    delete from public.alerts a where a.document_id = new.id and a.kind = 'document_shared';
  end if;
  return null;
end;
$$;
create trigger documents_unassigned_alert after insert or update of patient_id, status on public.documents
  for each row execute function document_private.sync_unassigned_alert();

-- Sharing a document alerts the recipient; revoking the access resolves it.
create function document_private.sync_shared_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.alerts(user_id, kind, document_id) values(new.user_id, 'document_shared', new.document_id)
      on conflict do nothing;
  else
    delete from public.alerts a where a.document_id = old.document_id and a.user_id = old.user_id and a.kind = 'document_shared';
  end if;
  return null;
end;
$$;
create trigger document_shares_alert after insert or delete on public.document_shares
  for each row execute function document_private.sync_shared_alert();

revoke all on function document_private.ever_had_patient_records(uuid), document_private.sync_unassigned_alert(),
  document_private.sync_shared_alert() from public, anon, authenticated;

-- Pending items from before this migration.
insert into public.alerts(user_id, kind, document_id, created_at)
  select d.owner_id, 'document_unassigned', d.id, d.created_at from public.documents d
  where d.patient_id is null and d.status in ('uploaded', 'processing', 'ready', 'failed')
    and document_private.ever_had_patient_records(d.owner_id);
insert into public.alerts(user_id, kind, document_id, created_at)
  select s.user_id, 'document_shared', s.document_id, s.created_at from public.document_shares s
  join public.documents d on d.id = s.document_id where d.status <> 'deleting';
