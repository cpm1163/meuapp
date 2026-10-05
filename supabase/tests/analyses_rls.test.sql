begin;
create extension if not exists pgtap with schema extensions;
select plan(45);
-- A owns documents and has the module; B reads A's document and also has the module; C is unrelated; E is admin.
insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-00000000000a','owner@analysis.test'),
 ('50000000-0000-0000-0000-00000000000b','reader@analysis.test'),
 ('50000000-0000-0000-0000-00000000000c','other@analysis.test'),
 ('50000000-0000-0000-0000-00000000000e','admin@analysis.test');
insert into public.app_admins(user_id,created_by) values ('50000000-0000-0000-0000-00000000000e','test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-00000000000a','Laudo A',
  '50000000-0000-0000-0000-00000000000a/60000000-0000-0000-0000-000000000001/original','application/pdf','uploaded'),
 ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-00000000000a','Pendente A',
  '50000000-0000-0000-0000-00000000000a/60000000-0000-0000-0000-000000000002/original','application/pdf','pending_upload'),
 ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-00000000000c','Laudo C',
  '50000000-0000-0000-0000-00000000000c/60000000-0000-0000-0000-000000000003/original','application/pdf','uploaded');
insert into public.document_shares(document_id,user_id) values
 ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-00000000000b');
update public.analysis_modules set status='testing' where id='lab-report';
insert into public.module_grants(user_id,module_id,expires_at) values
 ('50000000-0000-0000-0000-00000000000a','lab-report',now() + interval '30 days'),
 ('50000000-0000-0000-0000-00000000000b','lab-report',now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select u, 'lab-report', terms_version from public.analysis_modules,
  unnest(array['50000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000b']::uuid[]) u
  where id='lab-report';
create temp table ids(name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- A starts an analysis on a module in testing
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select is(module_private.can_use_module('lab-report'),true,'testing module is usable with grant and terms');
select throws_ok($$insert into public.document_analyses(document_id,requested_by,module_id,terms_version)
  values ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-00000000000a','lab-report','x')$$,'42501',null,'user cannot insert analysis directly');
select throws_ok($$select public.start_document_analysis('60000000-0000-0000-0000-000000000002','lab-report')$$,'22023',null,'document not uploaded cannot be analyzed');
select throws_ok($$select public.start_document_analysis('60000000-0000-0000-0000-000000000003','lab-report')$$,'42501',null,'cannot analyze another user document');
select throws_ok($$select public.start_document_analysis('60000000-0000-0000-0000-000000000001','missing')$$,'42501',null,'unknown module rejected');
select lives_ok($$insert into ids select 'first', id from public.start_document_analysis('60000000-0000-0000-0000-000000000001','lab-report')$$,'owner starts analysis');
select is((select status from public.documents where id='60000000-0000-0000-0000-000000000001'),'processing','document is processing');
select is((select terms_version from public.document_analyses where id=(select id from ids where name='first')),
  (select terms_version from public.analysis_modules where id='lab-report'),'analysis records the accepted terms version');
select throws_ok($$select public.start_document_analysis('60000000-0000-0000-0000-000000000001','lab-report')$$,'55006',null,'second analysis rejected while one is in progress');
select throws_ok($$select public.complete_document_analysis((select id from ids where name='first'),'{}','[]','x')$$,'42501',null,'user cannot complete analysis');
select throws_ok($$select public.fail_document_analysis((select id from ids where name='first'),'provider_error')$$,'42501',null,'user cannot fail analysis');
select throws_ok($$update public.document_analyses set status='ready'$$,'42501',null,'user cannot update analysis directly');
select throws_ok($$delete from public.document_analyses$$,'42501',null,'user cannot delete analysis directly');
select throws_ok($$select public.set_analysis_shared((select id from ids where name='first'),true)$$,'22023',null,'analysis in progress cannot be shared');

-- B reads the document, has the module, but neither sees nor requests analyses of A
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000b',true);
select is((select count(*) from public.documents where id='60000000-0000-0000-0000-000000000001'),1::bigint,'reader sees the document');
select is((select count(*) from public.document_analyses),0::bigint,'reader does not see unshared analysis');
select throws_ok($$select public.start_document_analysis('60000000-0000-0000-0000-000000000001','lab-report')$$,'42501',null,'reader cannot request analysis');
select throws_ok($$select public.set_analysis_shared((select id from ids where name='first'),true)$$,'42501',null,'reader cannot share analysis');

-- Server finishes the analysis
reset role;
set local role service_role;
select lives_ok($$select public.complete_document_analysis((select id from ids where name='first'),
  '{"is_lab_report":true}','[]','claude-opus-5-5')$$,'server completes analysis');
select throws_ok($$select public.complete_document_analysis((select id from ids where name='first'),'{}','[]','x')$$,'22023',null,'completing twice rejected');
select is((select status from public.documents where id='60000000-0000-0000-0000-000000000001'),'ready','document is ready');
reset role;

-- A shares; B sees it; C and the admin never do
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select is((select status from public.document_analyses where id=(select id from ids where name='first')),'ready','owner sees finished analysis');
select is((select model from public.document_analyses where id=(select id from ids where name='first')),'claude-opus-5-5','analysis records the model');
select lives_ok($$select public.set_analysis_shared((select id from ids where name='first'),true)$$,'owner shares analysis');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000b',true);
select is((select count(*) from public.document_analyses),1::bigint,'reader sees shared analysis');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000c',true);
select is((select count(*) from public.document_analyses),0::bigint,'other user does not see shared analysis');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000e',true);
select is((select count(*) from public.document_analyses),0::bigint,'admin does not see analyses');

-- Unsharing and revoking the document share both remove the reader's access
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select lives_ok($$select public.set_analysis_shared((select id from ids where name='first'),false)$$,'owner unshares analysis');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000b',true);
select is((select count(*) from public.document_analyses),0::bigint,'reader loses access after unsharing');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select lives_ok($$select public.set_analysis_shared((select id from ids where name='first'),true)$$,'owner shares again');
select lives_ok($$delete from public.document_shares where document_id='60000000-0000-0000-0000-000000000001'$$,'owner revokes document share');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000b',true);
select is((select count(*) from public.document_analyses),0::bigint,'reader loses shared analysis when document share is revoked');

-- An abandoned analysis is replaced after the timeout; failures are recorded
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select lives_ok($$insert into ids select 'stale', id from public.start_document_analysis('60000000-0000-0000-0000-000000000001','lab-report')$$,'owner analyzes again');
reset role;
update public.document_analyses set created_at = now() - interval '20 minutes' where id=(select id from ids where name='stale');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select lives_ok($$insert into ids select 'retry', id from public.start_document_analysis('60000000-0000-0000-0000-000000000001','lab-report')$$,'abandoned analysis is replaced');
select is((select failure_reason from public.document_analyses where id=(select id from ids where name='stale')),'timeout','abandoned analysis fails with timeout');
reset role;
set local role service_role;
select lives_ok($$select public.fail_document_analysis((select id from ids where name='retry'),'not_lab_report','claude-opus-5-5')$$,'server records failure');
select is((select status from public.documents where id='60000000-0000-0000-0000-000000000001'),'failed','document is failed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000a',true);
select throws_ok($$select public.set_analysis_shared((select id from ids where name='retry'),true)$$,'22023',null,'failed analysis cannot be shared');

-- Deletion during an analysis keeps the document in 'deleting'; deleting the document removes analyses
select lives_ok($$insert into ids select 'deleted', id from public.start_document_analysis('60000000-0000-0000-0000-000000000001','lab-report')$$,'owner analyzes before deleting');
select lives_ok($$select public.begin_document_delete('60000000-0000-0000-0000-000000000001')$$,'owner starts deletion');
reset role;
set local role service_role;
select lives_ok($$select public.complete_document_analysis((select id from ids where name='deleted'),'{}','[]','x')$$,'server completes during deletion');
select is((select status from public.documents where id='60000000-0000-0000-0000-000000000001'),'deleting','document stays in deletion');
reset role;
delete from public.documents where id='60000000-0000-0000-0000-000000000001';
select is((select count(*) from public.document_analyses),0::bigint,'deleting the document removes its analyses');

-- Module no longer in testing/active, and anonymous access
update public.analysis_modules set status='draft' where id='lab-report';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-00000000000b',true);
select is(module_private.can_use_module('lab-report'),false,'draft module is not usable');
set local role anon;
select throws_ok($$select count(*) from public.document_analyses$$,'42501',null,'anon cannot read analyses');

select * from finish();
rollback;
