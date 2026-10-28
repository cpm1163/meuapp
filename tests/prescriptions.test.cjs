// Tests for prescriptions: the service calls, with a fake Supabase client, and the printed HTML.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Records every call the service makes; the database itself is covered by supabase/tests/prescriptions_rls.test.sql.
const calls = [];
const fakeClient = {
  rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve({data: null, error: null}); },
};
const modules = {'@supabase/supabase-js': {createClient: () => fakeClient}};
const load = file => {
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
const service = load('src/features/prescriptions/service.ts');
modules['./service'] = service;
const {prescriptionHtml} = load('src/features/prescriptions/prescription-html.ts');

test('a prescription is sent with trimmed items, empty medications left out', async () => {
  calls.length = 0;
  await service.createPrescriptionService('token').create('p1', [
    {medication: ' Amoxicilina 500 mg ', dosage: ' 1 cápsula de 8/8 h ', quantity: ' 21 cápsulas '},
    {medication: '  ', dosage: '', quantity: ''},
  ], '  ');
  assert.deepEqual(calls.at(-1), ['rpc', 'create_prescription', {patient_id: 'p1', notes: null,
    items: [{medication: 'Amoxicilina 500 mg', dosage: '1 cápsula de 8/8 h', quantity: '21 cápsulas'}]}]);
});

test('the profile is saved with empty optional fields as null', async () => {
  calls.length = 0;
  await service.createPrescriptionService('token').saveProfile({full_name: ' Dr. A ', crm: '123', crm_uf: 'SP',
    specialty: '', rqe: null, address: ' Rua X ', phone: '', email: '', printed: ['address']});
  assert.deepEqual(calls.at(-1), ['rpc', 'save_doctor_profile', {full_name: 'Dr. A', crm: '123', crm_uf: 'SP',
    specialty: null, rqe: null, address: 'Rua X', phone: null, email: null, printed: ['address']}]);
});

test('the printed prescription has the header, the escaped items and the signature line', () => {
  const html = prescriptionHtml({
    id: 'r1', patient_id: 'p1', patient_name: 'Ana <Souza>', notes: 'Retorno\nem 7 dias', created_at: '2026-10-28T13:00:00Z',
    prescriber: {full_name: 'Dr. A', crm: '123', crm_uf: 'SP', address: 'Rua X'},
    items: [{medication: 'Amoxicilina 500 mg', dosage: '1 cápsula de 8/8 h', quantity: '21 cápsulas'},
      {medication: 'Dipirona', dosage: 'Se dor', quantity: ''}],
  });
  assert.match(html, /<h1>Dr\. A<\/h1><p class="muted">CRM 123\/SP<\/p><p class="muted">Rua X<\/p>/);
  assert.match(html, /Ana &lt;Souza&gt;/);
  assert.match(html, /<b>1\. Amoxicilina 500 mg<\/b><span>21 cápsulas<\/span>/);
  assert.match(html, /<b>2\. Dipirona<\/b><\/div>/);
  assert.match(html, /Retorno<br\/>em 7 dias/);
  assert.match(html, /Data: \d{2}\/10\/2026/);
  assert.equal(html.match(/CRM 123\/SP/g).length, 2);
});

test('errors become messages for the doctor', () => {
  assert.equal(service.prescriptionError({message: 'doctor_profile_missing', code: '23514'}),
    'Cadastre seus dados de médico antes da primeira receita.');
  assert.equal(service.prescriptionError({message: 'invalid_prescription_items', code: '23514'}),
    'Confira os medicamentos: cada um precisa de nome e posologia.');
});
