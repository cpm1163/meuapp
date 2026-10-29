begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
-- A has the patient-records module; B never had it.
insert into auth.users(id,email) values
 ('a1000000-0000-0000-0000-000000000001','a@alerts.test'),
 ('a1000000-0000-0000-0000-000000000002','b@alerts.test');
insert into public.module_grants(user_id,module_id,granted_at,expires_at) values
 ('a1000000-0000-0000-0000-000000000001','patient-records',now(),now() + interval '30 days');
insert into public.patients(id,owner_id,display_name) values
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Paciente de A');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Laudo de A',
  'a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/original','application/pdf','pending_upload'),
 ('a3000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','Laudo de B',
  'a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000002/original','application/pdf','uploaded');

select is((select count(*)::int from public.alerts),0,'no alert while the upload is pending');
update public.documents set status='uploaded' where id='a3000000-0000-0000-0000-000000000001';
select is((select kind from public.alerts where document_id='a3000000-0000-0000-0000-000000000001'),'document_unassigned','uploaded without patient creates the alert');
select is((select count(*)::int from public.alerts where user_id='a1000000-0000-0000-0000-000000000002'),0,'no unassigned alert without the module');

update public.documents set patient_id='a2000000-0000-0000-0000-000000000001' where id='a3000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.alerts where document_id='a3000000-0000-0000-0000-000000000001'),0,'linking a patient resolves the alert');
update public.documents set patient_id=null where id='a3000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.alerts where document_id='a3000000-0000-0000-0000-000000000001'),1,'unlinking creates it again');

-- B shares a document with A.
insert into public.document_shares(document_id,user_id) values('a3000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.alerts where kind='document_shared' and user_id='a1000000-0000-0000-0000-000000000001'),1,'sharing alerts the recipient');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.alerts),0,'B does not see A''s alerts');
select is_empty($$delete from public.alerts returning id$$,'B cannot delete A''s alerts');

select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select is((select count(*)::int from public.alerts),2,'A sees own alerts');
select lives_ok($$update public.alerts set read_at=now() where kind='document_shared'$$,'A marks an alert as read');
select throws_ok($$update public.alerts set kind='document_unassigned'$$,'42501',null,'A cannot change other columns');
select lives_ok($$delete from public.alerts where kind='document_unassigned'$$,'A deletes an alert');
reset role;

-- A deleted alert does not return when the document changes status.
update public.documents set status='processing' where id='a3000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.alerts where document_id='a3000000-0000-0000-0000-000000000001'),0,'deleted alert stays deleted');
select is((select count(*)::int from public.documents where id='a3000000-0000-0000-0000-000000000001'),1,'deleting the alert keeps the document');

select * from finish();
rollback;
