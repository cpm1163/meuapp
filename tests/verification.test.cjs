// Tests for the double check of the reading (modules/lab-report/verification.ts), on the fictitious report.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Like the loader in report.test.cjs: relative imports between the TypeScript files.
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
const verification = load('modules/lab-report/verification.ts');
const {missingExams} = load('modules/lab-report/findings.ts');
const report = load('src/features/analyses/report.ts');
const fixture = () => JSON.parse(fs.readFileSync('tests/fixtures/lab-report/fictitious-report.json', 'utf8'));

// Text of the PDF as a laboratory prints it: one exam per page, then the list of executed exams, then the exam the
// reading missed (Ácido Úrico is listed as executed and absent from the fixture's exams).
const pagesOf = extraction => {
  const pages = [];
  for (const exam of extraction.exams) for (const page of exam.pages) {
    pages[page - 1] = (pages[page - 1] ?? '') + `${exam.exam_name}\n${exam.parameters.map(item =>
      `${item.name} ${item.value_text} ${item.unit} ${item.reference.text}`).join('\n')}\n`;
  }
  return [...pages.map(page => page ?? ''), `Exames executados:\n${extraction.executed_exams.join('\n')}`,
    'Ácido Úrico\nÁcido Úrico 5,2 mg/dL 3,4 a 7,0'];
};

test('the fixture misses Ácido Úrico, which the laboratory lists as executed', () => {
  assert.deepEqual(missingExams(fixture()), ['Ácido Úrico']);
});

test('every transcribed number found in the PDF text passes; a number the PDF does not have is reported', () => {
  const extraction = fixture();
  const pages = pagesOf(extraction);
  assert.deepEqual(verification.valuesNotFound(extraction, pages), []);
  extraction.exams[1].parameters[0].value_text = '150';
  assert.deepEqual(verification.valuesNotFound(extraction, pages),
    [{exam_name: 'Glicose', parameter_name: 'Glicose', value_text: '150'}]);
});

test('the pages of a missing exam leave out the list of executed exams', () => {
  const extraction = fixture();
  const pages = pagesOf(extraction);
  assert.deepEqual(verification.examPages('Ácido Úrico', extraction.executed_exams, pages), [pages.length]);
  assert.deepEqual(verification.pagesToReread(extraction, pages), [pages.length]);
});

test('a scanned PDF has no text layer to check against', () => {
  assert.equal(verification.hasTextLayer(['', ' ', '']), false);
  assert.equal(verification.hasTextLayer(pagesOf(fixture())), true);
});

test('the reread adds only the missing exam, with its page mapped back to the original document', () => {
  const extraction = fixture();
  const uric = {...extraction.exams[1], exam_name: 'Ácido Úrico', pages: [1],
    parameters: [{...extraction.exams[1].parameters[0], name: 'Ácido Úrico', value_text: '5,2', page: 1}]};
  // The reread also returns an exam that was already read: it is not duplicated.
  const reread = {...extraction, exams: [uric, extraction.exams[1]]};
  const {extraction: merged, recovered} = verification.mergeReread(extraction, reread, [14]);
  assert.deepEqual(recovered, ['Ácido Úrico']);
  assert.equal(merged.exams.length, extraction.exams.length + 1);
  const added = merged.exams.at(-1);
  assert.deepEqual([added.exam_name, added.pages, added.parameters[0].page], ['Ácido Úrico', [14], 14]);
  assert.deepEqual(missingExams(merged), []);
});

test('the reread prompt names only the missing exams and the pages sent', () => {
  const text = verification.rereadPrompt(['PSA Total'], [21, 22]);
  assert.match(text, /somente estes exames: PSA Total\./);
  assert.match(text, /páginas 21, 22/);
});

test('the report shows the check: running, values not found as alerts, recovered exams and scanned files', () => {
  assert.equal(report.verificationView(null), null);
  assert.equal(report.verificationView({status: 'running'}).running, true);
  const done = {version: 'verification/1', status: 'done', text_checked: true, recovered: ['PSA Total'], still_missing: [],
    values_not_found: [{exam_name: 'Glicose', parameter_name: 'Glicose', value_text: '150'}]};
  const view = report.verificationView(done);
  assert.deepEqual(view.alerts, ['Glicose (Glicose): o valor transcrito “150” não foi encontrado no texto do laudo.']);
  assert.deepEqual(view.notes, ['Lido na conferência: PSA Total.']);
  assert.match(report.verificationView({...done, values_not_found: [], recovered: []}).notes[0], /todos os valores/);
  assert.match(report.verificationView({...done, text_checked: false, values_not_found: [], recovered: []}).notes[0], /não tem texto/);
  assert.match(report.verificationView({...done, status: 'failed'}).notes[0], /não foi concluída/);
  const extraction = fixture();
  const html = report.reportHtml(report.buildReport(extraction, [], null, done), new Date());
  assert.match(html, /não foi encontrado no texto do laudo/);
});

// Reading in parts (modules/lab-report/parts.ts).
const parts = load('modules/lab-report/parts.ts');

// What each part would return: the exams with a page in the part, numbered from 1 in the part's file. The report data
// (laboratory, sex, age) is printed only on the first page, and the list of executed exams only in the last part.
const splitFixture = (extraction, ranges) => ranges.map((pages, index) => ({pages, extraction: {
  ...extraction,
  laboratory: index === 0 ? extraction.laboratory : {name: '', registration: ''},
  patient_sex: index === 0 ? extraction.patient_sex : null,
  executed_exams: index === ranges.length - 1 ? extraction.executed_exams : [],
  exams: extraction.exams.filter(exam => exam.pages.some(page => pages.includes(page))).map(exam => ({
    ...exam,
    pages: exam.pages.filter(page => pages.includes(page)).map(page => pages.indexOf(page) + 1),
    parameters: exam.parameters.map(parameter => ({...parameter, page: parameter.page && pages.includes(parameter.page)
      ? pages.indexOf(parameter.page) + 1 : null})),
  })),
  other_exams: [],
}}));

test('a long report is cut in parts of eight pages that share one page; a short one stays whole', () => {
  assert.deepEqual(parts.partRanges(26).map(pages => [pages[0], pages.at(-1)]), [[1, 8], [8, 15], [15, 22], [22, 26]]);
  assert.deepEqual(parts.partRanges(8).map(pages => [pages[0], pages.at(-1)]), [[1, 8]]);
  assert.deepEqual(parts.partRanges(9).map(pages => [pages[0], pages.at(-1)]), [[1, 8], [8, 9]]);
  assert.match(parts.partPrompt([8, 9, 10], 26), /páginas 8 a 10 de um laudo de 26 páginas/);
});

test('the parts merge back into the whole reading, in the original pages, without repeating an exam', () => {
  const extraction = fixture();
  // Pages 1-2 (hemogram) cut between two parts that share page 2: the exam is read in both.
  const merged = parts.mergeParts(splitFixture(extraction, [[1, 2], [2, 3, 4, 5, 6], [6, 7, 8, 9, 10, 11, 12]]));
  assert.deepEqual(merged.exams.map(exam => [exam.exam_name, exam.pages]), extraction.exams.map(exam => [exam.exam_name, exam.pages]));
  assert.deepEqual(merged.exams[0].parameters.length, extraction.exams[0].parameters.length);
  assert.deepEqual(merged.laboratory, extraction.laboratory);
  assert.equal(merged.patient_sex, extraction.patient_sex);
  assert.deepEqual(merged.executed_exams, extraction.executed_exams);
  assert.deepEqual(missingExams(merged), ['Ácido Úrico']);
});

test('the part that read an exam shared by two parts with more parameters is kept', () => {
  const extraction = fixture();
  const [first, second] = splitFixture(extraction, [[1, 2], [2, 3]]);
  // The first part saw only the start of the hemogram.
  first.extraction.exams[0] = {...first.extraction.exams[0], parameters: first.extraction.exams[0].parameters.slice(0, 2)};
  const merged = parts.mergeParts([first, second]);
  assert.equal(merged.exams.filter(exam => exam.exam_name === extraction.exams[0].exam_name).length, 1);
  assert.equal(merged.exams[0].parameters.length, extraction.exams[0].parameters.length);
});
