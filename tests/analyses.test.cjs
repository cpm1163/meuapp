// Tests for the texts of the analysis screen, using findings generated from the fictitious report.
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
  vm.runInThisContext(`(function (exports) {${source}\n})`)(exportsObject);
  return exportsObject;
};
const {generateFindings, FINDING_ORDER} = load('modules/lab-report/findings.ts');
const text = load('src/features/analyses/findings-text.ts');
const findings = generateFindings(JSON.parse(fs.readFileSync('tests/fixtures/lab-report/fictitious-report.json', 'utf8')));

test('every finding kind has a group title and every reason a text', () => {
  for (const kind of FINDING_ORDER) assert.ok(text.GROUP_TITLES[kind], kind);
  for (const finding of findings) assert.notEqual(text.reasonText(finding), finding.reason, finding.reason);
});

test('groups keep the display order and contain every finding', () => {
  const groups = text.groupFindings(findings);
  assert.deepEqual(groups.map(group => group.kind), [...new Set(findings.map(item => item.kind))]);
  assert.equal(groups.flatMap(group => group.items).length, findings.length);
});

test('a finding shows value, unit, reference, previous value and page', () => {
  const glucose = findings.find(item => item.kind === 'history_change' && item.parameter_name === 'Glicose');
  assert.match(text.findingTitle(glucose), /^Glicose: \S+ mg\/dL$/);
  const details = text.findingDetails(glucose);
  assert.ok(details.some(line => line.startsWith('Referência: ')));
  assert.ok(details.some(line => /^Anterior: .+ \(\d{2}\/\d{2}\/\d{4}\)$/.test(line)), details.join(' | '));
  assert.ok(details.some(line => /^Página \d+$/.test(line)));
});

test('lab notes show the note text; the disclaimer is fixed', () => {
  const note = findings.find(item => item.kind === 'lab_note');
  assert.equal(text.findingTitle(note), note.exam_name);
  assert.equal(text.findingDetails(note)[0], note.value_text);
  assert.match(text.DISCLAIMER, /sem interpretação clínica/);
});

test('cards are colored by the side of the reference: above and below never share a tone', () => {
  const base = {kind: 'out_of_reference', exam_name: null, parameter_name: 'X', page: null, value_text: '1', unit: null,
    reference_text: null, lab_flag: null, previous: null};
  const tone = (reason, details = {}, kind = 'out_of_reference') => text.findingTone({...base, kind, reason, details});
  assert.equal(tone('above_reference'), 'above');
  assert.equal(tone('below_reference'), 'below');
  assert.equal(tone('not_expected_value'), 'out');
  assert.equal(tone('flagged_by_lab', {direction: 'below'}), 'below');
  assert.equal(tone('clinical_category', {}, 'table_check'), 'check');
  assert.equal(tone('left_reference', {}, 'history_change'), 'neutral');
  assert.notEqual(text.TONE_COLORS.above.background, text.TONE_COLORS.below.background);
  assert.ok(text.reasonText({...base, reason: 'above_reference', details: {}}).startsWith('↑'));
  assert.ok(text.reasonText({...base, reason: 'below_reference', details: {}}).startsWith('↓'));
  for (const finding of findings) assert.ok(text.TONE_COLORS[text.findingTone(finding)], finding.reason);
});
