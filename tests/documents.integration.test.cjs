// Local Supabase only. Uses real Auth, PostgREST and Storage; no simulated policies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const enabled = process.env.RUN_DOCUMENT_INTEGRATION === '1';
test('documents: real API and Storage isolation', { skip: !enabled }, async (t) => {
  const config = JSON.parse(execFileSync('npx', ['--yes','supabase','status','-o','json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
  const url = config.API_URL;
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname), 'integration tests must never run against production');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, config.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(url, config.ANON_KEY, options);
  const accounts = [];
  const docs = [];
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  function ok(result) { assert.equal(result.error, null, result.error?.message); return result.data; }
  function denied(result) { assert.ok(result.error, 'operation should be rejected'); }
  try {
    for (const label of ['owner','reader','outsider']) {
      const email = `${label}-${randomUUID()}@document.test`;
      const password = randomUUID() + 'Aa1!';
      const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
      const client = createClient(url, config.ANON_KEY, options);
      ok(await client.auth.signInWithPassword({ email,password }));
      accounts.push({user,client,email});
    }
    const [a,b,c] = accounts;
    let doc;
    await t.test('reservation binds owner; pending upload is private', async () => {
      doc = ok(await a.client.rpc('create_document', {document_name:'Secret PDF',content_type:'application/pdf'}));
      docs.push(doc);
      assert.equal(doc.owner_id,a.user.id);
      assert.equal(doc.status,'pending_upload');
      assert.deepEqual(ok(await b.client.from('documents').select('*').eq('id',doc.id)),[]);
      denied(await b.client.rpc('share_document',{document_id:doc.id,recipient_email:b.email}));
      denied(await a.client.rpc('complete_document_upload',{document_id:doc.id}));
      denied(await a.client.from('documents').update({owner_id:b.user.id}).eq('id',doc.id));
    });
    await t.test('Storage rejects foreign and unreserved uploads', async () => {
      denied(await b.client.storage.from('documents').upload(doc.storage_path,pdf,{contentType:'application/pdf'}));
      denied(await a.client.storage.from('documents').upload(`${a.user.id}/${randomUUID()}/original`,pdf,{contentType:'application/pdf'}));
    });
    await t.test('owner uploads; server verifies metadata and finishes reservation', async () => {
      ok(await a.client.storage.from('documents').upload(doc.storage_path,pdf,{contentType:'application/pdf'}));
      ok(await a.client.rpc('complete_document_upload',{document_id:doc.id}));
      const current = ok(await a.client.from('documents').select('*').eq('id',doc.id).single());
      assert.equal(current.status,'uploaded'); assert.equal(current.size_bytes,pdf.length);
      denied(await a.client.storage.from('documents').upload(doc.storage_path,pdf,{contentType:'application/pdf',upsert:true}));
    });
    await t.test('owner reads; anonymous and other accounts cannot download or sign', async () => {
      ok(await a.client.storage.from('documents').download(doc.storage_path));
      for (const client of [anonymous,b.client,c.client]) {
        denied(await client.storage.from('documents').download(doc.storage_path));
        denied(await client.storage.from('documents').createSignedUrl(doc.storage_path,60));
      }
    });
    await t.test('grant gives reader download, not mutation or recipient directory', async () => {
      ok(await a.client.rpc('share_document',{document_id:doc.id,recipient_email:b.email}));
      assert.equal(ok(await b.client.from('documents').select('*').eq('id',doc.id)).length,1);
      ok(await b.client.storage.from('documents').download(doc.storage_path));
      ok(await b.client.storage.from('documents').createSignedUrl(doc.storage_path,60));
      assert.deepEqual(ok(await b.client.from('documents').update({name:'Hacked'}).eq('id',doc.id).select()),[]);
      denied(await b.client.rpc('begin_document_delete',{document_id:doc.id}));
      denied(await b.client.rpc('share_document',{document_id:doc.id,recipient_email:c.email}));
      denied(await b.client.rpc('list_document_shares',{document_id:doc.id}));
      denied(await b.client.storage.from('documents').upload(doc.storage_path,pdf,{contentType:'application/pdf',upsert:true}));
      // Storage remove may report an empty result for rows hidden by RLS.
      await b.client.storage.from('documents').remove([doc.storage_path]);
      ok(await a.client.storage.from('documents').download(doc.storage_path));
      assert.equal(ok(await a.client.rpc('list_document_shares',{document_id:doc.id}))[0].email,b.email);
      denied(await c.client.storage.from('documents').download(doc.storage_path));
    });
    await t.test('revocation blocks fresh reads and signed URL creation', async () => {
      ok(await a.client.from('document_shares').delete().eq('document_id',doc.id).eq('user_id',b.user.id));
      assert.deepEqual(ok(await b.client.from('documents').select('*').eq('id',doc.id)),[]);
      denied(await b.client.storage.from('documents').download(doc.storage_path));
      denied(await b.client.storage.from('documents').createSignedUrl(doc.storage_path,60));
    });
    await t.test('deletion hides shares first and requires Storage removal before row removal', async () => {
      ok(await a.client.rpc('share_document',{document_id:doc.id,recipient_email:b.email}));
      ok(await a.client.rpc('begin_document_delete',{document_id:doc.id}));
      assert.deepEqual(ok(await b.client.from('documents').select('*').eq('id',doc.id)),[]);
      denied(await b.client.storage.from('documents').download(doc.storage_path));
      denied(await a.client.rpc('finish_document_delete',{document_id:doc.id}));
      denied(await a.client.rpc('share_document',{document_id:doc.id,recipient_email:b.email}));
      ok(await a.client.storage.from('documents').remove([doc.storage_path]));
      ok(await a.client.rpc('finish_document_delete',{document_id:doc.id}));
      assert.deepEqual(ok(await a.client.from('documents').select('*').eq('id',doc.id)),[]);
      assert.deepEqual(ok(await admin.from('document_shares').select('*').eq('document_id',doc.id)),[]);
    });
    await t.test('interrupted reservation can be removed with no object', async () => {
      const pending = ok(await a.client.rpc('create_document',{document_name:'Interrupted',content_type:'application/pdf'}));
      docs.push(pending);
      ok(await a.client.rpc('begin_document_delete',{document_id:pending.id}));
      ok(await a.client.storage.from('documents').remove([pending.storage_path]));
      ok(await a.client.rpc('finish_document_delete',{document_id:pending.id}));
    });
  } finally {
    for (const doc of docs) {
      ok(await admin.storage.from('documents').remove([doc.storage_path]));
      ok(await admin.from('documents').delete().eq('id',doc.id));
    }
    for (const {user} of accounts) ok(await admin.auth.admin.deleteUser(user.id));
  }
});
