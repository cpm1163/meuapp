begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(id,email) values ('90000000-0000-0000-0000-00000000000a','batch-a@analysis.test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-00000000000a','Laudo',
  '90000000-0000-0000-0000-00000000000a/91000000-0000-0000-0000-000000000001/original','application/pdf','uploaded');
update public.analysis_modules set status='testing' where id='lab-report';
insert into public.module_grants(user_id,module_id,expires_at) values
 ('90000000-0000-0000-0000-00000000000a','lab-report',now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select '90000000-0000-0000-0000-00000000000a', 'lab-report', terms_version from public.analysis_modules where id='lab-report';
create temp table ids(name text primary key, id uuid);
grant all on ids to authenticated, service_role;

select is(module_private.batch_timeout(),interval '25 hours','batch timeout is 25 hours');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-00000000000a',true);
select lives_ok($$insert into ids select 'first', id from public.start_document_analysis('91000000-0000-0000-0000-000000000001','lab-report')$$,'owner starts analysis');
select throws_ok($$select public.set_analysis_batch((select id from ids where name='first'),'msgbatch_x','m')$$,'42501',null,'user cannot record the batch');

reset role;
set local role service_role;
select throws_ok($$select public.set_analysis_batch((select id from ids where name='first'),'bad id!','m')$$,'23514',null,'malformed batch id rejected');
select lives_ok($$select public.set_analysis_batch((select id from ids where name='first'),'msgbatch_01abc','claude-opus-5-5')$$,'server records the batch');
select throws_ok($$select public.set_analysis_batch((select id from ids where name='first'),'msgbatch_02def','m')$$,'22023',null,'batch cannot be replaced');
select is((select provider_batch_id || ' ' || model from public.document_analyses where id=(select id from ids where name='first')),
  'msgbatch_01abc claude-opus-5-5','batch and model are recorded');
reset role;

-- A submitted batch is not abandoned after the short timeout, only after the batch timeout
update public.document_analyses set created_at = now() - interval '2 hours' where id=(select id from ids where name='first');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-00000000000a',true);
select throws_ok($$select public.start_document_analysis('91000000-0000-0000-0000-000000000001','lab-report')$$,'55006',null,
  'analysis with a batch is still in progress after 2 hours');
reset role;
update public.document_analyses set created_at = now() - interval '26 hours' where id=(select id from ids where name='first');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-00000000000a',true);
select lives_ok($$insert into ids select 'second', id from public.start_document_analysis('91000000-0000-0000-0000-000000000001','lab-report')$$,
  'analysis with a batch is replaced after 26 hours');
select is((select failure_reason from public.document_analyses where id=(select id from ids where name='first')),'timeout',
  'abandoned batch analysis fails with timeout');

reset role;
set local role service_role;
select lives_ok($$select public.fail_document_analysis((select id from ids where name='second'),'provider_error')$$,
  'analysis without a batch can still fail');

select * from finish();
rollback;
