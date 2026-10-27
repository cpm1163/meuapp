// Reading a long report in parts (docs/compliance.md, decided 27/10/2026): a single reading of a 26-page report passed
// the 150 s limit of the Edge Function, and the fast model skipped pages. The PDF is cut into parts of a few pages,
// with one page shared by consecutive parts (an exam may continue on the next page); the parts are read at the same
// time and merged here, without repeating an exam read in two parts.
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

import {normalizeText, type Exam, type Extraction, type OtherExam} from './findings.ts';

export const PART_PAGES = 8;
export const PART_OVERLAP = 1;

/** Original pages (1-based) of each part; a single part when the report is short. */
export function partRanges(pageCount: number): number[][] {
  if (pageCount <= PART_PAGES) return [Array.from({length: pageCount}, (_, index) => index + 1)];
  const parts: number[][] = [];
  for (let start = 1; ; start += PART_PAGES - PART_OVERLAP) {
    const end = Math.min(start + PART_PAGES - 1, pageCount);
    parts.push(Array.from({length: end - start + 1}, (_, index) => start + index));
    if (end === pageCount) return parts;
  }
}

/** Text of the request for one part: which pages of the original it holds, numbered from 1 in the file. */
export function partPrompt(pages: number[], pageCount: number): string {
  return `Transcreva este documento conforme as instruções. Ele tem só as páginas ${pages[0]} a ${pages.at(-1)} de um laudo `
    + `de ${pageCount} páginas: numere as páginas a partir de 1, como neste arquivo, e transcreva também um exame que `
    + 'comece ou termine fora destas páginas, com o que estiver aqui. Em legibility, avalie só a nitidez destas páginas: '
    + 'o corte do laudo em partes não torna a leitura parcial.';
}

/** Pages of an exam read from a part, back in the numbering of the original document. */
export function remapExam<T extends Exam | OtherExam>(exam: T, pageMap: number[] | null): T {
  if (!pageMap) return exam;
  const original = (page: number | null) => page === null ? null : pageMap[page - 1] ?? page;
  const pages = exam.pages.map(page => original(page) as number);
  if (!('parameters' in exam)) return {...exam, pages};
  return {...exam, pages, parameters: exam.parameters.map(parameter => ({...parameter, page: original(parameter.page)}))};
}

const sameName = (a: string, b: string) => normalizeText(a) === normalizeText(b);
const sharePage = (a: {pages: number[]}, b: {pages: number[]}) => a.pages.some(page => b.pages.includes(page));
const firstPage = (exam: {pages: number[]}) => exam.pages[0] ?? Infinity;

/**
 * One extraction from the parts. An exam with the same name on a shared page was read in two parts: the reading with
 * more parameters is kept. Report data (laboratory, sex, age, dates) comes from the first part that has it; the list
 * of executed exams is the union of all parts.
 */
export function mergeParts(parts: {extraction: Extraction; pages: number[]}[]): Extraction {
  const remapped = parts.map(part => ({
    ...part.extraction,
    exams: part.extraction.exams.map(exam => remapExam(exam, part.pages)),
    other_exams: part.extraction.other_exams.map(exam => remapExam(exam, part.pages)),
  }));
  const exams: Exam[] = [];
  for (const exam of remapped.flatMap(item => item.exams)) {
    const twin = exams.findIndex(item => sameName(item.exam_name, exam.exam_name) && sharePage(item, exam));
    if (twin < 0) exams.push(exam);
    else if (exam.parameters.length > exams[twin].parameters.length) exams[twin] = exam;
  }
  const others: OtherExam[] = [];
  for (const exam of remapped.flatMap(item => item.other_exams)) {
    if (!others.some(item => sameName(item.exam_name, exam.exam_name))) others.push(exam);
  }
  const executed: string[] = [];
  for (const name of remapped.flatMap(item => item.executed_exams)) {
    if (!executed.some(item => sameName(item, name))) executed.push(name);
  }
  const first = <T>(pick: (item: Extraction) => T, empty: (value: T) => boolean) =>
    remapped.map(pick).find(value => !empty(value)) ?? pick(remapped[0]);
  const legibilities = remapped.map(item => item.legibility);
  return {
    schema_version: remapped[0].schema_version,
    has_lab_exams: remapped.some(item => item.has_lab_exams),
    legibility: legibilities.every(item => item === 'unreadable') ? 'unreadable'
      : legibilities.some(item => item !== 'ok') ? 'partial' : 'ok',
    laboratory: first(item => item.laboratory, value => !value.name),
    patient_sex: first(item => item.patient_sex, value => value === null),
    patient_age_years: first(item => item.patient_age_years, value => value === null),
    collected_at: first(item => item.collected_at, value => !value),
    generated_at: first(item => item.generated_at, value => !value),
    executed_exams: executed,
    exams: exams.sort((a, b) => firstPage(a) - firstPage(b)),
    other_exams: others,
  };
}
