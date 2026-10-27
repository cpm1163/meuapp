// Tests for the patient service: the record's notes (anamnese) and their messages, with a fake Supabase client.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Records every call the service makes; the database itself is covered by supabase/tests/patient_notes_rls.test.sql.
const calls = [];
const query = {
  select(columns) { calls.push(['select', columns]); return this; },
  eq(column, value) { calls.push(['eq', column, value]); return this; },
  order(column, options) { calls.push(['order', column, options]); return Promise.resolve({data: [], error: null}); },
};
const fakeClient = {
  from(table) { calls.push(['from', table]); return query; },
  rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve({data: null, error: null}); },
};
const load = file => {
  const exportsObject = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const requireStub = spec => {
    if (spec === '@supabase/supabase-js') return {createClient: () => fakeClient};
    throw new Error(`unexpected import ${spec}`);
  };
  vm.runInThisContext(`(function (exports, require) {${source}\n})`)(exportsObject, requireStub);
  return exportsObject;
};
const patients = load('src/features/patients/service.ts');

test('notes are listed most recent first, and written and corrected with trimmed text', async () => {
  const service = patients.createPatientService('token');
  calls.length = 0;
  await service.listNotes('p1');
  assert.deepEqual(calls.slice(-3), [['select', 'id, patient_id, body, created_at, updated_at'], ['eq', 'patient_id', 'p1'],
    ['order', 'created_at', {ascending: false}]]);
  await service.createNote('p1', '  Refere cansaço.  ');
  assert.deepEqual(calls.at(-1), ['rpc', 'create_patient_note', {patient_id: 'p1', body: 'Refere cansaço.'}]);
  await service.updateNote('n1', ' Corrigido ');
  assert.deepEqual(calls.at(-1), ['rpc', 'update_patient_note', {note_id: 'n1', body: 'Corrigido'}]);
});

test('a note shows its entry date and time in the device time zone', () => {
  assert.equal(patients.formatNoteDate(new Date(2026, 9, 27, 14, 5).toISOString()), '27/10/2026 · 14:05');
  assert.equal(patients.formatNoteDate(new Date(2026, 0, 3, 9, 0).toISOString()), '03/01/2026 · 09:00');
});

test('database refusals about notes become messages for the doctor', () => {
  assert.match(patients.patientError({message: 'patient_has_notes', code: '23503'}), /anotações na ficha/);
  assert.match(patients.patientError({message: 'note_not_available', code: '42501'}), /Anotação indisponível/);
  assert.match(patients.patientError({message: 'module_not_available', code: '42501'}), /não está liberada/);
});
