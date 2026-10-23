// Tests for the clinical-considerations comparator with fictitious values (never real patient data).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const loaded = new Map();
const load = file => {
  if (loaded.has(file)) return loaded.get(file);
  const exportsObject = {};
  loaded.set(file, exportsObject);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const requireRelative = specifier => load(path.join(path.dirname(file), specifier));
  vm.runInThisContext(`(function (exports, require) {${source}\n})`)(exportsObject, requireRelative);
  return exportsObject;
};
const {compareWithStatements, checkStatements, ageFromYears, ageFromBirthDate, fastingState} = load('modules/clinical-considerations/compare.ts');
const curated = JSON.parse(fs.readFileSync('modules/clinical-considerations/curated-statements.json', 'utf8'));

const parameter = (code, value, unit, name = code) => ({
  name, code, value_kind: 'numeric', value_number: value, value_text: value === null ? '' : String(value), unit,
  reference: {kind: 'none', text: '', low: null, low_inclusive: false, high: null, high_inclusive: false, expected: [], rows: []},
  lab_flag: 'none', history: [], page: 1,
});
const extraction = (fasting, ...parameters) => ({
  schema_version: 'lab-report/3', has_lab_exams: true, legibility: 'ok', laboratory: {name: '', registration: ''},
  patient_sex: null, patient_age_years: null, collected_at: '', generated_at: '', executed_exams: [], other_exams: [],
  exams: [{exam_name: 'Exame fictício', pages: [1], material: '', method: '', fasting_text: fasting.text, fasting_hours: fasting.hours,
    responsible: [], lab_notes: [], parameters}],
});
const FASTING = {'fasting': {text: 'Jejum: 12 horas', hours: 12}, 'non_fasting': {text: 'Sem jejum', hours: null}, null: {text: '', hours: null}};
const patient = (sex, years, fasting = null) => ({sex, age: ageFromYears(years), fasting});
const run = ({fasting, ...person}, ...parameters) => compareWithStatements(extraction(FASTING[fasting], ...parameters), person, curated);
const one = (person, item) => {
  const result = run(person, item);
  assert.equal(result.length, 1);
  return result[0];
};

test('curated statements file has no structural problems', () => {
  assert.deepEqual(checkStatements(curated), []);
});

test('10-year-old girl from the example: lipids, haemoglobin and vitamin D', () => {
  const result = run(patient('female', 10),
    parameter('total_cholesterol', 210, 'mg/dL'), parameter('ldl_c', 138, 'mg/dL'), parameter('hdl_c', 50, 'mg/dL'),
    parameter('hemoglobin', 11.3, 'g/dL'), parameter('vitamin_d_25oh', 26, 'ng/mL'));
  const labels = result.map(item => [item.statement_id, item.class_label]);
  assert.deepEqual(labels, [
    ['sbp2020-ct-2a19', 'Acima do nível aceitável'],
    ['sbp2020-ldl-2a19', 'Acima do nível aceitável'],
    ['sbp2020-hdl-2a19', 'Aceitável'],
    ['who2024-hb-5a11a', 'Abaixo do corte da OMS para anemia'],
    ['sbp2024-vitd-aap', 'Suficiência'],
    ['sbp2024-vitd-consenso-raquitismo', 'Suficiência'],
  ]);
  assert.equal(result[3].compared_value, 113);
  assert.equal(result[3].compared_unit, 'g/L');
});

test('limits follow the inclusive and exclusive bounds of the source', () => {
  assert.equal(one(patient('male', 8), parameter('ldl_c', 110, 'mg/dL')).class_label, 'Acima do nível aceitável');
  assert.equal(one(patient('male', 8), parameter('ldl_c', 109, 'mg/dL')).class_label, 'Aceitável');
  assert.equal(one(patient('male', 8), parameter('hdl_c', 45, 'mg/dL')).class_label, 'Abaixo do nível aceitável');
  assert.equal(one(patient('male', 8), parameter('hemoglobin', 11.5, 'g/dL')).class_label, 'No corte da OMS ou acima');
});

test('adult lipids use SBC 2025, and age 20 is a visible gap', () => {
  const adult = one(patient('female', 21), parameter('total_cholesterol', 195, 'mg/dL'));
  assert.equal(adult.statement_id, 'sbc2025-ct-adulto');
  assert.equal(adult.class_label, 'Acima do valor referencial');
  assert.equal(one(patient('female', 20), parameter('total_cholesterol', 195, 'mg/dL')).reason, 'no_statement');
  // LDL of adults depends on the cardiovascular risk category, so there is no statement for it.
  assert.equal(one(patient('female', 40), parameter('ldl_c', 150, 'mg/dL')).reason, 'no_statement');
});

test('vitamin D in a gap of the AAP ranges stays unclassified by that criterion only', () => {
  const [aap, rickets] = run(patient('male', 6), parameter('vitamin_d_25oh', 15.5, 'ng/mL'));
  assert.equal(aap.status, 'outside_classes');
  assert.equal(aap.class_label, null);
  assert.equal(rickets.class_label, 'Insuficiência');
});

test('vitamin D in nmol/L is converted with the factor stated by the source', () => {
  const [aap] = run(patient('male', 6), parameter('vitamin_d_25oh', 65, 'nmol/L'));
  assert.equal(aap.compared_value, 26);
  assert.equal(aap.class_label, 'Suficiência');
});

test('triglycerides need the fasting state printed on the report', () => {
  assert.equal(one(patient('female', 8), parameter('triglycerides', 80, 'mg/dL')).reason, 'fasting_unknown');
  assert.equal(one(patient('female', 8, 'fasting'), parameter('triglycerides', 80, 'mg/dL')).class_label, 'Acima do nível aceitável');
  assert.equal(one(patient('female', 8, 'non_fasting'), parameter('triglycerides', 80, 'mg/dL')).class_label, 'Aceitável');
});

test('fasting state comes only from what the laboratory printed', () => {
  assert.equal(fastingState('Jejum: 12 horas', 12), 'fasting');
  assert.equal(fastingState('Jejum mínimo de 14 h', 14), 'fasting');
  assert.equal(fastingState('Sem jejum', null), 'non_fasting');
  assert.equal(fastingState('SEM JEJUM', 0), 'non_fasting');
  // A fast shorter than 12 h, a contradiction or nothing printed stay unknown.
  assert.equal(fastingState('Jejum: 8 horas', 8), null);
  assert.equal(fastingState('Sem jejum', 12), null);
  assert.equal(fastingState('', null), null);
  assert.equal(one(patient('male', 40, 'fasting'), parameter('triglycerides', 160, 'mg/dL')).class_label, 'Acima do valor referencial');
  assert.equal(one(patient('male', 40, 'non_fasting'), parameter('triglycerides', 160, 'mg/dL')).class_label, 'Desejável');
});

test('missing or ambiguous demographics skip the comparison', () => {
  assert.equal(one(patient(null, 30), parameter('hemoglobin', 12.5, 'g/dL')).reason, 'sex_unknown');
  // Statements valid for both sexes still apply when the sex is unknown.
  assert.equal(one(patient(null, 10), parameter('hemoglobin', 12.5, 'g/dL')).class_label, 'No corte da OMS ou acima');
  assert.equal(one(patient('male', null), parameter('ldl_c', 100, 'mg/dL')).reason, 'age_unknown');
  // "0 years" spans 0 to 11 months, which only partly overlaps the WHO 6-23 months group.
  assert.equal(one(patient('male', 0), parameter('hemoglobin', 11, 'g/dL')).reason, 'age_ambiguous');
  assert.equal(one(patient('male', 70), parameter('hemoglobin', 11, 'g/dL')).reason, 'no_statement');
});

test('age from the birth date counts completed months at collection', () => {
  assert.deepEqual(ageFromBirthDate('2016-03-15', '2026-03-14'), {min: 119, max: 120});
  assert.deepEqual(ageFromBirthDate('2016-03-15', '2026-03-15T08:30'), {min: 120, max: 121});
  assert.equal(ageFromBirthDate('', '2026-03-15'), null);
  assert.equal(ageFromBirthDate('2026-04-01', '2026-03-15'), null);
  // 119 months is still in the 2 to 9 years triglycerides group; 120 months is not.
  const person = collected => ({sex: 'female', age: ageFromBirthDate('2016-03-15', collected), fasting: 'fasting'});
  assert.equal(one(person('2026-03-14'), parameter('triglycerides', 80, 'mg/dL')).statement_id, 'sbp2020-tg-2a9-jejum');
  assert.equal(one(person('2026-03-15'), parameter('triglycerides', 80, 'mg/dL')).statement_id, 'sbp2020-tg-10a19-jejum');
});

test('unknown units, missing values and uncoded parameters are not classified', () => {
  assert.equal(one(patient('male', 8), parameter('ldl_c', 2.8, 'mmol/L')).reason, 'unit_mismatch');
  assert.equal(one(patient('male', 8), parameter('ldl_c', null, 'mg/dL')).reason, 'no_value');
  assert.deepEqual(run(patient('male', 8), parameter(null, 30, 'mg/dL', 'VLDL'), parameter('platelets', 250, '10³/µL')), []);
});

test('structural check catches overlapping classes, unknown sources and units', () => {
  const broken = structuredClone(curated);
  broken.statements[0].classes = [{label: 'A', max: 170, max_inclusive: true}, {label: 'B', min: 170, min_inclusive: true}];
  broken.statements[1].source = 'unknown';
  broken.statements[2].unit = 'mmol/L';
  broken.statements[3].id = broken.statements[4].id;
  const errors = checkStatements(broken);
  assert.ok(errors.some(item => item.includes('classes A and B overlap')));
  assert.ok(errors.some(item => item.includes('unknown source')));
  assert.ok(errors.some(item => item.includes('unit mmol/L has no conversions')));
  assert.ok(errors.some(item => item.includes('duplicate id')));
});
