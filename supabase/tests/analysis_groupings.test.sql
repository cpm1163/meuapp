begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
-- A owns two ready analyses and one in progress; B is another user with the module.
insert into auth.users(id,email) values
 ('72000000-0000-0000-0000-00000000000a','grouping-a@analysis.test'),
 ('72000000-0000-0000-0000-00000000000b','grouping-b@analysis.test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('82000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-00000000000a','Laudo A',
  '72000000-0000-0000-0000-00000000000a/82000000-0000-0000-0000-000000000001/original','application/pdf','ready');
insert into public.document_analyses(id,document_id,requested_by,module_id,terms_version,status,extraction,findings,completed_at) values
 ('92000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-00000000000a',
  'lab-report','t','ready','{}','[]',now()),
 ('92000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-00000000000a',
  'lab-report','t','ready','{}','[]',now());
insert into public.document_analyses(id,document_id,requested_by,module_id,terms_version) values
 ('92000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-00000000000a',
  'lab-report','t');
grant all on public.analysis_groupings to postgres;

set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000a',true);
select throws_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000001','grouping/1')$$,
  '42501', 'module_not_available', 'without the considerations module there is no grouping');

reset role;
insert into public.module_grants(user_id,module_id,expires_at) values
 ('72000000-0000-0000-0000-00000000000a','clinical-considerations',now() + interval '30 days'),
 ('72000000-0000-0000-0000-00000000000b','clinical-considerations',now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select u, 'clinical-considerations', terms_version from public.analysis_modules,
   unnest(array['72000000-0000-0000-0000-00000000000a','72000000-0000-0000-0000-00000000000b']::uuid[]) u
 where id='clinical-considerations';

set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000a',true);
select is((select row(status, version, requested_by)::text
  from public.start_analysis_grouping('92000000-0000-0000-0000-000000000001','grouping/1')),
  '(processing,grouping/1,72000000-0000-0000-0000-00000000000a)', 'A starts the grouping of a ready analysis');
select throws_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000001','grouping/1')$$,
  '23505', 'grouping_exists', 'a second start does not call the AI again');
select throws_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000003','grouping/1')$$,
  '22023', 'analysis_not_available', 'an analysis still in progress cannot be grouped');

-- Users cannot write groupings nor record results
select throws_ok($$insert into public.analysis_groupings(analysis_id,requested_by,version)
  values ('92000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-00000000000a','x')$$, '42501', null, 'user cannot insert');
select throws_ok($$update public.analysis_groupings set status = 'failed'$$, '42501', null, 'user cannot update');
select throws_ok($$select public.complete_analysis_grouping('92000000-0000-0000-0000-000000000001','[]','m',1,1)$$,
  '42501', null, 'user cannot record a result');

-- B cannot group or read A's analysis
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000b',true);
select throws_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000002','grouping/1')$$,
  '22023', 'analysis_not_available', 'B cannot group an analysis of A');
select is((select count(*)::int from public.analysis_groupings), 0, 'B reads no grouping of A');

-- The server records the result; A reads it
reset role;
set local role service_role;
select lives_ok($$select public.complete_analysis_grouping('92000000-0000-0000-0000-000000000001',
  '[{"title":"Perfil lipídico","parameter_ids":["0.0"]}]','claude-opus-5-5',120,40)$$, 'server records the groups');
select throws_ok($$select public.fail_analysis_grouping('92000000-0000-0000-0000-000000000001','x')$$,
  '22023', 'grouping_not_available', 'a finished grouping cannot be changed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000a',true);
select is((select row(status, groups->0->>'title', input_tokens, output_tokens)::text from public.analysis_groupings
  where analysis_id = '92000000-0000-0000-0000-000000000001'), '(ready,"Perfil lipídico",120,40)', 'A reads the ready grouping');

-- A failure is final; an abandoned 'processing' grouping can be started again
select lives_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000002','grouping/1')$$, 'A starts a second grouping');
reset role;
update public.analysis_groupings set created_at = now() - interval '1 hour' where analysis_id = '92000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000a',true);
select lives_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000002','grouping/1')$$,
  'an abandoned grouping is started again');
reset role;
set local role service_role;
select public.fail_analysis_grouping('92000000-0000-0000-0000-000000000002','invalid_output','claude-opus-5-5',10,5);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-00000000000a',true);
select throws_ok($$select public.start_analysis_grouping('92000000-0000-0000-0000-000000000002','grouping/1')$$,
  '23505', 'grouping_exists', 'a failed grouping is not retried automatically');

-- Deleting the analysis deletes its grouping
reset role;
delete from public.document_analyses where id = '92000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.analysis_groupings where analysis_id = '92000000-0000-0000-0000-000000000001'), 0,
  'grouping goes with its analysis');

select * from finish();
rollback;
