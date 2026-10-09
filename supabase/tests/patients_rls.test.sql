begin;
create extension if not exists pgtap with schema extensions;
select plan(44);
-- A and B have the patient-records module; C had it and it expired (and is also admin).
insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-000000000001','a@patients.test'),
 ('50000000-0000-0000-0000-000000000002','b@patients.test'),
 ('50000000-0000-0000-0000-000000000003','c@patients.test');
insert into public.app_admins(user_id,created_by) values ('50000000-0000-0000-0000-000000000003','test');
insert into public.module_grants(user_id,module_id,granted_at,expires_at) values
 ('50000000-0000-0000-0000-000000000001','patient-records',now(),now() + interval '30 days'),
 ('50000000-0000-0000-0000-000000000002','patient-records',now(),now() + interval '30 days'),
 ('50000000-0000-0000-0000-000000000003','patient-records',now() - interval '40 days',now() - interval '10 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select u, 'patient-records', m.terms_version from public.analysis_modules m,
   unnest(array['50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003']::uuid[]) u
 where m.id = 'patient-records';
-- C's record and document from when the grant was active.
insert into public.patients(id,owner_id,display_name) values
 ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','Paciente de C');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status,patient_id) values
 ('70000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','Laudo C',
 '50000000-0000-0000-0000-000000000003/70000000-0000-0000-0000-000000000003/original','application/pdf','uploaded',
 '60000000-0000-0000-0000-000000000003'),
 ('70000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000003','Laudo C sem paciente',
 '50000000-0000-0000-0000-000000000003/70000000-0000-0000-0000-000000000004/original','application/pdf','uploaded',null);

select is(document_private.valid_cpf('52998224725'),true,'valid CPF accepted');
select is(document_private.valid_cpf('52998224726'),false,'wrong check digit rejected');
select is(document_private.valid_cpf('11111111111'),false,'repeated digits rejected');

-- A (module active)
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_patient('Maria Souza','529.982.247-25','1980-05-10','female')$$,'creates patient with formatted CPF');
select is((select cpf from public.patients where display_name='Maria Souza'),'52998224725','CPF stored as digits');
select lives_ok($$select public.create_patient(' João Lima ')$$,'creates patient without CPF');
select is((select count(*) from public.patients where display_name='João Lima'),1::bigint,'name is trimmed');
select throws_ok($$select public.create_patient('X','529.982.247-26')$$,'22023',null,'invalid CPF rejected');
select throws_ok($$select public.create_patient('X','529982')$$,'22023',null,'partial CPF rejected');
select throws_ok($$select public.create_patient('Outra Maria','52998224725')$$,'23505',null,'same CPF twice for one doctor rejected');
select throws_ok($$select public.create_patient('X',null,(current_date + 1))$$,'22023',null,'future birth date rejected');
select throws_ok($$select public.create_patient('   ')$$,'23514',null,'empty name rejected');
select throws_ok($$select public.create_patient('X',null,null,'other')$$,'23514',null,'unknown sex rejected');
select throws_ok($$insert into public.patients(owner_id,display_name) values ('50000000-0000-0000-0000-000000000001','Direto')$$,'42501',null,'direct insert denied');
select throws_ok($$update public.patients set display_name='Direto'$$,'42501',null,'direct update denied');
select throws_ok($$update public.documents set patient_id=null$$,'42501',null,'document patient cannot be changed directly');
select is((select count(*) from public.list_patients()),2::bigint,'lists own patients');
select is((select count(*) from public.list_patients('MARIA')),1::bigint,'name search ignores case');
select is((select count(*) from public.list_patients('529.982.247-25')),1::bigint,'full CPF finds patient');
select is((select count(*) from public.list_patients('529982')),0::bigint,'partial CPF finds nothing');
select is((select count(*) from public.list_patients('%')),0::bigint,'wildcards are literal');
select lives_ok($$select public.create_document('Hemograma','application/pdf',(select id from public.patients where display_name='João Lima'))$$,'uploads document linked to patient');
select is((select document_count from public.list_patients('João')),1::bigint,'document count per patient');
select throws_ok($$select public.create_document('X','application/pdf','60000000-0000-0000-0000-000000000003')$$,'42501',null,'cannot upload to another doctor''s patient');
select throws_ok($$select public.delete_patient((select id from public.patients where display_name='João Lima'))$$,'23503',null,'patient with documents cannot be deleted');
select throws_ok($$select public.set_document_patient('70000000-0000-0000-0000-000000000004',null)$$,'42501',null,'cannot unlink another doctor''s document');

-- Ordering: most recent activity first (adjusted as superuser, since now() is fixed inside the transaction).
reset role;
update public.patients set created_at = '2026-01-01' where display_name = 'João Lima';
update public.patients set created_at = '2026-02-01', id = '60000000-0000-0000-0000-000000000001' where display_name = 'Maria Souza';
update public.documents set created_at = '2026-03-01' where name = 'Hemograma';
update public.documents set status = 'uploaded' where name = 'Hemograma';
set local role authenticated;
select is((select display_name from public.list_patients() limit 1),'João Lima','patient with the latest document comes first');
select lives_ok($$select public.share_document((select id from public.documents where name='Hemograma'),'b@patients.test')$$,'shares linked document with B');

-- B (module active, another doctor)
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.patients),0::bigint,'B does not see A''s patients');
select is((select count(*) from public.list_patients()),0::bigint,'B lists no patients');
select is((select count(*) from public.documents where name='Hemograma'),1::bigint,'B reads the shared document');
select is((select count(*) from public.patients p join public.documents d on d.patient_id = p.id),0::bigint,'shared document does not reveal the patient');
select throws_ok($$select public.update_patient('60000000-0000-0000-0000-000000000001','X')$$,'42501',null,'B cannot update A''s patient');
select throws_ok($$select public.delete_patient('60000000-0000-0000-0000-000000000001')$$,'42501',null,'B cannot delete another doctor''s patient');
select lives_ok($$select public.create_patient('Maria de B','52998224725')$$,'another doctor may register the same CPF');

-- C (grant expired, also admin)
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.patients),1::bigint,'admin sees only own patients');
select throws_ok($$select public.create_patient('Novo')$$,'42501',null,'expired grant cannot create patients');
select throws_ok($$select public.set_document_patient('70000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000003')$$,'42501',null,'expired grant cannot link documents');
select throws_ok($$select public.create_document('X','application/pdf','60000000-0000-0000-0000-000000000003')$$,'42501',null,'expired grant cannot upload to a patient');
select lives_ok($$select public.update_patient('60000000-0000-0000-0000-000000000003','Paciente corrigido','111.444.777-35')$$,'expired grant can still correct a record');
select is((select count(*) from public.list_patients('11144477735')),1::bigint,'expired grant can still list and search');
select lives_ok($$select public.set_document_patient('70000000-0000-0000-0000-000000000003',null)$$,'expired grant can unlink documents');
select lives_ok($$select public.delete_patient('60000000-0000-0000-0000-000000000003')$$,'patient without documents is deleted');
select is((select count(*) from public.patients),0::bigint,'deleted patient is gone');

select * from finish();
rollback;
