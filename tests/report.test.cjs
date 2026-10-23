// Tests for the analysis report (screen and PDF), using the fictitious report (never real patient data).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Like the loader in analyses.test.cjs, plus relative imports between the TypeScript files.
const cache = new Map();
const load = file => {
  const full = path.resolve(file.endsWith('.ts') ? file : `${file}.ts`);
  if (cache.has(full)) return cache.get(full);
  const exportsObject = {};
  cache.set(full, exportsObject);
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const requireTs = spec => load(path.join(path.dirname(full), spec));
  vm.runInThisContext(`(function (exports, require) {${source}\n})`)(exportsObject, requireTs);
  return exportsObject;
};
const {generateFindings} = load('modules/lab-report/findings.ts');
const report = load('src/features/analyses/report.ts');
const fixture = () => JSON.parse(fs.readFileSync('tests/fixtures/lab-report/fictitious-report.json', 'utf8'));

test('every parameter of every exam is in the report, with a status text and color', () => {
  const extraction = fixture();
  const built = report.buildReport(extraction, generateFindings(extraction), null);
  assert.deepEqual(built.exams.map(exam => exam.rows.length), extraction.exams.map(exam => exam.parameters.length));
  for (const row of built.exams.flatMap(exam => exam.rows)) {
    assert.ok(report.STATUS_TEXT[row.status], row.status);
    assert.ok(report.STATUS_COLORS[row.status], row.status);
  }
  assert.ok(built.exams.flatMap(exam => exam.rows).some(row => row.status !== 'within'), 'fixture has values outside the reference');
});

test('lab notes stay in their exam and leave the highlights; other findings are kept', () => {
  const extraction = fixture();
  const findings = generateFindings(extraction);
  const built = report.buildReport(extraction, findings, null);
  assert.equal(built.highlights.length, findings.filter(item => item.kind !== 'lab_note').length);
  assert.ok(built.highlights.every(item => item.kind !== 'lab_note'));
  assert.equal(built.exams.reduce((total, exam) => total + exam.notes.length, 0),
    extraction.exams.reduce((total, exam) => total + exam.lab_notes.length, 0));
  assert.equal(built.demographicsSource, 'report');
});

test('the patient record fills sex and age missing from the report, so tables by sex pick their row', () => {
  const extraction = fixture();
  extraction.patient_sex = null; extraction.patient_age_years = null;
  // Within the men's row and above the women's, so the sex decides.
  extraction.exams.find(exam => exam.exam_name === 'Creatinina').parameters[0].value_number = 1.2;
  const findings = generateFindings(extraction);
  const without = report.buildReport(extraction, findings, null);
  const creatinine = built => built.exams.find(exam => exam.name === 'Creatinina').rows[0];
  assert.equal(creatinine(without).status, 'table_check');
  assert.equal(without.demographicsSource, null);
  const withRecord = report.buildReport(extraction, findings, {sex: 'male', birthDate: '1980-06-20'});
  assert.equal(withRecord.sex, 'male');
  assert.equal(withRecord.age, 45, 'age on the collection date, before the birthday');
  assert.equal(withRecord.demographicsSource, 'record');
  assert.notEqual(creatinine(withRecord).status, 'table_check');
  assert.ok(creatinine(withRecord).row);
  assert.ok(!withRecord.highlights.some(item => item.kind === 'table_check' && item.parameter_name === 'Creatinina'));
});

test('age is counted in whole years at the collection date', () => {
  assert.equal(report.ageAt('1980-01-15', '2026-01-15T07:30'), 46);
  assert.equal(report.ageAt('1980-01-16', '2026-01-15'), 45);
  assert.equal(report.ageAt('', '2026-01-15'), null);
  assert.equal(report.ageAt('2000-05-01', '', new Date(2026, 4, 1)), 26);
});

test('the PDF has the disclaimer, colored statuses and no patient identification; texts are escaped', () => {
  const extraction = fixture();
  extraction.exams[1].parameters[0].name = '<script>alert(1)</script>';
  const built = report.buildReport(extraction, generateFindings(extraction), {sex: 'male', birthDate: '1980-06-20'});
  const html = report.reportHtml(built, new Date(2026, 9, 16, 12, 0));
  assert.ok(html.includes('sem interpretação clínica'));
  assert.ok(html.includes('Sem identificação do paciente'));
  assert.ok(html.includes('45 anos, Masculino'));
  assert.ok(html.includes(report.STATUS_COLORS.above.text) || html.includes(report.STATUS_COLORS.below.text));
  assert.ok(!html.includes('<script>alert'), 'AI text is escaped');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/cpf/i.test(html));
});

test('printed sex or age that contradicts the patient record raises the wrong-patient alert', () => {
  const extraction = fixture(); // printed: male, 45 years, collected 2026-01-15
  const findings = generateFindings(extraction);
  const check = record => report.buildReport(extraction, findings, record).recordMismatch;
  assert.deepEqual(check(null), [], 'no record, nothing to compare');
  assert.deepEqual(check({sex: 'male', birthDate: '1980-06-20'}), [], 'same sex, same age');
  assert.deepEqual(check({sex: 'male', birthDate: '1979-06-20'}), [], 'one year apart is tolerated');
  assert.deepEqual(check({sex: null, birthDate: null}), [], 'empty record fields are not a mismatch');
  const wrongSex = check({sex: 'female', birthDate: '1980-06-20'});
  assert.equal(wrongSex.length, 1);
  assert.match(wrongSex[0], /^Sexo no laudo: Masculino; no cadastro: Feminino\.$/);
  const wrongAge = check({sex: 'male', birthDate: '2015-10-29'});
  assert.equal(wrongAge.length, 1);
  assert.match(wrongAge[0], /Idade no laudo: 45 anos; pelo cadastro, na data da coleta: 10 anos\./);
  const noDate = fixture(); noDate.collected_at = '';
  assert.deepEqual(report.buildReport(noDate, findings, {sex: 'male', birthDate: '2015-10-29'}).recordMismatch, [],
    'without the collection date the age is not compared');
});

test('what the report prints and the record lacks is offered to complete the record', () => {
  const extraction = fixture(); // printed: male, 45 years
  const findings = generateFindings(extraction);
  const gaps = record => report.buildReport(extraction, findings, record).recordGaps;
  assert.deepEqual(gaps(null), {sex: null, age: null}, 'no linked patient, no suggestion');
  assert.deepEqual(gaps({sex: 'male', birthDate: '1980-06-20'}), {sex: null, age: null}, 'complete record');
  assert.deepEqual(gaps({sex: null, birthDate: '1980-06-20'}), {sex: 'male', age: null});
  assert.deepEqual(gaps({sex: 'male', birthDate: null}), {sex: null, age: 45});
  assert.deepEqual(gaps({sex: 'female', birthDate: null}).sex, null, 'a contradiction is the mismatch alert, not a gap');
  const unprinted = fixture(); unprinted.patient_sex = null; unprinted.patient_age_years = null;
  assert.deepEqual(report.buildReport(unprinted, findings, {sex: null, birthDate: null}).recordGaps, {sex: null, age: null});
});

test('search finds parameters and exams ignoring accents and case', () => {
  const built = report.buildReport(fixture(), generateFindings(fixture()), null);
  const hemogram = built.exams.findIndex(exam => exam.name === 'Hemograma com Contagem de Plaquetas');
  // Parameter inside an exam: only the matching rows, with the exam's position in the full report.
  const [leukocytes] = report.searchExams(built.exams, 'LEUCÓCITOS');
  assert.equal(leukocytes.index, hemogram);
  assert.deepEqual(leukocytes.exam.rows.map(row => row.name), ['Leucócitos']);
  // Words in any order, across the parameter and the exam name.
  assert.equal(report.searchExams(built.exams, 'plaquetas hemograma').length, 1);
  // An exam that matches by name keeps all its rows.
  const vitamin = report.searchExams(built.exams, 'vitamina d');
  assert.equal(vitamin.length, 1);
  assert.equal(vitamin[0].exam.rows.length, built.exams[vitamin[0].index].rows.length);
  assert.deepEqual(report.searchExams(built.exams, 'inexistente'), []);
  // Group words that are not in any printed name.
  for (const query of ['lipídios', 'Perfil lipídico', 'lipidograma']) {
    assert.deepEqual(report.searchExams(built.exams, query).map(({exam}) => exam.name), ['Colesterol LDL'], query);
  }
  assert.deepEqual(report.searchExams(built.exams, 'tireoide').map(({exam}) => exam.name), ['TSH']);
  assert.ok(report.searchExams(built.exams, 'função renal').some(({exam}) => exam.name === 'Creatinina'));
  assert.deepEqual(report.searchExams(built.exams, 'perfil').map(({exam}) => exam.name), [], 'a filler alone is searched as typed');
  assert.equal(report.searchExams(built.exams, '   ').length, built.exams.length);
});

test('the PDF has the considerations section only when it is given, escaped and with references', () => {
  const built = report.buildReport(fixture(), generateFindings(fixture()), null);
  const considerations = {
    items: [{title: 'LDL <b>', exam_name: 'Colesterol LDL', page: 4, lines: [{text: '110 mg/dL: aceitável (< 110 mg/dL) pela SBP 2020.', reference: 1}],
      caveats: ['Aviso de exemplo.']}],
    notCompared: [{title: 'Triglicérides', reason: 'o laudo não informa se a coleta foi em jejum'}],
    references: [{number: 1, text: 'Fonte fictícia. p. 3.', url: 'https://example.org'}],
  };
  const without = report.reportHtml(built, new Date('2026-10-23T12:00:00'));
  assert.ok(!without.includes('Considerações clínicas'));
  const html = report.reportHtml(built, new Date('2026-10-23T12:00:00'), considerations);
  assert.ok(html.includes('<h2>Considerações clínicas</h2>'));
  assert.ok(html.includes('não é laudo nem diagnóstico'));
  assert.ok(html.includes('LDL &lt;b&gt;'));
  assert.ok(html.includes('&lt; 110 mg/dL') && html.includes('[1]'));
  assert.ok(html.includes('Triglicérides (o laudo não informa se a coleta foi em jejum)'));
  assert.ok(html.includes('<li>Fonte fictícia. p. 3.</li>'));
  // After the exam tables.
  assert.ok(html.indexOf('Considerações clínicas') > html.indexOf('Colesterol LDL'));
  assert.ok(!html.includes('Por tema'), 'no themes section without a grouping');
  const themes = [{title: 'Perfil <lipídico>', outside: [{name: 'LDL', value: '140 mg/dL', status: 'above'}], within: ['HDL'], unchecked: []}];
  const withThemes = report.reportHtml(built, new Date('2026-10-23T12:00:00'), considerations, themes);
  assert.ok(withThemes.includes('<h3>Por tema</h3>'));
  assert.ok(withThemes.includes('<b>Perfil &lt;lipídico&gt;</b><br/>LDL: 140 mg/dL, acima da referência impressa.<br/>Dentro da referência impressa: HDL.'));
  assert.ok(withThemes.indexOf('Por tema') < withThemes.indexOf('Comparação com diretrizes'));
});

test('search shows the considerations section by name, or the items of matching parameters', () => {
  const considerations = {
    items: [
      {title: 'Colesterol Total', exam_name: 'Colesterol Total', page: 10, lines: [{text: 'a', reference: 1}], caveats: []},
      {title: 'Hemoglobina', exam_name: 'Hemograma', page: 1, lines: [{text: 'b', reference: 2}], caveats: []},
    ],
    notCompared: [{title: 'LDL - Colesterol', reason: 'sem diretriz'}],
    references: [{number: 1, text: 'SBC', url: ''}, {number: 2, text: 'OMS', url: ''}],
  };
  // Any part of the section name, as the user types (like %word%).
  for (const query of ['consideracoes', 'Considerações clínicas', 'referências', 'bibliografia', 'considerac', 'derac', 'refer', 'bibli', 'clinicas']) {
    assert.equal(report.searchConsiderations(considerations, query), considerations, query);
  }
  const lipids = report.searchConsiderations(considerations, 'lipídios');
  assert.deepEqual(lipids.items.map(item => item.title), ['Colesterol Total']);
  assert.deepEqual(lipids.notCompared.map(item => item.title), ['LDL - Colesterol']);
  // Only the references the remaining items cite; their numbers stay as in the full section.
  assert.deepEqual(lipids.references.map(item => item.number), [1]);
  assert.equal(report.searchConsiderations(considerations, 'ferritina'), null);
});

