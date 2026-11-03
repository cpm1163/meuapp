// Acceptance run of the patient chat: the 18 questions, one at a time, against the local function. Outside npm test.
//   node tests/patient-chat.eval.cjs --dry-run        shows what would be sent; no AI call and no confirmation
//   node tests/patient-chat.eval.cjs --confirm-paid   runs them; each question is a paid AI call
//   --only <n> runs one question. Question 11 comes from PATIENT_CHAT_Q11 and is never stored or printed.
const fs = require('node:fs');
const {createClient} = require('@supabase/supabase-js');
const {load, KB_FILE, QUESTIONS_FILE, assertLocalUrl, localSupabase, extractQuestions, requestBody, EXPECTED, TEST_ACCOUNT} = require('./patient-chat-helpers.cjs');

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const only = has('--only') ? Number(args[args.indexOf('--only') + 1]) : null;
// claude-haiku-5-5, per million tokens.
const PRICE = {input: 0.10, output: 0.50};

function questionsToRun() {
  const questions = extractQuestions(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
  const numbers = Object.keys(EXPECTED).map(Number);
  const missing = numbers.filter(number => !questions.has(number));
  if (missing.length) throw new Error(`perguntas ausentes no arquivo: ${missing.join(', ')}`);
  if (only !== null && !numbers.includes(only)) throw new Error(`pergunta inválida: ${only}`);
  if (process.env.PATIENT_CHAT_Q11) questions.set(11, process.env.PATIENT_CHAT_Q11);
  return (only === null ? numbers : [only]).map(number => ({number, text: questions.get(number)}));
}

function dryRun() {
  const {hasUrgencySignal} = load('modules/patient-chat/urgency-signals.ts');
  const {parseKb} = load('modules/patient-chat/kb.ts');
  for (const {number, text} of questionsToRun()) {
    if (number === 11) console.log(`11: [não impressa] ${text ? 'informada' : 'não informada: a rodada ficaria incompleta'}`);
    else console.log(`${number}: ${JSON.stringify(requestBody(text))}${hasUrgencySignal(text) ? ' [sinal da lista]' : ''}`);
  }
  const items = parseKb(fs.readFileSync(KB_FILE, 'utf8'));
  const hits = items.filter(item => hasUrgencySignal(item.question)).map(item => item.item);
  console.log(`Lista de sinais nas ${items.length} perguntas da KB: ${hits.length ? `dispara nos itens ${hits.join(', ')}` : 'não dispara'}.`);
  console.log('Nenhuma chamada à IA foi feita.');
}

async function run() {
  const config = localSupabase();
  const client = createClient(config.API_URL, config.ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data: login, error} = await client.auth.signInWithPassword(TEST_ACCOUNT);
  if (error) throw new Error(`login da conta de teste: ${error.message}. Rode tests/patient-chat.seed.cjs`);
  const started = new Date().toISOString();

  let failed = 0, alerts = 0, incomplete = false;
  for (const {number, text} of questionsToRun()) {
    if (!text) {
      incomplete = true;
      console.log(`${number}: NÃO INFORMADA`);
      continue;
    }
    const response = await fetch(`${config.API_URL}/functions/v1/patient-chat`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${login.session.access_token}`, apikey: config.ANON_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody(text)),
    });
    const reply = await response.json().catch(() => ({}));
    const expected = EXPECTED[number];
    const pass = response.ok && reply.outcome === expected.outcome && (expected.item === undefined || reply.item === expected.item);
    const warning = pass && expected.outcome === 'urgency' && reply.detected_by === 'code';
    if (!pass) failed++;
    if (warning) alerts++;
    console.log(`${number}: ${pass ? 'OK' : 'FALHOU'} | ${reply.outcome ?? reply.error ?? response.status}`
      + `${reply.item ? ` | item ${reply.item}` : ''}${reply.detected_by ? ` | urgência detectada por: ${reply.detected_by}` : ''}`
      + `${pass ? '' : ` | esperado: ${expected.outcome}${expected.item ? ` item ${expected.item}` : ''}`}`
      + `${warning ? ' | ALERTA: a IA não detectou esta urgência' : ''}`);
  }

  const {data: usage} = await client.from('patient_chat_usage').select('input_tokens, output_tokens').gte('created_at', started);
  const sum = key => (usage ?? []).reduce((total, row) => total + (row[key] ?? 0), 0);
  const cost = (sum('input_tokens') * PRICE.input + sum('output_tokens') * PRICE.output) / 1_000_000;
  console.log(`Tokens: ${sum('input_tokens')} de entrada, ${sum('output_tokens')} de saída. Custo medido: US$ ${cost.toFixed(5)}.`);
  if (incomplete) console.log('Rodada INCOMPLETA: informe a pergunta 11 em PATIENT_CHAT_Q11. Não está aprovada.');
  if (alerts) console.log(`${alerts} alerta(s): a lista cobriu urgências que a IA não detectou.`);
  if (failed) console.log(`REPROVADO: ${failed} pergunta(s) fora do esperado.`);
  if (!failed && !incomplete) console.log(only === null ? 'APROVADO: as 18 perguntas no resultado esperado.' : 'Pergunta no resultado esperado.');
  process.exitCode = failed || incomplete ? 1 : 0;
}

async function main() {
  if (process.env.PATIENT_CHAT_SUPABASE_URL) assertLocalUrl(process.env.PATIENT_CHAT_SUPABASE_URL);
  if (has('--dry-run')) return dryRun();
  if (!has('--confirm-paid')) {
    console.error('Cada pergunta é uma chamada paga à IA. Estimativa, ainda não medida: menos de US$ 0,02 pelas 18. Para rodar, use --confirm-paid. Nenhuma chamada foi feita.');
    process.exitCode = 1;
    return;
  }
  await run();
}

main().catch(error => { console.error(error.message); process.exit(1); });
