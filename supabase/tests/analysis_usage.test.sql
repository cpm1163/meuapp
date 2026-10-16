begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
-- A starts an analysis; B is another user. The usage record must survive the deletion of A's document.
insert into auth.users(id,email) values
 ('71000000-0000-0000-0000-00000000000a','usage-a@analysis.test'),
 ('71000000-0000-0000-0000-00000000000b','usage-b@analysis.test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('81000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-00000000000a','Laudo A',
  '71000000-0000-0000-0000-00000000000a/81000000-0000-0000-0000-000000000001/original','application/pdf','uploaded');
update public.analysis_modules set status='testing' where id='lab-report';
insert into public.module_grants(user_id,module_id,expires_at) values
 ('71000000-0000-0000-0000-00000000000a','lab-report',now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select '71000000-0000-0000-0000-00000000000a', 'lab-report', terms_version from public.analysis_modules where id='lab-report';
create temp table ids(name text primary key, id uuid);
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-00000000000a',true);
select lives_ok($$insert into ids select 'a', id from public.start_document_analysis('81000000-0000-0000-0000-000000000001','lab-report')$$,
  'A starts an analysis');
select is((select row(requested_by, module_id, recorded_at is null, input_tokens is null)::text from public.analysis_usage
  where analysis_id = (select id from ids where name='a')),
  '(71000000-0000-0000-0000-00000000000a,lab-report,t,t)', 'start creates the usage row, without tokens yet');
select is((select u.created_at from public.analysis_usage u where u.analysis_id = (select id from ids where name='a')),
  (select a.created_at from public.document_analyses a where a.id = (select id from ids where name='a')),
  'usage row keeps the start time of the analysis');

-- Users cannot write the usage record or record tokens
select throws_ok($$insert into public.analysis_usage(analysis_id,requested_by,module_id,created_at)
  values (gen_random_uuid(),'71000000-0000-0000-0000-00000000000a','lab-report',now())$$, '42501', null, 'user cannot insert usage');
select throws_ok($$update public.analysis_usage set input_tokens = 0, output_tokens = 0, recorded_at = now()$$,
  '42501', null, 'user cannot update usage');
select throws_ok($$delete from public.analysis_usage$$, '42501', null, 'user cannot delete usage');
select throws_ok($$select public.record_analysis_usage((select id from ids where name='a'),'m',1,1)$$,
  '42501', null, 'user cannot record tokens');

-- Each user reads only their own usage
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-00000000000b',true);
select is((select count(*) from public.analysis_usage),0::bigint,'other user sees no usage of A');
reset role;
set local role anon;
select throws_ok($$select * from public.analysis_usage$$,'42501',null,'anon cannot read usage');

-- The server records the tokens once
reset role;
set local role service_role;
select lives_ok($$select public.fail_document_analysis((select id from ids where name='a'),'no_lab_exams','claude-opus-5-5')$$,
  'server finishes the analysis');
select lives_ok($$select public.record_analysis_usage((select id from ids where name='a'),'claude-opus-5-5',9000,1500)$$,
  'server records the tokens');
select lives_ok($$select public.record_analysis_usage((select id from ids where name='a'),'claude-opus-5-5',1,1)$$,
  'a second record is ignored without error');
select is((select row(model, input_tokens, output_tokens, recorded_at is not null)::text from public.analysis_usage
  where analysis_id = (select id from ids where name='a')), '(claude-opus-5-5,9000,1500,t)', 'first record is kept');

-- Deleting the document deletes the analysis but keeps the usage, which still counts for the daily limit
reset role;
delete from public.documents where id='81000000-0000-0000-0000-000000000001';
select is((select count(*) from public.document_analyses where id = (select id from ids where name='a')),0::bigint,
  'analysis is deleted with the document');
select is((select count(*) from public.analysis_usage where analysis_id = (select id from ids where name='a')),1::bigint,
  'usage survives the deletion of the document');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-00000000000a',true);
select is((select used from public.get_analysis_quota()),1,'deleted analysis still counts in the daily quota');
select is((select input_tokens from public.analysis_usage),9000,'A still reads the usage of the deleted analysis');

select * from finish();
rollback;
