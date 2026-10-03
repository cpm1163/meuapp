// Local Supabase only. Uses real Auth and PostgREST; no simulated policies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const enabled = process.env.RUN_MODULE_INTEGRATION === '1';
test('modules: admin role, grants and terms through the real API', { skip: !enabled }, async (t) => {
  const config = JSON.parse(execFileSync('npx', ['--yes','supabase','status','-o','json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
  const url = config.API_URL;
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname), 'integration tests must never run against production');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, config.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(url, config.ANON_KEY, options);
  const accounts = [];
  const docs = [];
  const moduleId = 'lab-report';
  function ok(result) { assert.equal(result.error, null, result.error?.message); return result.data; }
  function denied(result) { assert.ok(result.error, 'operation should be rejected'); }
  const original = ok(await service.from('analysis_modules').select('status,terms_version').eq('id', moduleId).single());
  try {
    for (const label of ['admin','buyer','other']) {
      const email = `${label}-${randomUUID()}@module.test`;
      const password = randomUUID() + 'Aa1!';
      const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
      const client = createClient(url, config.ANON_KEY, options);
      ok(await client.auth.signInWithPassword({ email, password }));
      accounts.push({ user, client, email });
    }
    const [a, b, c] = accounts;
    // The admin role is granted server-side only.
    ok(await service.from('app_admins').insert({ user_id: a.user.id, created_by: 'integration-test' }));
    let grant;

    await t.test('users cannot become admin or grant modules to themselves', async () => {
      denied(await b.client.from('app_admins').insert({ user_id: b.user.id }));
      assert.deepEqual(ok(await b.client.from('app_admins').select('*')), []);
      denied(await b.client.rpc('admin_find_user', { search_email: c.email }));
      denied(await b.client.rpc('admin_grant_module', { user_id: b.user.id, module_id: moduleId }));
      denied(await b.client.from('module_grants').insert({ user_id: b.user.id, module_id: moduleId }));
      denied(await b.client.rpc('admin_set_module_status', { module_id: moduleId, status: 'active' }));
      denied(await b.client.rpc('accept_module_terms', { module_id: moduleId }));
      assert.deepEqual(ok(await b.client.rpc('my_modules')), []);
    });

    await t.test('user requests a module; admin sees the request', async () => {
      denied(await b.client.from('module_requests').insert({ user_id: b.user.id, module_id: moduleId }));
      ok(await b.client.rpc('request_module', { module_id: moduleId }));
      denied(await b.client.rpc('request_module', { module_id: moduleId }));
      assert.ok(ok(await b.client.rpc('requestable_modules')).find((row) => row.module_id === moduleId).requested_at);
      denied(await b.client.rpc('admin_list_module_requests'));
      assert.deepEqual(ok(await c.client.from('module_requests').select('*')), []);
      const pending = ok(await a.client.rpc('admin_list_module_requests'));
      assert.ok(pending.some((row) => row.user_id === b.user.id && row.email === b.email && row.module_id === moduleId));
    });

    await t.test('admin finds by exact e-mail and grants the module', async () => {
      assert.equal(ok(await a.client.from('app_admins').select('*')).length, 1);
      const found = ok(await a.client.rpc('admin_find_user', { search_email: b.email.toUpperCase() }));
      assert.equal(found.length, 1); assert.equal(found[0].user_id, b.user.id);
      assert.deepEqual(ok(await a.client.rpc('admin_find_user', { search_email: 'buyer-' })), []);
      grant = ok(await a.client.rpc('admin_grant_module', { user_id: b.user.id, module_id: moduleId, note: 'contrato teste' }));
      assert.equal(grant.granted_by, a.user.id);
      assert.equal(new Date(grant.expires_at) - new Date(grant.granted_at), 30 * 24 * 60 * 60 * 1000);
      const pending = ok(await a.client.rpc('admin_list_module_requests'));
      assert.ok(!pending.some((row) => row.user_id === b.user.id), 'granting closes the request');
      denied(await a.client.rpc('admin_grant_module', { user_id: b.user.id, module_id: moduleId }));
      const listed = ok(await a.client.rpc('admin_list_module_grants', { filter_module_id: moduleId }));
      assert.ok(listed.some((row) => row.user_id === b.user.id && row.email === b.email && row.active));
    });

    await t.test('buyer sees only own grant and cannot change it', async () => {
      const mine = ok(await b.client.rpc('my_modules'));
      assert.equal(mine.length, 1); assert.equal(mine[0].active, true); assert.equal(mine[0].terms_accepted, false);
      assert.equal(ok(await b.client.from('module_grants').select('*')).length, 1);
      denied(await b.client.from('module_grants').update({ expires_at: '2099-01-01T00:00:00Z' }).eq('id', grant.id));
      denied(await b.client.from('module_grants').delete().eq('id', grant.id));
      denied(await b.client.rpc('admin_revoke_module_grant', { grant_id: grant.id }));
      assert.deepEqual(ok(await c.client.from('module_grants').select('*')), []);
      assert.deepEqual(ok(await c.client.rpc('my_modules')), []);
    });

    await t.test('buyer accepts terms; user without grant cannot', async () => {
      ok(await b.client.rpc('accept_module_terms', { module_id: moduleId }));
      assert.equal(ok(await b.client.rpc('my_modules'))[0].terms_accepted, true);
      denied(await c.client.rpc('accept_module_terms', { module_id: moduleId }));
    });

    await t.test('admin role gives no access to user documents', async () => {
      const doc = ok(await b.client.rpc('create_document', { document_name: 'Buyer exam', content_type: 'application/pdf' }));
      docs.push(doc);
      assert.deepEqual(ok(await a.client.from('documents').select('*').eq('id', doc.id)), []);
      denied(await a.client.storage.from('documents').download(doc.storage_path));
    });

    await t.test('admin changes module status; users cannot', async () => {
      ok(await a.client.rpc('admin_set_module_status', { module_id: moduleId, status: 'testing' }));
      assert.equal(ok(await b.client.rpc('my_modules'))[0].module_status, 'testing');
      denied(await a.client.rpc('admin_set_module_status', { module_id: moduleId, status: 'invalid' }));
    });

    await t.test('revocation ends access and keeps history', async () => {
      ok(await a.client.rpc('admin_revoke_module_grant', { grant_id: grant.id }));
      denied(await a.client.rpc('admin_revoke_module_grant', { grant_id: grant.id }));
      const mine = ok(await b.client.rpc('my_modules'));
      assert.equal(mine.length, 1); assert.equal(mine[0].active, false);
      assert.equal(ok(await b.client.from('module_grants').select('*')).length, 1);
      ok(await a.client.rpc('admin_grant_module', { user_id: b.user.id, module_id: moduleId }));
      assert.equal(ok(await b.client.rpc('my_modules'))[0].active, true);
    });

    await t.test('anonymous requests reach nothing', async () => {
      denied(await anonymous.from('analysis_modules').select('*'));
      denied(await anonymous.from('module_grants').select('*'));
      denied(await anonymous.rpc('my_modules'));
      denied(await anonymous.rpc('request_module', { module_id: moduleId }));
      denied(await anonymous.from('module_requests').select('*'));
      denied(await anonymous.rpc('admin_find_user', { search_email: b.email }));
    });
  } finally {
    ok(await service.from('analysis_modules').update(original).eq('id', moduleId));
    for (const doc of docs) ok(await service.from('documents').delete().eq('id', doc.id));
    for (const { user } of accounts) ok(await service.auth.admin.deleteUser(user.id));
  }
});
