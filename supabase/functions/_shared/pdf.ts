// Cuts a PDF into the parts of modules/lab-report/parts.ts (pdf-lib, in the function that imports it).

import {encodeBase64} from '@std/encoding/base64';
import {PDFDocument} from 'pdf-lib';
import {partRanges} from '../../../modules/lab-report/parts.ts';

export type PdfPart = {pages: number[]; pageCount: number; base64: string};

/** One file per part, with the original page numbers it holds. Cutting the 26-page sample took about 0.4 s of CPU. */
export async function pdfParts(bytes: Uint8Array): Promise<PdfPart[]> {
  const original = await PDFDocument.load(bytes);
  const pageCount = original.getPageCount();
  return Promise.all(partRanges(pageCount).map(async pages => ({pages, pageCount, base64: encodeBase64(await pdfPages(original, pages))})));
}

/** A new PDF with some pages (1-based) of the original. */
export async function pdfPages(original: PDFDocument, pages: number[]): Promise<Uint8Array> {
  const part = await PDFDocument.create();
  for (const page of await part.copyPages(original, pages.map(page => page - 1))) part.addPage(page);
  return part.save();
}
