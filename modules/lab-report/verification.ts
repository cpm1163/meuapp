// Double check of the AI reading (docs/compliance.md, decided 27/10/2026), all in code except the reread:
// 1. every transcribed number must appear in the text of the PDF (free; PDFs with a text layer only);
// 2. exams listed by the laboratory and missed by the reading are located by page and reread alone, then merged.
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

import {missingExams, normalizeText, sameExam, type Exam, type Extraction} from './findings.ts';
import {remapExam} from './parts.ts';

export const VERIFICATION_VERSION = 'verification/1';
export type ValueNotFound = {exam_name: string; parameter_name: string; value_text: string};
export type Verification = {
  version: string;
  status: 'running' | 'done' | 'failed';
  /** Whether the PDF had a text layer to check the values against. */
  text_checked: boolean;
  values_not_found: ValueNotFound[];
  /** Missing exams recovered by the reread, and those still missing after it. */
  recovered: string[];
  still_missing: string[];
  failure?: string;
};

// Below this many characters per page the PDF is taken as scanned or photographed: there is no text to check against.
const MIN_TEXT_PER_PAGE = 100;
const compact = (text: string) => normalizeText(text).replace(/\s+/g, '');
const NUMBER = /\d[\d.,]*/;

export const hasTextLayer = (pages: string[]) =>
  pages.length > 0 && pages.join('').length >= MIN_TEXT_PER_PAGE * pages.length / 2;

// A number as its digits only, so "10.810" and "10810", or "3,55" and "3.55", are the same; whole numbers are compared,
// never pieces ("150" is not found inside "150.000").
const digits = (number: string) => number.replace(/[.,]/g, '');

/** Transcribed numbers that do not appear anywhere in the text of the PDF ("10.810", "3,55"). */
export function valuesNotFound(extraction: Extraction, pages: string[]): ValueNotFound[] {
  const printed = new Set((pages.join(' ').match(/\d[\d.,]*/g) ?? []).map(item => digits(item.replace(/[.,]+$/, ''))));
  const result: ValueNotFound[] = [];
  for (const exam of extraction.exams) for (const parameter of exam.parameters) {
    const number = NUMBER.exec(parameter.value_text)?.[0]?.replace(/[.,]+$/, '');
    if (!number || printed.has(digits(number))) continue;
    result.push({exam_name: exam.exam_name, parameter_name: parameter.name, value_text: parameter.value_text});
  }
  return result;
}

/**
 * Pages (1-based) where an exam name appears, leaving out the pages that list the executed exams: those name every exam.
 */
export function examPages(name: string, executed: string[], pages: string[]): number[] {
  const target = compact(name);
  if (!target) return [];
  const listing = (page: string) => {
    const text = compact(page);
    return executed.length >= 4 && executed.filter(item => compact(item) && text.includes(compact(item))).length > executed.length / 2;
  };
  return pages.flatMap((page, index) => compact(page).includes(target) && !listing(page) ? [index + 1] : []);
}

/** Pages to reread for the missing exams, in order, without repeats. */
export function pagesToReread(extraction: Extraction, pages: string[]): number[] {
  const all = missingExams(extraction).flatMap(name => examPages(name, extraction.executed_exams, pages));
  return [...new Set(all)].sort((a, b) => a - b);
}

/**
 * Adds to the first reading the exams of the reread that were missing, with their pages mapped back to the original
 * document (`pageMap[i]` is the original page of page i + 1 of the reread). Exams already read are never duplicated.
 */
export function mergeReread(base: Extraction, reread: Extraction, pageMap: number[] | null): {extraction: Extraction; recovered: string[]} {
  const missing = missingExams(base);
  const added: Exam[] = [];
  for (const exam of reread.exams) {
    if (!missing.some(name => sameExam(name, exam.exam_name))) continue;
    if ([...base.exams, ...added].some(item => sameExam(item.exam_name, exam.exam_name))) continue;
    added.push(remapExam(exam, pageMap));
  }
  const first = (exam: Exam) => exam.pages[0] ?? Infinity;
  const exams = [...base.exams, ...added].sort((a, b) => first(a) - first(b));
  const extraction = {...base, exams};
  const recovered = missing.filter(name => !missingExams(extraction).includes(name));
  return {extraction, recovered};
}

/** Text of the reread request: only the missing exams, so the answer stays short. */
export function rereadPrompt(missing: string[], pages: number[] | null): string {
  const where = pages ? ` Este arquivo tem só as páginas ${pages.join(', ')} do laudo original.` : '';
  return `Transcreva este documento conforme as instruções, mas somente estes exames: ${missing.join('; ')}.${where}`
    + ' Em executed_exams, repita os nomes desses exames.';
}
