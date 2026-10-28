-- Receitas (docs/prescriptions.md, decided 28/10/2026): the doctor writes a prescription of common medicines for a
-- patient and prints it as PDF. No AI. Same access as the patient record: only the owner.

-- Doctor's data printed on the header. Name and CRM/UF are always printed; the doctor chooses the others.
create table public.doctor_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  crm text not null check (crm ~ '^[0-9]{1,10}$'),
  crm_uf text not null check (crm_uf in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
    'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  specialty text check (length(specialty) <= 120),
  rqe text check (length(rqe) <= 20),
  address text check (length(address) <= 300),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 120),
  -- Optional fields the doctor chose to print: subset of specialty, rqe, address, phone, email.
  printed text[] not null default '{}' check (printed <@ array['specialty','rqe','address','phone','email']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doctor_profiles enable row level security;
revoke all on public.doctor_profiles from public, anon, authenticated;
grant select on public.doctor_profiles to authenticated;
grant all on public.doctor_profiles to service_role;
create policy doctor_profiles_read_own on public.doctor_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create trigger doctor_profiles_updated before update on public.doctor_profiles
  for each row execute function document_private.touch_document();

-- Saving the profile does not need the module: it is the doctor's own data (right to rectify).
create function public.save_doctor_profile(full_name text, crm text, crm_uf text, specialty text default null,
  rqe text default null, address text default null, phone text default null, email text default null,
  printed text[] default '{}')
returns public.doctor_profiles language plpgsql security definer set search_path = '' as $$
declare profile public.doctor_profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.doctor_profiles(user_id, full_name, crm, crm_uf, specialty, rqe, address, phone, email, printed)
    values(auth.uid(), btrim(save_doctor_profile.full_name), regexp_replace(coalesce(save_doctor_profile.crm, ''), '[^0-9]', '', 'g'),
      upper(btrim(save_doctor_profile.crm_uf)), nullif(btrim(save_doctor_profile.specialty), ''), nullif(btrim(save_doctor_profile.rqe), ''),
      nullif(btrim(save_doctor_profile.address), ''), nullif(btrim(save_doctor_profile.phone), ''),
      nullif(btrim(save_doctor_profile.email), ''), coalesce(save_doctor_profile.printed, '{}'))
  on conflict (user_id) do update set full_name = excluded.full_name, crm = excluded.crm, crm_uf = excluded.crm_uf,
    specialty = excluded.specialty, rqe = excluded.rqe, address = excluded.address, phone = excluded.phone,
    email = excluded.email, printed = excluded.printed
  returning * into profile;
  return profile;
end;
$$;

-- A prescription is never changed or deleted: "Repetir" creates a new one. The header is copied from the profile
-- when it is issued, so printing it again later shows the same data.
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  owner_id uuid not null,
  -- [{medication, dosage, quantity}], 1 to 20 items.
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  notes text check (length(notes) <= 2000),
  -- {full_name, crm, crm_uf, and the optional fields chosen to print}.
  prescriber jsonb not null,
  patient_name text not null,
  created_at timestamptz not null default now(),
  -- Restrict: a patient with prescriptions cannot be deleted, like a patient with documents or notes.
  foreign key (patient_id, owner_id) references public.patients(id, owner_id) on delete restrict
);
create index prescriptions_patient_idx on public.prescriptions(patient_id, created_at desc);

alter table public.prescriptions enable row level security;
revoke all on public.prescriptions from public, anon, authenticated;
grant select on public.prescriptions to authenticated;
grant all on public.prescriptions to service_role;
create policy prescriptions_read_own on public.prescriptions for select to authenticated
  using (owner_id = (select auth.uid()));

-- Writing a prescription needs the module, like creating a patient or a note, and a profile with name and CRM.
create function public.create_prescription(patient_id uuid, items jsonb, notes text default null)
returns public.prescriptions language plpgsql security definer set search_path = '' as $$
declare
  prescription public.prescriptions;
  profile public.doctor_profiles;
  patient_name text;
  clean jsonb := '[]'::jsonb;
  item jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform document_private.require_patient_records();
  select p.display_name into patient_name from public.patients p
    where p.id = create_prescription.patient_id and p.owner_id = auth.uid();
  if not found then raise exception 'patient_not_available' using errcode = '42501'; end if;
  select * into profile from public.doctor_profiles d where d.user_id = auth.uid();
  if not found then raise exception 'doctor_profile_missing' using errcode = '23514'; end if;
  if jsonb_typeof(create_prescription.items) <> 'array' or jsonb_array_length(create_prescription.items) not between 1 and 20 then
    raise exception 'invalid_prescription_items' using errcode = '23514';
  end if;
  -- Only the three known fields are kept, trimmed; medication and dosage are required.
  for item in select value from jsonb_array_elements(create_prescription.items) loop
    if jsonb_typeof(item) <> 'object'
      or length(btrim(coalesce(item->>'medication', ''))) not between 1 and 200
      or length(btrim(coalesce(item->>'dosage', ''))) not between 1 and 500
      or length(btrim(coalesce(item->>'quantity', ''))) > 100 then
      raise exception 'invalid_prescription_items' using errcode = '23514';
    end if;
    clean := clean || jsonb_build_array(jsonb_build_object('medication', btrim(item->>'medication'),
      'dosage', btrim(item->>'dosage'), 'quantity', btrim(coalesce(item->>'quantity', ''))));
  end loop;
  insert into public.prescriptions(patient_id, owner_id, items, notes, prescriber, patient_name)
    values(create_prescription.patient_id, auth.uid(), clean, nullif(btrim(create_prescription.notes), ''),
      jsonb_strip_nulls(jsonb_build_object('full_name', profile.full_name, 'crm', profile.crm, 'crm_uf', profile.crm_uf,
        'specialty', case when 'specialty' = any(profile.printed) then profile.specialty end,
        'rqe', case when 'rqe' = any(profile.printed) then profile.rqe end,
        'address', case when 'address' = any(profile.printed) then profile.address end,
        'phone', case when 'phone' = any(profile.printed) then profile.phone end,
        'email', case when 'email' = any(profile.printed) then profile.email end)),
      patient_name)
    returning * into prescription;
  return prescription;
end;
$$;

-- delete_patient also refuses a patient with prescriptions (replaces the version of 20261027000100).
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
  if exists(select 1 from public.prescriptions r where r.patient_id = delete_patient.patient_id) then
    raise exception 'patient_has_prescriptions' using errcode = '23503';
  end if;
  delete from public.patients p where p.id = delete_patient.patient_id;
end;
$$;

revoke all on function public.save_doctor_profile(text, text, text, text, text, text, text, text, text[]),
  public.create_prescription(uuid, jsonb, text) from public, anon;
grant execute on function public.save_doctor_profile(text, text, text, text, text, text, text, text, text[]),
  public.create_prescription(uuid, jsonb, text) to authenticated;
