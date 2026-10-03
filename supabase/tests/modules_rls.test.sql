begin;
create extension if not exists pgtap with schema extensions;
select plan(61);
insert into auth.users(id,email) values
 ('30000000-0000-0000-0000-000000000001','admin@module.test'),
 ('30000000-0000-0000-0000-000000000002','buyer@module.test'),
 ('30000000-0000-0000-0000-000000000003','other@module.test');
insert into public.app_admins(user_id,created_by) values ('30000000-0000-0000-0000-000000000001','test');
insert into public.documents(id,owner_id,name,storage_path,mime_type,status) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Buyer PDF',
 '30000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000001/original','application/pdf','uploaded');

-- B (buyer) before any grant
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select throws_ok($$insert into public.app_admins(user_id) values ('30000000-0000-0000-0000-000000000002')$$,'42501',null,'user cannot make self admin');
select is((select count(*) from public.app_admins),0::bigint,'user does not see admin rows');
select throws_ok($$select * from public.admin_find_user('other@module.test')$$,'42501',null,'user cannot search accounts');
select throws_ok($$select public.admin_grant_module('30000000-0000-0000-0000-000000000002','lab-report')$$,'42501',null,'user cannot grant module to self');
select throws_ok($$insert into public.module_grants(user_id,module_id) values ('30000000-0000-0000-0000-000000000002','lab-report')$$,'42501',null,'user cannot insert grant directly');
select throws_ok($$select public.admin_set_module_status('lab-report','active')$$,'42501',null,'user cannot change module status');
select throws_ok($$update public.analysis_modules set status='active'$$,'42501',null,'user cannot update catalog');
select is((select count(*) from public.analysis_modules),0::bigint,'draft module hidden from user without grant');
select throws_ok($$select public.accept_module_terms('lab-report')$$,'42501',null,'terms require a grant');
select is((select count(*) from public.requestable_modules()),1::bigint,'user without grant can request the module');
select throws_ok($$insert into public.module_requests(user_id,module_id) values ('30000000-0000-0000-0000-000000000002','lab-report')$$,'42501',null,'user cannot insert request directly');
select lives_ok($$select public.request_module('lab-report')$$,'user requests module');
select throws_ok($$select public.request_module('lab-report')$$,'23505',null,'duplicate pending request rejected');
select isnt((select requested_at from public.requestable_modules() where module_id='lab-report'),null,'pending request is shown');
select throws_ok($$select * from public.admin_list_module_requests()$$,'42501',null,'user cannot list requests');

-- A (admin)
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.app_admins),1::bigint,'admin sees own admin row');
select is((select count(*) from public.analysis_modules),1::bigint,'admin sees draft module');
select is((select user_id from public.admin_find_user(' BUYER@module.test ')),'30000000-0000-0000-0000-000000000002'::uuid,'admin finds account by exact e-mail');
select is((select count(*) from public.admin_find_user('buyer@')),0::bigint,'partial e-mail finds nothing');
select throws_ok($$select public.admin_grant_module('30000000-0000-0000-0000-000000000009','lab-report')$$,'22023',null,'unknown user rejected');
select throws_ok($$select public.admin_grant_module('30000000-0000-0000-0000-000000000002','missing')$$,'22023',null,'unknown module rejected');
select is((select count(*) from public.admin_list_module_requests()),1::bigint,'admin lists pending requests');
select lives_ok($$select public.admin_grant_module('30000000-0000-0000-0000-000000000002','lab-report','contrato teste')$$,'admin grants module');
select is((select expires_at - granted_at from public.module_grants where user_id='30000000-0000-0000-0000-000000000002'),interval '30 days','grant lasts 30 days');
select is((select count(*) from public.admin_list_module_requests()),0::bigint,'granting closes the pending request');
select throws_ok($$select public.admin_grant_module('30000000-0000-0000-0000-000000000002','lab-report')$$,'23505',null,'duplicate open grant rejected');
select is((select count(*) from public.documents where id='40000000-0000-0000-0000-000000000001'),0::bigint,'admin cannot read user documents');
select is((select count(*) from public.admin_list_module_grants('lab-report')),1::bigint,'admin lists grants');

-- B with grant
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.module_grants),1::bigint,'user sees own grant');
select is((select count(*) from public.analysis_modules),1::bigint,'user sees granted draft module');
select is((select active from public.my_modules() where module_id='lab-report'),true,'grant is active');
select is((select terms_accepted from public.my_modules() where module_id='lab-report'),false,'terms not yet accepted');
select is((select count(*) from public.requestable_modules()),0::bigint,'granted module is not requestable');
select throws_ok($$select public.request_module('lab-report')$$,'22023',null,'request rejected while grant is active');
select throws_ok($$update public.module_grants set expires_at = now() + interval '10 years'$$,'42501',null,'user cannot extend own grant');
select throws_ok($$delete from public.module_grants$$,'42501',null,'user cannot delete grant');
select throws_ok($$select * from public.admin_list_module_grants()$$,'42501',null,'user cannot list all grants');
select lives_ok($$select public.accept_module_terms('lab-report')$$,'user accepts terms');
select is((select terms_accepted from public.my_modules() where module_id='lab-report'),true,'terms accepted');
select is(module_private.can_use_module('lab-report'),false,'draft module cannot be used yet');

-- C (other) sees nothing of B
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.module_grants),0::bigint,'other user does not see grants of others');
select is((select count(*) from public.my_modules()),0::bigint,'other user has no modules');
select is((select count(*) from public.module_requests),0::bigint,'other user does not see requests of others');

-- Server-side changes: new terms version, module activation, expired grant for C
reset role;
update public.analysis_modules set status='active' where id='lab-report';
insert into public.module_grants(user_id,module_id,granted_at,expires_at) values
 ('30000000-0000-0000-0000-000000000003','lab-report',now() - interval '60 days',now() - interval '30 days');
set local role authenticated;

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select is(module_private.can_use_module('lab-report'),true,'active module with grant and terms is usable');
reset role;
update public.analysis_modules set terms_version='2026-10-02-v2' where id='lab-report';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select is((select terms_accepted from public.my_modules() where module_id='lab-report'),false,'new terms version requires new acceptance');
select is(module_private.can_use_module('lab-report'),false,'module unusable until new terms accepted');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select active from public.my_modules() where module_id='lab-report'),false,'expired grant is inactive');
select throws_ok($$select public.accept_module_terms('lab-report')$$,'42501',null,'expired grant cannot accept terms');

-- A revokes B and renews C
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.admin_revoke_module_grant((select id from public.module_grants where user_id='30000000-0000-0000-0000-000000000002'))$$,'admin revokes grant');
select throws_ok($$select public.admin_revoke_module_grant((select id from public.module_grants where user_id='30000000-0000-0000-0000-000000000002'))$$,'22023',null,'revoking twice rejected');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.request_module('lab-report')$$,'user with expired grant requests renewal');
reset role;
create temp table c_request as select id from public.module_requests where user_id='30000000-0000-0000-0000-000000000003' and closed_at is null;
grant select on c_request to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.admin_close_module_request((select id from c_request))$$,'42501',null,'user cannot close request');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.admin_close_module_request((select id from c_request))$$,'admin closes request without granting');
select throws_ok($$select public.admin_close_module_request((select id from c_request))$$,'22023',null,'closing twice rejected');
select lives_ok($$select public.admin_grant_module('30000000-0000-0000-0000-000000000003','lab-report')$$,'admin renews over expired grant');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select is((select active from public.my_modules() where module_id='lab-report'),false,'revoked grant is inactive');
select is((select count(*) from public.module_grants),1::bigint,'revocation keeps history');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select active from public.my_modules() where module_id='lab-report'),true,'renewed grant is active');

-- Anonymous
set local role anon;
select throws_ok($$select count(*) from public.analysis_modules$$,'42501',null,'anon cannot read catalog');
select throws_ok($$select count(*) from public.module_grants$$,'42501',null,'anon cannot read grants');
select throws_ok($$select count(*) from public.module_requests$$,'42501',null,'anon cannot read requests');

select * from finish();
rollback;
