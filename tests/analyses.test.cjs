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
