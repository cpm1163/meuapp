// Cloud only, for the partner doctor demo (openspec add-patient-chat, task 10.2): loads the fictitious KB into the
// cloud project linked to this repo, and nothing else. It creates no account, grants no module and leaves the
// module status alone; those stay with the user (Administração) and the local seed.
//   node tests/patient-chat.cloud-kb.cjs --dry-run         shows the project and the item count; changes nothing
//   node tests/patient-chat.cloud-kb.cjs --confirm-cloud   replaces the KB in the cloud
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {load, KB_FILE, cloudKbTarget} = require('./patient-chat-helpers.cjs');

const args = process.argv.slice(2);

async function main() {
  const target = cloudKbTarget(fs.readFileSync('supabase/.temp/project-ref', 'utf8'));
  const {parseKb} = load('modules/patient-chat/kb.ts');
  const items = parseKb(fs.readFileSync(KB_FILE, 'utf8'));
  console.log(`Projeto da nuvem: ${target.ref} (${target.url})`);
  console.log(`KB fictícia: ${items.length} itens, de ${KB_FILE}`);

  if (args.includes('--dry-run')) { console.log('--dry-run: nada foi alterado.'); return; }
  if (!args.includes('--confirm-cloud')) {
    console.error('Recusado: falta --confirm-cloud. Nada foi alterado.');
    process.exitCode = 1;
    return;
  }

  // The key is read here and never printed or saved.
  const keys = JSON.parse(execFileSync('npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', target.ref, '--reveal', '-o', 'json'],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
  const secret = keys.find(key => key.type === 'secret')?.api_key;
  if (!secret) throw new Error('chave secreta do projeto não encontrada');

  const {createClient} = require('@supabase/supabase-js');
  const service = createClient(target.url, secret, {auth: {persistSession: false, autoRefreshToken: false}});
  const ok = result => { if (result.error) throw new Error(result.error.message); return result.data; };
  ok(await service.from('patient_chat_kb_items').delete().gt('item', 0));
  ok(await service.from('patient_chat_kb_items').insert(items));
  const count = (await service.from('patient_chat_kb_items').select('item', {count: 'exact', head: true})).count;
  console.log(`KB na nuvem: ${count} itens. Módulo e liberações não foram alterados.`);
}

main().catch(error => { console.error(error.message); process.exit(1); });
