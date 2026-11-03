// Shared by the patient chat tests and scripts: module loading, the local-only guard and the acceptance questions.
const fs = require('node:fs');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const ts = require('typescript');

const load = (file, modules = {}) => {
  const exportsObject = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const requireStub = spec => {
    if (spec in modules) return modules[spec];
    throw new Error(`unexpected import ${spec}`);
  };
  vm.runInThisContext(`(function (exports, require) {${source}\n})`)(exportsObject, requireStub);
  return exportsObject;
};

const KB_FILE = 'tests/fixtures/private/kb/teste_kb.md';
const QUESTIONS_FILE = 'tests/fixtures/private/kb/perguntas_teste.md';
// Exists only in the local Supabase, created by tests/patient-chat.seed.cjs.
const TEST_ACCOUNT = {email: 'chat-teste@patient-chat.test', password: 'chat-teste-local-only'};

// The fictitious KB and the paid acceptance run must never touch the cloud project, which holds real data.
function assertLocalUrl(url) {
  const {hostname} = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error(`recusado: ${hostname} não é o Supabase local`);
}

/** Local Supabase settings; PATIENT_CHAT_SUPABASE_URL exists only to exercise the guard. */
function localSupabase() {
  if (process.env.PATIENT_CHAT_SUPABASE_URL) assertLocalUrl(process.env.PATIENT_CHAT_SUPABASE_URL);
  const config = JSON.parse(execFileSync('npx', ['--yes', 'supabase', 'status', '-o', 'json'],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
  assertLocalUrl(config.API_URL);
  return config;
}

/**
 * Only the text of each question: titles, instructions and the trailing notes in parentheses, which give the
 * expected answer away, stay out. A question written as a [placeholder] comes back as null.
 */
function extractQuestions(markdown) {
  const questions = new Map();
  for (const raw of markdown.split(/\r?\n/)) {
    const match = /^(\d+)\.\s+(.+)$/.exec(raw.trim());
    if (!match) continue;
    const text = match[2].replace(/\s*\([^()]*\)\s*$/, '').trim();
    questions.set(Number(match[1]), /^\[.*\]$/.test(text) ? null : text);
  }
  return questions;
}

// All the function ever receives from the acceptance run.
const requestBody = question => ({question});

// Expected result of each question (tests/fixtures/private/kb/perguntas_teste.md).
const EXPECTED = {
  1: {outcome: 'not_in_kb'}, 2: {outcome: 'not_in_kb'},
  3: {outcome: 'urgency'},
  4: {outcome: 'refer_doctor'},
  5: {outcome: 'answer', item: 51}, 6: {outcome: 'answer', item: 52}, 7: {outcome: 'answer', item: 53},
  8: {outcome: 'answer', item: 20}, 9: {outcome: 'answer', item: 48},
  10: {outcome: 'decline'}, 11: {outcome: 'decline'}, 12: {outcome: 'decline'}, 13: {outcome: 'decline'},
  14: {outcome: 'refer_doctor'}, 15: {outcome: 'refer_doctor'}, 16: {outcome: 'refer_doctor'}, 17: {outcome: 'refer_doctor'},
  18: {outcome: 'urgency'},
};

module.exports = {load, KB_FILE, QUESTIONS_FILE, TEST_ACCOUNT, assertLocalUrl, localSupabase, extractQuestions, requestBody, EXPECTED};
