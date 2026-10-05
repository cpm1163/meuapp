// Tests for the lab-report module with a fictitious report (never real patient data).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const load = file => {
  const exportsObject = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  // Same realm as the tests, so deepEqual compares arrays and objects strictly.
  vm.runInThisContext(`(function (exports) {${source}\n})`)(exportsObject);
  return exportsObject;
};
const {generateFindings, failureReason, normalizeUnit, FINDING_ORDER} = load('modules/lab-report/findings.ts');
const {validateSchema} = load('modules/lab-report/schema-check.ts');
const schema = JSON.parse(fs.readFileSync('modules/lab-report/extraction.schema.json', 'utf8'));
const fixture = () => JSON.parse(fs.readFileSync('tests/fixtures/lab-report/fictitious-report.json', 'utf8'));
const param = (report, name) => report.exams.flatMap(exam => exam.parameters).find(item => item.name === name);
const pick = (findings, kind, parameter) => findings.filter(item => item.kind === kind && (!parameter || item.parameter_name === parameter));

test('schema uses only keywords accepted by structured outputs', () => {
  const allowed = new Set(['$schema', 'title', 'description', 'type', 'enum', 'const', 'properties', 'required',
    'additionalProperties', 'items', '$ref', '$defs', 'anyOf']);
  const walk = (node, path) => {
    for (const key of Object.keys(node)) assert.ok(allowed.has(key), `${path}: keyword ${key} not supported`);
    if (node.properties) {
      assert.equal(node.additionalProperties, false, `${path}: objects need additionalProperties false`);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${path}: every property must be required`);
      for (const [key, child] of Object.entries(node.properties)) walk(child, `${path}.${key}`);
    }
    if (node.items) walk(node.items, `${path}[]`);
    for (const [key, child] of Object.entries(node.$defs ?? {})) walk(child, `#/$defs/${key}`);
  };
  walk(schema, '$');
});

test('fictitious report matches the schema; malformed extractions do not', () => {
  assert.deepEqual(validateSchema(schema, fixture()), []);
  const extra = fixture(); extra.patient_name = 'Fulano';
  assert.match(validateSchema(schema, extra).join(), /patient_name: not allowed/);
  const missing = fixture(); delete missing.exams[0].parameters[0].lab_flag;
  assert.match(validateSchema(schema, missing).join(), /lab_flag: required/);
  const wrongEnum = fixture(); wrongEnum.exams[0].parameters[0].reference.kind = 'guess';
  assert.match(validateSchema(schema, wrongEnum).join(), /value not in enum/);
  const wrongType = fixture(); wrongType.exams[0].parameters[0].value_number = '4,80';
  assert.match(validateSchema(schema, wrongType).join(), /expected number\|null/);
});

test('failure reasons end the analysis before findings', () => {
  assert.equal(failureReason(fixture()), null);
  assert.equal(failureReason({...fixture(), is_lab_report: false}), 'not_lab_report');
  assert.equal(failureReason({...fixture(), legibility: 'unreadable'}), 'unreadable');
  assert.equal(failureReason({...fixture(), exams: []}), 'no_exams_found');
});

test('fictitious report produces exactly the expected findings', () => {
  const summary = generateFindings(fixture()).map(item => `${item.kind}:${item.reason}:${item.parameter_name ?? item.exam_name}`);
  assert.deepEqual(summary, [
    'out_of_reference:above_reference:Glicose',
    'out_of_reference:above_reference:Creatinina',
    'out_of_reference:below_reference:25-OH Vitamina D',
    'out_of_reference:not_expected_value:Nitrito',
    'table_check:clinical_category:LDL',
    'history_change:left_reference:Glicose',
    'lab_flag_divergence:lab_flag_differs:TSH',
    'unverifiable:value_not_read:Ferritina',
    'incomplete_reading:exam_not_extracted:Ácido Úrico',
    'lab_note:lab_note:Hemograma com Contagem de Plaquetas',
    'lab_note:lab_note:Hemoglobina Glicada',
  ]);
});

test('findings follow the display order and carry page, reference and previous value', () => {
  const findings = generateFindings(fixture());
  const order = findings.map(item => FINDING_ORDER.indexOf(item.kind));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const glucose = pick(findings, 'out_of_reference', 'Glicose')[0];
  assert.equal(glucose.page, 3);
  assert.equal(glucose.reference_text, '70 a 99');
  assert.deepEqual(glucose.previous, {date: '2025-03-10', value_text: '95'});
  assert.equal(glucose.details.flagged_by_lab, true);
});

test('values without a lab flag are still compared (table by sex picks the row)', () => {
  const creatinine = pick(generateFindings(fixture()), 'out_of_reference', 'Creatinina')[0];
  assert.equal(creatinine.details.flagged_by_lab, false);
  assert.equal(creatinine.details.row, 'Homens');
  const female = fixture(); female.patient_sex = 'female';
  assert.equal(pick(generateFindings(female), 'out_of_reference', 'Creatinina')[0].details.row, 'Mulheres');
  const unknown = fixture(); unknown.patient_sex = null;
  const findings = generateFindings(unknown);
  assert.equal(pick(findings, 'out_of_reference', 'Creatinina').length, 0);
  assert.equal(pick(findings, 'table_check', 'Creatinina')[0].reason, 'no_unique_row');
});

test('bounds respect inclusive and exclusive limits', () => {
  const atLimit = fixture();
  param(atLimit, 'Glicose').value_number = 99; param(atLimit, 'Glicose').lab_flag = 'within';
  param(atLimit, '25-OH Vitamina D').value_number = 30;
  param(atLimit, 'PSA total').value_number = 4.0;
  const findings = generateFindings(atLimit);
  assert.equal(pick(findings, 'out_of_reference', 'Glicose').length, 0, 'range is inclusive');
  assert.equal(pick(findings, 'out_of_reference', '25-OH Vitamina D')[0].reason, 'below_reference', '"superior a 30" excludes 30');
  assert.equal(pick(findings, 'out_of_reference', 'PSA total')[0].reason, 'above_reference', '"inferior a 4,00" excludes 4,00');
});

test('lab flag is kept when the code cannot compare', () => {
  const report = fixture();
  param(report, 'LDL').lab_flag = 'above';
  param(report, 'Ferritina').lab_flag = 'below';
  const findings = generateFindings(report);
  assert.equal(pick(findings, 'out_of_reference', 'LDL')[0].reason, 'flagged_by_lab');
  assert.equal(pick(findings, 'out_of_reference', 'Ferritina')[0].reason, 'flagged_by_lab');
});

test('history: returning to and crossing the reference', () => {
  const back = fixture();
  param(back, 'Glicose').value_number = 90; param(back, 'Glicose').lab_flag = 'within';
  param(back, 'Glicose').history = [{date: '2025-03-10', value_number: 120, value_text: '120'}];
  assert.equal(pick(generateFindings(back), 'history_change', 'Glicose')[0].reason, 'returned_to_reference');
  const crossed = fixture();
  param(crossed, 'Glicose').history = [{date: '2025-03-10', value_number: 60, value_text: '60'}];
  assert.equal(pick(generateFindings(crossed), 'history_change', 'Glicose')[0].reason, 'crossed_reference');
  const latestByDate = fixture();
  param(latestByDate, 'Glicose').history = [
    {date: '2024-01-01', value_number: 120, value_text: '120'}, {date: '2025-03-10', value_number: 95, value_text: '95'}];
  assert.deepEqual(pick(generateFindings(latestByDate), 'history_change', 'Glicose')[0].previous, {date: '2025-03-10', value_text: '95'});
});

test('partial legibility is reported', () => {
  const report = fixture(); report.legibility = 'partial';
  assert.equal(pick(generateFindings(report), 'incomplete_reading').some(item => item.reason === 'partial_legibility'), true);
});

test('hemogram: consistent values produce no alert', () => {
  assert.equal(pick(generateFindings(fixture()), 'hemogram_inconsistency').length, 0);
});

test('hemogram: wrong index, differential sum and absolute count are reported', () => {
  const report = fixture();
  param(report, 'VCM').value_number = 95;
  param(report, 'Linfócitos (%)').value_number = 34;
  param(report, 'Basófilos').value_number = 800;
  const alerts = pick(generateFindings(report), 'hemogram_inconsistency').map(item => item.details.check);
  assert.deepEqual(alerts.sort(), ['basophils_abs', 'differential_sum', 'lymphocytes_abs', 'mcv']);
});

test('hemogram: rounding of small counts stays within tolerance', () => {
  const report = fixture();
  // 1,0% of 8.000 = 80; printed 84 is rounding noise on a small count.
  param(report, 'Basófilos').value_number = 84;
  param(report, 'CHCM').value_number = 33.4;
  assert.equal(pick(generateFindings(report), 'hemogram_inconsistency').length, 0);
});

test('hemogram: unrecognized units are not guessed', () => {
  const report = fixture();
  param(report, 'Hemácias').unit = 'células';
  const findings = generateFindings(report);
  assert.equal(pick(findings, 'hemogram_inconsistency').length, 0);
  assert.deepEqual(pick(findings, 'unverifiable').filter(item => item.reason === 'unit_not_recognized').map(item => item.details.check).sort(), ['mch', 'mcv']);
});

test('unit normalization accepts common printed forms', () => {
  for (const unit of ['milhões/mm³', '10⁶/µL', 'x10^6/uL', '10^6/µL']) assert.equal(normalizeUnit(unit), 'M/uL', unit);
  assert.equal(normalizeUnit('g/dL'), 'g/dL');
  assert.equal(normalizeUnit('/mm³'), normalizeUnit('/µL'), 'mm³ and µL are the same volume');
});
