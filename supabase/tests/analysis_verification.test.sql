begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
-- A has a ready analysis; the double check (verify-analysis) records its result and the tokens of the reread.
insert into auth.users(id,email) values ('72000000-0000-0000-0000-00000000000a','verify-a@analysis.test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('82000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-00000000000a','Laudo A',
  '72000000-0000-0000-0000-00000000000a/82000000-0000-0000-0000-000000000001/original','application/pdf','uploaded');
update public.analysis_modules set status='testing' where id='lab-report';
insert into public.module_grants(user_id,module_id,expires_at) values
 ('72000000-0000-0000-0000-00000000000a','lab-report',now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select '72000000-0000-0000-0000-00000000000a', 'lab-report', terms_version from public.analysis_modules where id='lab-report';
create temp table ids(name text primary key, id uuid);
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000a',true);
insert into ids select 'a', id from public.start_document_analysis('82000000-0000-0000-0000-000000000001','lab-report');
select throws_ok($$select public.record_analysis_verification((select id from ids where name='a'),'{"status":"done"}')$$,
  '42501',null,'users cannot record the check');
select throws_ok($$select public.add_analysis_usage((select id from ids where name='a'),1,1)$$,
  '42501',null,'users cannot add tokens');

reset role;
set local role service_role;
select throws_ok($$select public.record_analysis_verification((select id from ids where name='a'),'{"status":"running"}')$$,
  '42501','analysis_not_available','a processing analysis is not checked');
select public.complete_document_analysis((select id from ids where name='a'),'{"exams":[]}','[]','claude-haiku-5-5');
select public.record_analysis_usage((select id from ids where name='a'),'claude-haiku-5-5',1000,500);
select lives_ok($$select public.record_analysis_verification((select id from ids where name='a'),'{"status":"running"}')$$,
  'records the check of a ready analysis');
select is((select verification->>'status' from public.document_analyses where id=(select id from ids where name='a')),'running','status stored');
select is((select extraction from public.document_analyses where id=(select id from ids where name='a')),'{"exams":[]}'::jsonb,
  'without an extraction the reading is kept');
select lives_ok($$select public.record_analysis_verification((select id from ids where name='a'),'{"status":"done"}',
  '{"exams":[{"exam_name":"PSA Total"}]}','[{"kind":"lab_note"}]')$$,'records the check with the recovered exam');
select is((select extraction->'exams'->0->>'exam_name' from public.document_analyses where id=(select id from ids where name='a')),
  'PSA Total','extraction replaced');
select lives_ok($$select public.add_analysis_usage((select id from ids where name='a'),200,50)$$,'adds the reread tokens');
select is((select row(input_tokens, output_tokens)::text from public.analysis_usage where analysis_id=(select id from ids where name='a')),
  '(1200,550)','tokens summed');

select * from finish();
rollback;
