// Local Supabase only: loads the fictitious KB, creates the test account and opens the patient chat module for it.
// Run with: node tests/patient-chat.seed.cjs
const fs = require('node:fs');
const {createClient} = require('@supabase/supabase-js');
const {load, KB_FILE, localSupabase, TEST_ACCOUNT} = require('./patient-chat-helpers.cjs');

const MODULE_ID = 'patient-chat';

async function main() {
  const config = localSupabase();
  const {parseKb} = load('modules/patient-chat/kb.ts');
  const items = parseKb(fs.readFileSync(KB_FILE, 'utf8'));
  const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const ok = result => { if (result.error) throw new Error(result.error.message); return result.data; };

  ok(await service.from('patient_chat_kb_items').delete().gt('item', 0));
  ok(await service.from('patient_chat_kb_items').insert(items));
  const module = ok(await service.from('analysis_modules').update({status: 'testing'}).eq('id', MODULE_ID).select('terms_version').single());

  const {data: created, error} = await service.auth.admin.createUser({...TEST_ACCOUNT, email_confirm: true});
  let userId = created?.user?.id;
  if (error) {
    const {data: {users}} = await service.auth.admin.listUsers();
    userId = users.find(user => user.email === TEST_ACCOUNT.email)?.id;
    if (!userId) throw new Error(error.message);
  }
  // Running the seed again renews the grant.
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const grants = ok(await service.from('module_grants').select('id').eq('user_id', userId).eq('module_id', MODULE_ID).is('revoked_at', null));
  if (grants.length) ok(await service.from('module_grants').update({expires_at}).eq('id', grants[0].id));
  else ok(await service.from('module_grants').insert({user_id: userId, module_id: MODULE_ID, expires_at, note: 'patient chat local test'}));
  ok(await service.from('module_terms_acceptances').upsert({user_id: userId, module_id: MODULE_ID, terms_version: module.terms_version}));

  const count = (await service.from('patient_chat_kb_items').select('item', {count: 'exact', head: true})).count;
  console.log(`KB: ${count} itens. Módulo ${MODULE_ID} em testing. Conta de teste: ${TEST_ACCOUNT.email}`);
}

main().catch(error => { console.error(error.message); process.exit(1); });
