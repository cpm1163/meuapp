begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
-- A and B have the patient-records module; C had it and it expired.
insert into auth.users(id,email) values
 ('51000000-0000-0000-0000-000000000001','a@notes.test'),
 ('51000000-0000-0000-0000-000000000002','b@notes.test'),
 ('51000000-0000-0000-0000-000000000003','c@notes.test');
insert into public.module_grants(user_id,module_id,granted_at,expires_at) values
 ('51000000-0000-0000-0000-000000000001','patient-records',now(),now() + interval '30 days'),
 ('51000000-0000-0000-0000-000000000002','patient-records',now(),now() + interval '30 days'),
 ('51000000-0000-0000-0000-000000000003','patient-records',now() - interval '40 days',now() - interval '10 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select u, 'patient-records', m.terms_version from public.analysis_modules m,
   unnest(array['51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000003']::uuid[]) u
 where m.id = 'patient-records';
insert into public.patients(id,owner_id,display_name) values
 ('61000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','Paciente de A'),
 ('61000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001','Paciente de A sem anotações'),
 ('61000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000003','Paciente de C');
-- C's note from when the grant was active.
insert into public.patient_notes(id,patient_id,owner_id,body) values
 ('81000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000003','Anotação de C');

-- A (module active)
set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_patient_note('61000000-0000-0000-0000-000000000001','  Refere cansaço há duas semanas.  ')$$,'writes a note');
select is((select body from public.patient_notes where patient_id='61000000-0000-0000-0000-000000000001'),'Refere cansaço há duas semanas.','text is trimmed');
select lives_ok($$select public.create_patient_note('61000000-0000-0000-0000-000000000001','Retorno no mesmo dia.')$$,'a second note on the same day');
select is((select count(*) from public.patient_notes where patient_id='61000000-0000-0000-0000-000000000001'),2::bigint,'both notes kept');
select throws_ok($$select public.create_patient_note('61000000-0000-0000-0000-000000000001','   ')$$,'23514',null,'empty note rejected');
select throws_ok($$select public.create_patient_note('61000000-0000-0000-0000-000000000003','X')$$,'42501',null,'cannot write in another doctor''s patient');
select lives_ok($$select public.update_patient_note((select id from public.patient_notes where body='Retorno no mesmo dia.'),'Retorno no mesmo dia, corrigido.')$$,'corrects a note');
select is((select count(*) from public.patient_notes where body like 'Retorno%'),1::bigint,'only the corrected text is kept');
select throws_ok($$select public.update_patient_note('81000000-0000-0000-0000-000000000003','X')$$,'42501',null,'cannot correct another doctor''s note');
select throws_ok($$insert into public.patient_notes(patient_id,owner_id,body) values ('61000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','Direto')$$,'42501',null,'direct insert denied');
select throws_ok($$update public.patient_notes set body='Direto'$$,'42501',null,'direct update denied');
select throws_ok($$delete from public.patient_notes$$,'42501',null,'notes cannot be deleted');
select is((select count(*) from public.patient_notes),2::bigint,'reads only own notes');
select throws_ok($$select public.delete_patient('61000000-0000-0000-0000-000000000001')$$,'23503','patient_has_notes','patient with notes cannot be deleted');
select lives_ok($$select public.delete_patient('61000000-0000-0000-0000-000000000002')$$,'patient without notes or documents can be deleted');

-- B sees nothing of A
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.patient_notes),0::bigint,'another doctor reads no notes');
select throws_ok($$select public.create_patient_note('61000000-0000-0000-0000-000000000001','X')$$,'42501',null,'another doctor cannot write');

-- C (module expired): reads and corrects, cannot write a new note
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.patient_notes),1::bigint,'expired module still reads own notes');
select lives_ok($$select public.update_patient_note('81000000-0000-0000-0000-000000000003','Anotação de C corrigida')$$,'expired module still corrects');
select throws_ok($$select public.create_patient_note('61000000-0000-0000-0000-000000000003','Nova')$$,'42501','module_not_available','expired module cannot write a new note');

select * from finish();
rollback;
