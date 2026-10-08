// Tests for the lab-report module with a fictitious report (never real patient data).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const path = require('node:path');
const loaded = new Map();
const load = file => {
  if (loaded.has(file)) return loaded.get(file);
  const exportsObject = {};
  loaded.set(file, exportsObject);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  // Relative imports between module files ('./findings.ts') resolve through the same loader.
  const requireRelative = specifier => load(path.join(path.dirname(file), specifier));
  // Same realm as the tests, so deepEqual compares arrays and objects strictly.
  vm.runInThisContext(`(function (exports, require) {${source}\n})`)(exportsObject, requireRelative);
  return exportsObject;
};
const {generateFindings, failureReason, normalizeUnit, FINDING_ORDER} = load('modules/lab-report/findings.ts');
const {validateSchema} = load('modules/lab-report/schema-check.ts');
const request = load('modules/lab-report/request.ts');
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
  assert.equal(failureReason({...fixture(), has_lab_exams: false, exams: []}), 'no_lab_exams');
  assert.equal(failureReason({...fixture(), legibility: 'unreadable'}), 'unreadable');
  assert.equal(failureReason({...fixture(), has_lab_exams: false, legibility: 'unreadable'}), 'unreadable');
  assert.equal(failureReason({...fixture(), exams: []}), 'no_exams_found');
});

// Fictitious mixed report: the lab exams plus an ultrasound and a page with only images.
const mixed = () => {
  const report = fixture();
  report.executed_exams.push('Ultrassonografia do Abdome Total');
  report.other_exams = [
    {exam_name: 'ULTRASSONOGRAFIA DO ABDOME TOTAL', kind: 'descriptive', pages: [7]},
    {exam_name: 'Série de imagens', kind: 'other', pages: [8, 9]},
  ];
  return report;
};

test('mixed report: other exams match the schema; unknown kinds and transcribed content do not', () => {
  assert.deepEqual(validateSchema(schema, mixed()), []);
  const wrongKind = mixed(); wrongKind.other_exams[0].kind = 'imaging';
  assert.match(validateSchema(schema, wrongKind).join(), /value not in enum/);
  const transcribed = mixed(); transcribed.other_exams[0].text = 'Fígado com forma normal';
  assert.match(validateSchema(schema, transcribed).join(), /text: not allowed/);
  const missing = mixed(); delete missing.other_exams;
  assert.match(validateSchema(schema, missing).join(), /other_exams: required/);
});

test('mixed report: lab findings unchanged, other exams reported as not analyzed, not as missing', () => {
  const labOnly = generateFindings(fixture());
  const findings = generateFindings(mixed());
  const notAnalyzed = pick(findings, 'not_analyzed');
  assert.deepEqual(notAnalyzed.map(item => `${item.reason}:${item.exam_name}:${item.page}`), [
    'descriptive_exam:ULTRASSONOGRAFIA DO ABDOME TOTAL:7',
    'other_exam:Série de imagens:8',
  ]);
  assert.deepEqual(notAnalyzed[1].details, {pages: [8, 9]});
  // The declared ultrasound is listed in other_exams, so it is not reported as an exam the reading missed.
  assert.deepEqual(pick(findings, 'incomplete_reading').map(item => item.exam_name), ['Ácido Úrico']);
  assert.deepEqual(findings.filter(item => item.kind !== 'not_analyzed'), labOnly);
  const order = findings.map(item => FINDING_ORDER.indexOf(item.kind));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('mixed report: a declared exam missing from both lists is still reported', () => {
  const report = mixed();
  report.other_exams = [];
  const missing = pick(generateFindings(report), 'incomplete_reading').map(item => item.exam_name);
  assert.deepEqual(missing, ['Ácido Úrico', 'Ultrassonografia do Abdome Total']);
});

test('document with only descriptive exams ends without lab findings', () => {
  const report = {...mixed(), has_lab_exams: false, exams: [], executed_exams: []};
  assert.deepEqual(validateSchema(schema, report), []);
  assert.equal(failureReason(report), 'no_lab_exams');
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

// Request and result handling (the batch call itself is not exercised here: no network, no cost).
const succeeded = (text, extra = {}) => ({type: 'succeeded', message: {model: 'claude-opus-5-5', stop_reason: 'end_turn',
  content: [{type: 'text', text}], usage: {input_tokens: 100, output_tokens: 50}, ...extra}});

test('request: PDF and photos are sent with the instructions, schema, model and cost ceiling', () => {
  const pdf = request.buildRequestParams({mimeType: 'application/pdf', base64: 'QUJD'}, schema);
  assert.equal(pdf.model, 'claude-opus-5-5');
  assert.equal(pdf.max_tokens, 64000);
  assert.deepEqual(pdf.output_config, {effort: 'medium'}, 'no structured outputs: the API rejects this schema as too large');
  assert.ok(pdf.system.startsWith(load('modules/lab-report/instructions.ts').INSTRUCTIONS));
  const sent = JSON.parse(pdf.system.slice(pdf.system.lastIndexOf('\n') + 1));
  assert.ok(!('$schema' in sent) && !('title' in sent));
  assert.deepEqual(sent.properties, schema.properties);
  assert.deepEqual(pdf.messages[0].content[0], {type: 'document', source: {type: 'base64', media_type: 'application/pdf', data: 'QUJD'}});
  const photo = request.buildRequestParams({mimeType: 'image/jpeg', base64: 'QUJD'}, schema);
  assert.equal(photo.messages[0].content[0].type, 'image');
  assert.throws(() => request.buildRequestParams({mimeType: 'text/plain', base64: 'QUJD'}, schema), /unsupported_file_type/);
});

test('result: JSON wrapped in a code fence or text is still read; the schema still decides', () => {
  const json = JSON.stringify(fixture());
  assert.equal(request.interpretResult(succeeded('```json\n' + json + '\n```'), schema).status, 'ready');
  assert.equal(request.interpretResult(succeeded('Segue o JSON:\n' + json), schema).status, 'ready');
  assert.equal(request.interpretResult(succeeded('```json\n{"exams": []}\n```'), schema).reason, 'invalid_output');
});

test('result: a valid extraction becomes a ready analysis with findings generated in code', () => {
  const outcome = request.interpretResult(succeeded(JSON.stringify(fixture())), schema);
  assert.equal(outcome.status, 'ready');
  assert.equal(outcome.model, 'claude-opus-5-5');
  assert.deepEqual(outcome.findings, generateFindings(fixture()));
  assert.deepEqual(outcome.usage, {input_tokens: 100, output_tokens: 50});
});

test('result: refusals, truncation, invalid JSON and schema errors fail without partial data', () => {
  const reason = result => request.interpretResult(result, schema).reason;
  assert.equal(reason(succeeded('{}', {stop_reason: 'refusal'})), 'model_refusal');
  assert.equal(reason(succeeded('{"exams": [', {stop_reason: 'max_tokens'})), 'output_truncated');
  assert.equal(reason(succeeded('não é JSON')), 'invalid_output');
  const extra = fixture(); extra.patient_name = 'Fulano';
  assert.equal(reason(succeeded(JSON.stringify(extra))), 'invalid_output');
  assert.equal(reason(succeeded(JSON.stringify({...fixture(), legibility: 'unreadable'}))), 'unreadable');
  assert.equal(reason(succeeded(JSON.stringify({...fixture(), has_lab_exams: false, exams: []}))), 'no_lab_exams');
  assert.equal(reason({type: 'errored'}), 'provider_error');
  const invalid = request.interpretResult({type: 'errored', error: {type: 'error',
    error: {type: 'invalid_request_error', message: 'Schema is too complex for compilation'}}}, schema);
  assert.deepEqual([invalid.reason, invalid.detail], ['provider_invalid_request', 'invalid_request_error: Schema is too complex for compilation']);
  assert.equal(reason({type: 'expired'}), 'provider_expired');
  assert.equal(reason({type: 'canceled'}), 'provider_canceled');
  assert.ok(!('extraction' in request.interpretResult(succeeded('não é JSON'), schema)));
});
