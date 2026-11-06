// Tests for the patient chat rules, without any AI call. The private KB file is never copied here.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {load, QUESTIONS_FILE, assertLocalUrl, cloudKbTarget, extractQuestions, requestBody} = require('./patient-chat-helpers.cjs');

const {parseKb} = load('modules/patient-chat/kb.ts');
const decision = load('modules/patient-chat/decision.ts');
const {hasUrgencySignal} = load('modules/patient-chat/urgency-signals.ts');
const request = load('modules/patient-chat/request.ts');

const KB = [{item: 1, question: 'O que é X?', answer: 'X é Y.'}, {item: 2, question: 'O que é Z?', answer: 'Z é W.'}];
const classify = (intent, item = null, urgent = false) => ({urgent, intent, item});

test('the KB file becomes numbered items, with the warning line left out', () => {
  assert.deepEqual(parseKb('# FICTÍCIO\n\n1. O que é X?\n\nResposta: X é Y.\n\n2. O que é Z?\nResposta: Z é W.\n'), KB);
});

test('a malformed KB file is rejected', () => {
  for (const text of ['', '# só o título', '1. Sem resposta?', 'Resposta: sem pergunta', '1. A?\n2. B?\nResposta: b',
    'texto solto', '1. A?\nResposta: a\n1. B?\nResposta: b']) assert.throws(() => parseKb(text), /invalid_kb/, text);
});

test('an AI answer is accepted only as the exact classification', () => {
  assert.deepEqual(decision.parseClassification('{"urgent":false,"intent":"answer","item":2}'), classify('answer', 2));
  for (const text of ['nada', 'null', '{"urgent":"sim","intent":"answer","item":2}', '{"urgent":false,"intent":"outra","item":null}',
    '{"urgent":false,"intent":"answer","item":"2"}', '{"urgent":false,"intent":"answer","item":1.5}', '{"intent":"answer","item":1}'])
    assert.equal(decision.parseClassification(text), null, text);
});

test('each line of the decision table gives its reply', () => {
  const {decide, REPLIES} = decision;
  const urgency = {outcome: 'urgency', text: REPLIES.urgency, item: null};
  assert.deepEqual(decide(true, null, KB), {...urgency, detected_by: 'code'});
  assert.deepEqual(decide(true, classify('answer', 1), KB), {...urgency, detected_by: 'code'});
  assert.deepEqual(decide(true, classify('answer', 1, true), KB), {...urgency, detected_by: 'both'});
  assert.deepEqual(decide(false, classify('decline', 1, true), KB), {...urgency, detected_by: 'ai'});
  assert.equal(decide(false, null, KB).outcome, 'unavailable');
  assert.deepEqual(decide(false, classify('answer', 2), KB), {outcome: 'answer', text: 'Z é W.', item: 2, detected_by: null});
  for (const intent of ['not_in_kb', 'refer_doctor', 'decline'])
    assert.deepEqual(decide(false, classify(intent, 2), KB), {outcome: intent, text: REPLIES[intent], item: null, detected_by: null});
});

test('a citation that does not exist never shows an item', () => {
  for (const item of [99, null]) {
    const result = decision.decide(false, classify('answer', item), KB);
    assert.deepEqual(result, {outcome: 'not_in_kb', text: decision.REPLIES.not_in_kb, item: null, detected_by: null});
    assert.equal(decision.isInvalidCitation(classify('answer', item), KB), true);
  }
  assert.equal(decision.isInvalidCitation(classify('answer', 1), KB), false);
  assert.equal(decision.isInvalidCitation(classify('decline', 99), KB), false);
});

test('the failure reply carries the urgency guidance', () => {
  assert.match(decision.REPLIES.unavailable, /192/);
  assert.match(decision.REPLIES.urgency, /192/);
  assert.match(decision.REPLIES.urgency, /188/);
});

test('the signals are found regardless of accents, capitals and spacing', () => {
  for (const text of ['Ele está com FALTA  DE AR', 'nao consegue respirar direito', 'Teve uma convulsão', 'quer se matar', 'suicídio'])
    assert.equal(hasUrgencySignal(text), true, text);
});

test('without an expression from the list there is no signal, loose words included', () => {
  for (const text of ['O que é asma?', 'Qual é a função dos pulmões?', 'falta de arroz na escola', 'Tenho dúvida sobre ar-condicionado', 'matar a curiosidade', ''])
    assert.equal(hasUrgencySignal(text), false, text);
});

test('the signal list can only lead to urgency, never to a refusal', () => {
  // A message with no signal keeps the reply of its intent; a signal changes it only to urgency.
  for (const intent of ['answer', 'not_in_kb', 'refer_doctor', 'decline']) {
    const classification = classify(intent, 1);
    assert.equal(decision.decide(true, classification, KB).outcome, 'urgency');
    assert.equal(decision.decide(false, classification, KB).outcome, intent);
  }
});

test('only the start of a very long message is scanned', () => {
  assert.equal(hasUrgencySignal(`${'a '.repeat(100)} falta de ar`), true);
  assert.equal(hasUrgencySignal(`${'a '.repeat(1100)} falta de ar`), false);
});

test('the request has the whole KB in the system prompt and the message alone in messages', () => {
  const params = request.buildChatParams('Minha pergunta', KB);
  assert.equal(params.model, 'claude-haiku-5-5');
  assert.equal(params.output_config.effort, 'low');
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.deepEqual(params.messages, [{role: 'user', content: 'Minha pergunta'}]);
  assert.match(params.system, /1\. O que é X\?\nResposta: X é Y\.\n\n2\. O que é Z\?\nResposta: Z é W\./);
  assert.doesNotMatch(params.system, /Minha pergunta/);
});

test('the prompt quotes none of the acceptance questions', {skip: !fs.existsSync(QUESTIONS_FILE)}, () => {
  const {system} = request.buildChatParams('x', []);
  for (const [number, question] of extractQuestions(fs.readFileSync(QUESTIONS_FILE, 'utf8')))
    if (question) assert.equal(system.includes(question), false, `question ${number}`);
});

test('only the text of each question leaves the questions file', () => {
  const questions = extractQuestions(`# Título

Texto de instrução (com parênteses).

## Deve responder

A resposta deve repetir o item.

5. Com que idade toma? (item 51: 17 meses)
6. Qual é o valor (em ng/mL) normal? (item 52: 1 a 2 ng/mL)
7. O que é X?
11. [Mensagem escrita só na hora do teste.]
`);
  assert.deepEqual([...questions], [[5, 'Com que idade toma?'], [6, 'Qual é o valor (em ng/mL) normal?'], [7, 'O que é X?'], [11, null]]);
  assert.deepEqual(requestBody('Com que idade toma?'), {question: 'Com que idade toma?'});
});

test('the scripts accept only the local Supabase', () => {
  assertLocalUrl('http://127.0.0.1:54321');
  assertLocalUrl('http://localhost:54321');
  assert.throws(() => assertLocalUrl('https://abc.supabase.co'), /recusado/);
  assert.throws(() => assertLocalUrl('http://192.168.1.72:54321'), /recusado/);
});

test('the migration stays inert in the cloud: module disabled and no KB data', () => {
  const sql = fs.readFileSync('supabase/migrations/20261103000100_patient_chat.sql', 'utf8');
  assert.match(sql, /'2026-11-03-draft', 'disabled'\);/);
  assert.doesNotMatch(sql, /insert into public\.patient_chat_kb_items/);
});

// The screen's service, with a fake Supabase client.
class FunctionsHttpError extends Error {
  constructor(body) { super('http'); this.context = {json: async () => body}; }
}
let invoke;
const {createPatientChatService} = load('src/features/patient-chat/service.ts', {
  '@supabase/supabase-js': {createClient: () => ({functions: {invoke: (...args) => invoke(...args)}}), FunctionsHttpError},
  '../../../modules/patient-chat/decision': decision,
});
const ask = () => createPatientChatService('token').ask('Pergunta');

test('the screen sends only the question and shows the server reply', async () => {
  let sent;
  invoke = async (name, options) => { sent = [name, options]; return {data: {outcome: 'answer', text: 'Z é W.', item: 2, detected_by: null}, error: null}; };
  assert.deepEqual(await ask(), {outcome: 'answer', text: 'Z é W.', item: 2});
  assert.deepEqual(sent, ['patient-chat', {body: {question: 'Pergunta'}}]);
});

test('a connection failure or an unknown error shows the fixed failure reply', async () => {
  const failure = {outcome: 'unavailable', text: decision.REPLIES.unavailable, item: null};
  invoke = async () => { throw new Error('offline'); };
  assert.deepEqual(await ask(), failure);
  invoke = async () => ({data: null, error: new Error('fetch failed')});
  assert.deepEqual(await ask(), failure);
  invoke = async () => ({data: null, error: new FunctionsHttpError({error: 'start_failed'})});
  assert.deepEqual(await ask(), failure);
  invoke = async () => ({data: {}, error: null});
  assert.deepEqual(await ask(), failure);
});

test('the chat entry needs the module released, with the terms accepted, in testing or active', () => {
  const {canOpenPatientChat} = load('src/features/patient-chat/access.ts');
  const open = {module_id: 'patient-chat', module_status: 'testing', active: true, terms_accepted: true};
  assert.equal(canOpenPatientChat(open), true);
  assert.equal(canOpenPatientChat({...open, module_status: 'active'}), true);
  for (const change of [{module_id: 'lab-report'}, {active: false}, {terms_accepted: false}, {module_status: 'disabled'}, {module_status: 'draft'}])
    assert.equal(canOpenPatientChat({...open, ...change}), false, JSON.stringify(change));
});

test('the limit message carries the urgency guidance', async () => {
  invoke = async () => ({data: null, error: new FunctionsHttpError({error: 'chat_limit_reached'})});
  assert.match((await ask()).text, /limite[\s\S]*192/);
});

test('the cloud KB load targets only a linked cloud project ref', () => {
  assert.deepEqual(cloudKbTarget('abcdefghijklmnopqrst\n'), {ref: 'abcdefghijklmnopqrst', url: 'https://abcdefghijklmnopqrst.supabase.co'});
  for (const ref of ['', 'localhost', '127.0.0.1', 'abc', 'ABCDEFGHIJKLMNOPQRST', 'abcdefghijklmnopqrst.evil'])
    assert.throws(() => cloudKbTarget(ref), /recusado/, ref);
});

test('the cloud KB load changes nothing without --confirm-cloud', {skip: !fs.existsSync('supabase/.temp/project-ref') || !fs.existsSync('tests/fixtures/private/kb/teste_kb.md')}, () => {
  const {spawnSync} = require('node:child_process');
  const run = args => spawnSync(process.execPath, ['tests/patient-chat.cloud-kb.cjs', ...args], {encoding: 'utf8'});
  const dry = run(['--dry-run']);
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /Projeto da nuvem: [a-z0-9]{20}[\s\S]*\d+ itens[\s\S]*nada foi alterado/);
  const refused = run([]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /falta --confirm-cloud/);
  assert.doesNotMatch(refused.stdout + refused.stderr, /KB na nuvem/);
});
