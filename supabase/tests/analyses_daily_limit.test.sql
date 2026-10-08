begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
-- A reaches the daily limit; B has the module and is not affected by A's count.
insert into auth.users(id,email) values
 ('70000000-0000-0000-0000-00000000000a','limit-a@analysis.test'),
 ('70000000-0000-0000-0000-00000000000b','limit-b@analysis.test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-00000000000a','Laudo A1',
  '70000000-0000-0000-0000-00000000000a/80000000-0000-0000-0000-000000000001/original','application/pdf','uploaded'),
 ('80000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-00000000000a','Laudo A2',
  '70000000-0000-0000-0000-00000000000a/80000000-0000-0000-0000-000000000002/original','application/pdf','uploaded'),
 ('80000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-00000000000b','Laudo B',
  '70000000-0000-0000-0000-00000000000b/80000000-0000-0000-0000-000000000003/original','application/pdf','uploaded');
update public.analysis_modules set status='testing' where id='lab-report';
insert into public.module_grants(user_id,module_id,expires_at) values
 ('70000000-0000-0000-0000-00000000000a','lab-report',now() + interval '30 days'),
 ('70000000-0000-0000-0000-00000000000b','lab-report',now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select u, 'lab-report', terms_version from public.analysis_modules,
  unnest(array['70000000-0000-0000-0000-00000000000a','70000000-0000-0000-0000-00000000000b']::uuid[]) u
  where id='lab-report';
-- 9 analyses of A in the window (failed ones count: the AI call was billed), 1 older than the window.
insert into public.document_analyses(document_id,requested_by,module_id,terms_version,status,failure_reason,created_at,completed_at)
 select '80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-00000000000a','lab-report','x','failed','provider_error',
  now() - make_interval(hours => n), now() - make_interval(hours => n)
 from generate_series(1, 9) n;
insert into public.document_analyses(document_id,requested_by,module_id,terms_version,status,failure_reason,created_at,completed_at)
 values ('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-00000000000a','lab-report','x','failed','provider_error',
  now() - interval '30 hours', now() - interval '30 hours');
create temp table ids(name text primary key, id uuid);
grant all on ids to authenticated, service_role;

select is(module_private.daily_analysis_limit(),10,'daily limit is 10');
select is(module_private.daily_analysis_window(),interval '24 hours','window is 24 hours');

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-00000000000a',true);
select is((select row(daily_limit,used,remaining)::text from public.get_analysis_quota()),'(10,9,1)',
  'quota counts analyses in the window, failed included, older ones excluded');
select is((select next_available_at from public.get_analysis_quota()),
  (select min(created_at) + interval '24 hours' from public.document_analyses
    where requested_by='70000000-0000-0000-0000-00000000000a' and created_at > now() - interval '24 hours'),
  'quota tells when the oldest counted analysis leaves the window');
select lives_ok($$insert into ids select 'tenth', id from public.start_document_analysis('80000000-0000-0000-0000-000000000002','lab-report')$$,
  'tenth analysis in the window is allowed');
select is((select remaining from public.get_analysis_quota()),0,'no analyses remaining');

-- Finish the tenth so the next attempt is blocked by the limit, not by the analysis in progress.
reset role;
set local role service_role;
select lives_ok($$select public.fail_document_analysis((select id from ids where name='tenth'),'provider_error')$$,'server fails the tenth');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-00000000000a',true);
select throws_ok($$select public.start_document_analysis('80000000-0000-0000-0000-000000000002','lab-report')$$,
  '54000','daily_limit_reached','eleventh analysis is refused');
select is((select count(*) from public.document_analyses where requested_by='70000000-0000-0000-0000-00000000000a'),11::bigint,
  'refused start creates no analysis');
select is((select status from public.documents where id='80000000-0000-0000-0000-000000000002'),'failed',
  'refused start does not change the document');

-- Other users keep their own count
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-00000000000b',true);
select is((select row(used,remaining)::text from public.get_analysis_quota()),'(0,10)','other user has the full quota');
select is((select next_available_at from public.get_analysis_quota()),null,'no date when nothing was used');
select lives_ok($$select public.start_document_analysis('80000000-0000-0000-0000-000000000003','lab-report')$$,
  'other user is not affected by the limit of A');

-- When the oldest counted analysis leaves the window, one more start is allowed
reset role;
update public.document_analyses set created_at = now() - interval '25 hours', completed_at = now() - interval '25 hours'
 where id = (select id from public.document_analyses
  where requested_by='70000000-0000-0000-0000-00000000000a' and created_at > now() - interval '24 hours'
  order by created_at limit 1);
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-00000000000a',true);
select is((select remaining from public.get_analysis_quota()),1,'one analysis frees up after 24 hours');
select lives_ok($$select public.start_document_analysis('80000000-0000-0000-0000-000000000002','lab-report')$$,
  'start allowed again after the window');

-- Without a user there is no quota; anonymous calls are refused
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.get_analysis_quota()),0::bigint,'no quota row without a user');
set local role anon;
select throws_ok($$select * from public.get_analysis_quota()$$,'42501',null,'anon cannot read the quota');
select throws_ok($$select module_private.daily_analysis_limit()$$,'42501',null,'anon cannot call the private limit');

select * from finish();
rollback;
