begin;
create extension if not exists pgtap with schema extensions;
select plan(42);
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','owner@document.test'),
 ('10000000-0000-0000-0000-000000000002','reader@document.test'),
 ('10000000-0000-0000-0000-000000000003','outsider@document.test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Private PDF',
 '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/original','application/pdf','uploaded');

-- Simulate unrelated broad policies already present in a project. Restrictive boundaries must win.
create policy test_broad_storage_policy on storage.objects for all to public using (true) with check (true);
insert into storage.objects(bucket_id,name,metadata) values ('documents',
 '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/original',
 '{"size":64,"mimetype":"application/pdf"}');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.documents),1::bigint,'owner sees own document');
select is((select count(*) from storage.objects where bucket_id='documents'),1::bigint,'owner sees own file');
select throws_ok($$insert into storage.objects(bucket_id,name) values('documents','unreserved')$$,'42501',null,'broad policy cannot allow unreserved upload');
select lives_ok($$select public.create_document('New PDF','application/pdf')$$,'owner creates reservation');
select is((select count(*) from public.documents where owner_id = auth.uid()),2::bigint,'reservation belongs to caller');
select throws_ok($$insert into public.documents(owner_id,name,storage_path) values ('10000000-0000-0000-0000-000000000002','Forged','forged')$$,'42501',null,'cannot forge owner through insert');
select throws_ok($$update public.documents set owner_id='10000000-0000-0000-0000-000000000002'$$,'42501',null,'cannot transfer ownership');
select throws_ok($$update public.documents set storage_path='other'$$,'42501',null,'cannot move file');
select throws_ok($$update public.documents set status='ready'$$,'42501',null,'cannot forge status');
select lives_ok($$update public.documents set name='Renamed' where id='20000000-0000-0000-0000-000000000001'$$,'owner can rename');
select throws_ok($$select public.share_document('20000000-0000-0000-0000-000000000001','owner@document.test')$$,'22023',null,'self share rejected');
select throws_ok($$select public.share_document('20000000-0000-0000-0000-000000000001','missing@document.test')$$,'22023',null,'unknown recipient rejected');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.documents),0::bigint,'reader has no access before share');
select is((select count(*) from storage.objects where bucket_id='documents'),0::bigint,'broad policy cannot leak unshared file');
select throws_ok($$select public.share_document('20000000-0000-0000-0000-000000000001','reader@document.test')$$,'42501',null,'reader cannot self grant');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.share_document('20000000-0000-0000-0000-000000000001','reader@document.test')$$,'owner grants reader');
select throws_ok($$select public.share_document('20000000-0000-0000-0000-000000000001','reader@document.test')$$,'23505',null,'duplicate share rejected');
select is((select count(*) from public.document_shares),1::bigint,'owner sees recipients');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.documents),0::bigint,'outsider sees no documents');
select is((select count(*) from storage.objects where bucket_id='documents'),0::bigint,'outsider cannot see file with broad policy');
select is((select count(*) from public.document_shares),0::bigint,'outsider sees no recipients');
select throws_ok($$select public.share_document('20000000-0000-0000-0000-000000000001','outsider@document.test')$$,'42501',null,'outsider cannot self grant');
select throws_ok($$select public.begin_document_delete('20000000-0000-0000-0000-000000000001')$$,'42501',null,'outsider cannot delete');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.documents),1::bigint,'reader sees shared document only');
select is((select count(*) from storage.objects where bucket_id='documents'),1::bigint,'reader sees shared file');
with changed as (update storage.objects set metadata='{}' where bucket_id='documents' returning id) select is((select count(*) from changed),0::bigint,'broad policy cannot allow object replacement');
select is((select count(*) from public.document_shares),1::bigint,'reader sees own membership');
with changed as (update public.documents set name='Hacked' returning id) select is((select count(*) from changed),0::bigint,'reader cannot rename');
select throws_ok($$delete from public.documents$$,'42501',null,'direct deletion forbidden');
select throws_ok($$select public.begin_document_delete('20000000-0000-0000-0000-000000000001')$$,'42501',null,'reader cannot begin deletion');
select throws_ok($$update public.document_shares set permission='owner'$$,'42501',null,'reader cannot escalate');
select throws_ok($$select public.complete_document_upload('20000000-0000-0000-0000-000000000001')$$,'42501',null,'reader cannot finalize upload');
with removed as (delete from public.document_shares returning user_id) select is((select count(*) from removed),0::bigint,'reader cannot revoke');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$delete from public.document_shares where document_id='20000000-0000-0000-0000-000000000001'$$,'owner revokes');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.documents),0::bigint,'revocation removes read access');
select is((select count(*) from storage.objects where bucket_id='documents'),0::bigint,'revocation removes Storage access');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from storage.objects where bucket_id='documents'),0::bigint,'broad policy cannot expose files anonymously');
select throws_ok($$select * from public.documents$$,'42501',null,'anonymous cannot read documents');
select throws_ok($$select * from public.document_shares$$,'42501',null,'anonymous cannot read shares');
select throws_ok($$select public.create_document('Anonymous','application/pdf')$$,'42501',null,'anonymous cannot create');

reset role;
select throws_ok($$insert into public.document_shares(document_id,user_id) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$$,'23514',null,'self share constraint also protects admin inserts');
select throws_ok($$insert into public.document_shares(document_id,user_id) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000099')$$,'23503',null,'nonexistent account rejected');
select * from finish();
rollback;
