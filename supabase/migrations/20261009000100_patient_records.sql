-- FASE 04 (adiantada em 09/10/2026): módulo "Gestão por paciente" (docs/exam-comparison.md).
-- A patient is a record owned by one doctor, never an account. Linking a document to a patient is optional.
-- Without an active grant the owner can still read, correct, unlink and delete; only creating and linking need it.

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  cpf text check (cpf ~ '^[0-9]{11}$'),
  birth_date date check (birth_date >= date '1900-01-01'),
  sex text check (sex in ('female', 'male')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the documents foreign key, so a document can only point to a patient of its own owner.
  unique (id, owner_id)
);
create index patients_owner_idx on public.patients(owner_id, created_at desc);
-- The same doctor cannot register the same person twice.
create unique index patients_owner_cpf_idx on public.patients(owner_id, cpf) where cpf is not null;

-- Restrict: a patient with linked documents cannot be deleted (decided 09/10/2026).
alter table public.documents add column patient_id uuid;
alter table public.documents add constraint documents_patient_same_owner
  foreign key (patient_id, owner_id) references public.patients(id, owner_id) on delete restrict;
create index documents_patient_idx on public.documents(patient_id, created_at desc) where patient_id is not null;

alter table public.patients enable row level security;
revoke all on public.patients from public, anon, authenticated;
grant select on public.patients to authenticated;
grant all on public.patients to service_role;
-- Only the owner reads; the admin and doctors who receive a shared document never see the record.
create policy patients_read_own on public.patients for select to authenticated
  using (owner_id = (select auth.uid()));

create trigger patients_updated before update on public.patients
  for each row execute function document_private.touch_document();

-- Brazilian CPF check digits; also rejects repeated digits such as 111.111.111-11.
create function document_private.valid_cpf(cpf text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare total int; digit int;
begin
  if cpf is null or cpf !~ '^[0-9]{11}$' or cpf ~ '^(.)\1{10}$' then return false; end if;
  for pos in 10..11 loop
    total := 0;
    for i in 1..pos - 1 loop
      total := total + substr(cpf, i, 1)::int * (pos + 1 - i);
    end loop;
    digit := (total * 10) % 11 % 10;
    if digit <> substr(cpf, pos, 1)::int then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.patients add constraint patients_cpf_valid check (cpf is null or document_private.valid_cpf(cpf));

-- Normalizes caller input: strips punctuation, empty means no CPF, invalid is rejected.
create function document_private.normalize_cpf(cpf text)
returns text language plpgsql immutable set search_path = '' as $$
declare digits text := regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g');
begin
  if digits = '' and btrim(coalesce(cpf, '')) = '' then return null; end if;
  if not document_private.valid_cpf(digits) then raise exception 'invalid_cpf' using errcode = '22023'; end if;
  return digits;
end;
$$;

create function document_private.check_birth_date(birth_date date)
returns void language plpgsql stable set search_path = '' as $$
begin
  if birth_date is not null and (birth_date > current_date or birth_date < date '1900-01-01') then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
end;
$$;

create function document_private.require_patient_records()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not module_private.can_use_module('patient-records') then
    raise exception 'module_not_available' using errcode = '42501';
  end if;
end;
$$;
revoke all on function document_private.valid_cpf(text), document_private.normalize_cpf(text),
  document_private.check_birth_date(date), document_private.require_patient_records() from public, anon, authenticated;
-- The CPF check constraint also runs for server-side writes.
grant usage on schema document_private to service_role;
grant execute on function document_private.valid_cpf(text) to service_role;

create function public.create_patient(display_name text, cpf text default null, birth_date date default null, sex text default null)
returns public.patients language plpgsql security definer set search_path = '' as $$
declare patient public.patients;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform document_private.require_patient_records();
  perform document_private.check_birth_date(create_patient.birth_date);
  insert into public.patients(owner_id, display_name, cpf, birth_date, sex)
    values(auth.uid(), btrim(create_patient.display_name), document_private.normalize_cpf(create_patient.cpf),
      create_patient.birth_date, nullif(create_patient.sex, ''))
    returning * into patient;
  return patient;
end;
$$;

-- Correcting a record does not need the module: the owner always keeps the right to rectify (LGPD).
create function public.update_patient(patient_id uuid, display_name text, cpf text default null, birth_date date default null, sex text default null)
returns public.patients language plpgsql security definer set search_path = '' as $$
declare patient public.patients;
begin
  perform document_private.check_birth_date(update_patient.birth_date);
  update public.patients p set display_name = btrim(update_patient.display_name),
      cpf = document_private.normalize_cpf(update_patient.cpf),
      birth_date = update_patient.birth_date, sex = nullif(update_patient.sex, '')
    where p.id = update_patient.patient_id and p.owner_id = auth.uid()
    returning * into patient;
  if not found then raise exception 'patient_not_available' using errcode = '42501'; end if;
  return patient;
end;
$$;

create function public.delete_patient(patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.patients p where p.id = delete_patient.patient_id and p.owner_id = auth.uid() for update;
  if not found then raise exception 'patient_not_available' using errcode = '42501'; end if;
  if exists(select 1 from public.documents d where d.patient_id = delete_patient.patient_id) then
    raise exception 'patient_has_documents' using errcode = '23503';
  end if;
  delete from public.patients p where p.id = delete_patient.patient_id;
end;
$$;

-- Links a document to a patient (needs the module) or unlinks it with a null patient (always allowed).
create function public.set_document_patient(document_id uuid, patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if set_document_patient.patient_id is not null then
    perform document_private.require_patient_records();
    if not exists(select 1 from public.patients p where p.id = set_document_patient.patient_id and p.owner_id = auth.uid()) then
      raise exception 'patient_not_available' using errcode = '42501';
    end if;
  end if;
  update public.documents d set patient_id = set_document_patient.patient_id
    where d.id = set_document_patient.document_id and d.owner_id = auth.uid() and d.status <> 'deleting';
  if not found then raise exception 'document_not_available' using errcode = '42501'; end if;
end;
$$;

-- Most recent first: last linked document, or the registration date for a patient without documents.
-- A search of 11 digits (with or without punctuation) is an exact CPF match; anything else matches the name.
create function public.list_patients(search text default null, page_offset int default 0)
returns table(id uuid, display_name text, cpf text, birth_date date, sex text, created_at timestamptz,
  document_count bigint, last_activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with term as (
    select btrim(coalesce(list_patients.search, '')) as raw,
      regexp_replace(coalesce(list_patients.search, ''), '[^0-9]', '', 'g') as digits
  )
  select p.id, p.display_name, p.cpf, p.birth_date, p.sex, p.created_at, count(d.id),
      greatest(p.created_at, max(d.created_at))
    from public.patients p
    cross join term t
    left join public.documents d on d.patient_id = p.id
    where p.owner_id = (select auth.uid())
      and (t.raw = ''
        or (t.raw ~ '^[0-9.\- ]+$' and length(t.digits) = 11 and p.cpf = t.digits)
        or (t.raw !~ '^[0-9.\- ]+$' and p.display_name ilike '%' || replace(replace(replace(t.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
    group by p.id
    order by greatest(p.created_at, max(d.created_at)) desc, p.id
    limit 20 offset greatest(coalesce(list_patients.page_offset, 0), 0);
$$;

-- Same as before, plus an optional patient. Linking at upload needs the module, like set_document_patient.
drop function public.create_document(text, text);
create function public.create_document(document_name text, content_type text, patient_id uuid default null)
returns public.documents language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); doc_id uuid := gen_random_uuid(); doc public.documents;
begin
  if actor is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if content_type is null or content_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'unsupported_file_type' using errcode = '22023';
  end if;
  if create_document.patient_id is not null then
    perform document_private.require_patient_records();
    if not exists(select 1 from public.patients p where p.id = create_document.patient_id and p.owner_id = actor) then
      raise exception 'patient_not_available' using errcode = '42501';
    end if;
  end if;
  insert into public.documents(id, owner_id, name, storage_path, mime_type, patient_id)
    values(doc_id, actor, btrim(document_name), actor::text || '/' || doc_id::text || '/original', content_type, create_document.patient_id)
    returning * into doc;
  return doc;
end;
$$;

revoke all on function public.create_patient(text, text, date, text), public.update_patient(uuid, text, text, date, text),
  public.delete_patient(uuid), public.set_document_patient(uuid, uuid), public.list_patients(text, int),
  public.create_document(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_patient(text, text, date, text), public.update_patient(uuid, text, text, date, text),
  public.delete_patient(uuid), public.set_document_patient(uuid, uuid), public.list_patients(text, int),
  public.create_document(text, text, uuid) to authenticated;

-- The module itself. 'testing' makes it usable only by accounts with an active grant and accepted terms.
insert into public.analysis_modules(id, name, description, level, terms_version, status) values
  ('patient-records', 'Gestão por paciente',
   'Organiza os documentos por paciente, com busca por nome ou CPF. Não usa inteligência artificial.', 'A', '2026-10-09-draft', 'testing');
