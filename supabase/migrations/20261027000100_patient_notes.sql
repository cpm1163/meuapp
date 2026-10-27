-- Anamnese (docs/anamnesis.md, decided 27/10/2026): the patient's record holds free-text notes ordered by entry.
-- A note can be corrected at any time and only the corrected text is kept; no note is ever deleted by the doctor.
-- Same access as the patient record: only the owner; sharing a document never shares the notes.

create table public.patient_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  owner_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Restrict: a patient with notes cannot be deleted, like a patient with documents.
  foreign key (patient_id, owner_id) references public.patients(id, owner_id) on delete restrict
);
create index patient_notes_patient_idx on public.patient_notes(patient_id, created_at desc);

alter table public.patient_notes enable row level security;
revoke all on public.patient_notes from public, anon, authenticated;
grant select on public.patient_notes to authenticated;
grant all on public.patient_notes to service_role;
create policy patient_notes_read_own on public.patient_notes for select to authenticated
  using (owner_id = (select auth.uid()));

create trigger patient_notes_updated before update on public.patient_notes
  for each row execute function document_private.touch_document();

-- Writing a new note needs the module, like creating a patient.
create function public.create_patient_note(patient_id uuid, body text)
returns public.patient_notes language plpgsql security definer set search_path = '' as $$
declare note public.patient_notes;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform document_private.require_patient_records();
  if not exists(select 1 from public.patients p where p.id = create_patient_note.patient_id and p.owner_id = auth.uid()) then
    raise exception 'patient_not_available' using errcode = '42501';
  end if;
  insert into public.patient_notes(patient_id, owner_id, body)
    values(create_patient_note.patient_id, auth.uid(), btrim(create_patient_note.body))
    returning * into note;
  return note;
end;
$$;

-- Correcting a note does not need the module: the owner always keeps the right to rectify (LGPD).
create function public.update_patient_note(note_id uuid, body text)
returns public.patient_notes language plpgsql security definer set search_path = '' as $$
declare note public.patient_notes;
begin
  update public.patient_notes n set body = btrim(update_patient_note.body)
    where n.id = update_patient_note.note_id and n.owner_id = auth.uid()
    returning * into note;
  if not found then raise exception 'note_not_available' using errcode = '42501'; end if;
  return note;
end;
$$;

-- delete_patient also refuses a patient with notes (replaces the version of 20261009000100).
create or replace function public.delete_patient(patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.patients p where p.id = delete_patient.patient_id and p.owner_id = auth.uid() for update;
  if not found then raise exception 'patient_not_available' using errcode = '42501'; end if;
  if exists(select 1 from public.documents d where d.patient_id = delete_patient.patient_id) then
    raise exception 'patient_has_documents' using errcode = '23503';
  end if;
  if exists(select 1 from public.patient_notes n where n.patient_id = delete_patient.patient_id) then
    raise exception 'patient_has_notes' using errcode = '23503';
  end if;
  delete from public.patients p where p.id = delete_patient.patient_id;
end;
$$;

revoke all on function public.create_patient_note(uuid, text), public.update_patient_note(uuid, text)
  from public, anon;
grant execute on function public.create_patient_note(uuid, text), public.update_patient_note(uuid, text) to authenticated;
