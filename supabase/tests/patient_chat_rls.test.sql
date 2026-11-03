begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
-- A gets the module; B never does.
insert into auth.users(id,email) values
 ('c1000000-0000-0000-0000-000000000001','a@chat.test'),
 ('c1000000-0000-0000-0000-000000000002','b@chat.test');
insert into public.module_grants(user_id,module_id,granted_at,expires_at) values
 ('c1000000-0000-0000-0000-000000000001','patient-chat',now(),now() + interval '30 days');
insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select 'c1000000-0000-0000-0000-000000000001','patient-chat',terms_version from public.analysis_modules where id='patient-chat';

-- As it may reach the cloud: disabled, hidden and with no KB data. The local seed may have changed this, so it is reset
-- here; tests/patient-chat.test.cjs checks that the migration itself creates this state.
update public.analysis_modules set status='disabled' where id='patient-chat';
delete from public.patient_chat_kb_items;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.requestable_modules() where module_id='patient-chat'),0,'a disabled module does not appear to be requested');
select throws_ok($$select public.request_module('patient-chat')$$,'22023','module_not_available','a disabled module cannot be requested');
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.start_patient_chat()$$,'42501','module_not_available','a disabled module cannot be used, even granted');
reset role;

update public.analysis_modules set status='testing' where id='patient-chat';

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.start_patient_chat()$$,'42501','not_authenticated','no login');
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.start_patient_chat()$$,'42501','module_not_available','no module');
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.start_patient_chat()$$,'55000','kb_unavailable','empty KB');
reset role;

insert into public.patient_chat_kb_items(item,question,answer) values(1,'Pergunta','Resposta');
delete from public.module_terms_acceptances where user_id='c1000000-0000-0000-0000-000000000001' and module_id='patient-chat';

set local role authenticated;
select throws_ok($$select public.start_patient_chat()$$,'42501','module_not_available','terms not accepted');
reset role;

insert into public.module_terms_acceptances(user_id,module_id,terms_version)
 select 'c1000000-0000-0000-0000-000000000001','patient-chat',terms_version from public.analysis_modules where id='patient-chat';

set local role authenticated;
select throws_ok($$select * from public.patient_chat_kb_items$$,'42501',null,'the app cannot read the KB');
select throws_ok($$insert into public.patient_chat_kb_items(item,question,answer) values(2,'x','y')$$,'42501',null,'the app cannot write the KB');
select isnt((select public.start_patient_chat()),null,'a granted user starts a question');
select is((select count(*)::int from public.patient_chat_usage),1,'the user sees their own usage');
select throws_ok($$insert into public.patient_chat_usage(user_id) values('c1000000-0000-0000-0000-000000000001')$$,'42501',null,'the app cannot write usage');
select throws_ok($$update public.patient_chat_usage set input_tokens=0$$,'42501',null,'the app cannot change usage');
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.patient_chat_usage),0,'another user does not see it');
reset role;

-- The limit: with 59 in the window, one more passes and the next is refused.
insert into public.patient_chat_usage(user_id) select 'c1000000-0000-0000-0000-000000000001' from generate_series(1,58);
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
select isnt((select public.start_patient_chat()),null,'the 60th question passes');
select throws_ok($$select public.start_patient_chat()$$,'54000','chat_limit_reached','the 61st is refused');
reset role;
select is((select count(*)::int from public.patient_chat_usage where user_id='c1000000-0000-0000-0000-000000000001'),60,'the refused question does not count');

-- Questions older than the window no longer count.
update public.patient_chat_usage set created_at=now() - interval '25 hours'
 where id=(select id from public.patient_chat_usage where user_id='c1000000-0000-0000-0000-000000000001' limit 1);
set local role authenticated;
select isnt((select public.start_patient_chat()),null,'a question leaves the window after 24 hours');
reset role;

select * from finish();
rollback;
