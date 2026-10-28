begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
-- A and B have the patient-records module; C had it and it expired.
insert into auth.users(id,email) values
 ('52000000-0000-0000-0000-000000000001','a@rx.test'),
 ('52000000-0000-0000-0000-000000000002','b@rx.test'),
 ('52000000-0000-0000-0000-000000000003','c@rx.test');
insert into public.module_grants(user_id,module_id,granted_at,expires_at) values
 ('52000000-0000-0000-0000-000000000001','patient-records',now(),now() + interval '30 days'),
 ('52000000-0000-0000-0000-000000000002','patient-records',now(),now() + interval '30 days'),
 ('52000000-0000-0000-0000-000000000003','patient-records',now() - interval '40 days',now() - interval '10 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select u, 'patient-records', m.terms_version from public.analysis_modules m,
   unnest(array['52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000003']::uuid[]) u
 where m.id = 'patient-records';
insert into public.patients(id,owner_id,display_name) values
 ('62000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','Paciente de A'),
 ('62000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001','Paciente de A sem receitas'),
 ('62000000-0000-0000-0000-000000000003','52000000-0000-0000-0000-000000000003','Paciente de C');
insert into public.doctor_profiles(user_id,full_name,crm,crm_uf) values
 ('52000000-0000-0000-0000-000000000003','Dra. C','111','SP');

-- A (module active)
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.create_prescription('62000000-0000-0000-0000-000000000001','[{"medication":"Dipirona 500 mg","dosage":"1 comprimido se dor"}]')$$,
  '23514','doctor_profile_missing','a profile is required before prescribing');
select lives_ok($$select public.save_doctor_profile(' Dr. A ','12.345','sp','Clínica médica','999','Rua X, 10','(11) 9999-0000',null,array['address'])$$,'saves the profile');
select is((select crm || '/' || crm_uf || ' ' || full_name from public.doctor_profiles),'12345/SP Dr. A','CRM keeps only digits, UF upper case, name trimmed');
select throws_ok($$select public.save_doctor_profile('Dr. A','','SP')$$,'23514',null,'CRM is required');
select throws_ok($$select public.save_doctor_profile('Dr. A','1','XX')$$,'23514',null,'UF must be valid');
select throws_ok($$select public.save_doctor_profile('Dr. A','1','SP',printed => array['cpf'])$$,'23514',null,'only known fields can be printed');
select lives_ok($$select public.create_prescription('62000000-0000-0000-0000-000000000001',
  '[{"medication":"  Amoxicilina 500 mg ","dosage":"1 cápsula de 8/8 h por 7 dias","quantity":"21 cápsulas","extra":"x"}]','  Retorno em 7 dias. ')$$,'writes a prescription');
select is((select items from public.prescriptions),
  '[{"medication":"Amoxicilina 500 mg","dosage":"1 cápsula de 8/8 h por 7 dias","quantity":"21 cápsulas"}]'::jsonb,'items trimmed, unknown fields dropped');
select is((select notes from public.prescriptions),'Retorno em 7 dias.','notes trimmed');
select is((select prescriber from public.prescriptions),'{"full_name":"Dr. A","crm":"12345","crm_uf":"SP","address":"Rua X, 10"}'::jsonb,
  'header has name, CRM and only the chosen optional fields');
select is((select patient_name from public.prescriptions),'Paciente de A','patient name copied');
select lives_ok($$select public.save_doctor_profile('Dr. A','12345','SP',address => 'Rua Nova, 20',printed => array['address'])$$,'changes the profile');
select is((select prescriber->>'address' from public.prescriptions),'Rua X, 10','an issued prescription keeps the header it was printed with');
select throws_ok($$select public.create_prescription('62000000-0000-0000-0000-000000000001','[]')$$,'23514','invalid_prescription_items','at least one item');
select throws_ok($$select public.create_prescription('62000000-0000-0000-0000-000000000001','[{"medication":"X","dosage":"  "}]')$$,'23514','invalid_prescription_items','dosage required');
select throws_ok($$select public.create_prescription('62000000-0000-0000-0000-000000000003','[{"medication":"X","dosage":"Y"}]')$$,'42501',null,'cannot prescribe for another doctor''s patient');
select throws_ok($$update public.prescriptions set notes='Direto'$$,'42501',null,'direct update denied');
select throws_ok($$delete from public.prescriptions$$,'42501',null,'prescriptions cannot be deleted');
select throws_ok($$select public.delete_patient('62000000-0000-0000-0000-000000000001')$$,'23503','patient_has_prescriptions','patient with prescriptions cannot be deleted');

-- B sees nothing of A
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.prescriptions) + (select count(*) from public.doctor_profiles),0::bigint,'another doctor reads no prescriptions or profiles');

-- C (module expired): keeps the profile, cannot prescribe
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.save_doctor_profile('Dra. C','111','RJ')$$,'expired module still corrects the profile');
select throws_ok($$select public.create_prescription('62000000-0000-0000-0000-000000000003','[{"medication":"X","dosage":"Y"}]')$$,'42501','module_not_available','expired module cannot prescribe');

select * from finish();
rollback;
