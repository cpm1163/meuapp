// Double check of a ready analysis (docs/compliance.md, decided 27/10/2026), started by analyze-document right after
// it records the reading. Runs once per analysis, for its requester, in its own invocation (own CPU and time limits):
// 1. checks every transcribed number against the text of the PDF;
// 2. rereads, with only their pages, the exams the laboratory lists and the first reading missed, and merges them.
// The analysis stays visible meanwhile; the app shows "Conferindo a leitura" while verification.status is running.

import Anthropic from '@anthropic-ai/sdk';
import {encodeBase64} from '@std/encoding/base64';
import {PDFDocument} from 'pdf-lib';
import {extractText, getDocumentProxy} from 'unpdf';
import schema from '../../../modules/lab-report/extraction.schema.json' with {type: 'json'};
import {generateFindings, missingExams, type Extraction} from '../../../modules/lab-report/findings.ts';
import {type BatchResult, buildRequestParams, interpretResult} from '../../../modules/lab-report/request.ts';
import {hasTextLayer, mergeReread, pagesToReread, rereadPrompt, valuesNotFound, VERIFICATION_VERSION,
  type Verification} from '../../../modules/lab-report/verification.ts';
import {pdfPages} from '../_shared/pdf.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';

declare const EdgeRuntime: {waitUntil(promise: Promise<unknown>): void};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REREAD_TIMEOUT_MS = 110_000;

type Row = {id: string; status: string; requested_by: string; document_id: string; extraction: Extraction | null;
  verification: Verification | null};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const body = await req.json().catch(() => null) as {analysis_id?: unknown} | null;
  const analysisId = body?.analysis_id;
  if (typeof analysisId !== 'string' || !UUID.test(analysisId)) return errorResponse('invalid_request', 400);

  const service = serviceClient();
  const {data: row} = await service.from('document_analyses')
    .select('id, status, requested_by, document_id, extraction, verification').eq('id', analysisId).maybeSingle<Row>();
  // Once per analysis and only for its requester: a second call never triggers another paid reread.
  if (!row || row.requested_by !== auth.user.id || row.status !== 'ready' || !row.extraction) return errorResponse('analysis_not_available', 404);
  if (row.verification) return json({analysis_id: analysisId, status: row.verification.status});
  const extraction = row.extraction;

  const record = async (verification: Verification, merged: Extraction | null = null) => {
    const {error} = await service.rpc('record_analysis_verification', {analysis_id: analysisId, verification,
      extraction: merged, findings: merged ? generateFindings(merged) : null});
    if (error) log('verification_record_error', {analysis_id: analysisId, code: error.code});
  };
  const base: Verification = {version: VERIFICATION_VERSION, status: 'running', text_checked: false, values_not_found: [],
    recovered: [], still_missing: missingExams(extraction)};
  await record(base);

  const run = async () => {
    const started = Date.now();
    try {
      const {data: document} = await service.from('documents').select('storage_path, mime_type').eq('id', row.document_id)
        .single<{storage_path: string; mime_type: string}>();
      const {data: file} = document ? await service.storage.from('documents').download(document.storage_path) : {data: null};
      if (!document || !file) throw new Error('download_failed');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPdf = document.mime_type === 'application/pdf';

      let pages: string[] = [];
      if (isPdf) pages = (await extractText(await getDocumentProxy(bytes.slice()), {mergePages: false})).text;
      const textChecked = hasTextLayer(pages);
      const verification: Verification = {...base, text_checked: textChecked,
        values_not_found: textChecked ? valuesNotFound(extraction, pages) : []};

      const missing = missingExams(extraction);
      let merged: Extraction | null = null;
      if (missing.length) {
        // With a text layer only the pages of the missing exams go to the AI; otherwise the whole file, narrowed by name.
        const selected = textChecked ? pagesToReread(extraction, pages) : [];
        let source = {mimeType: document.mime_type, base64: ''};
        if (selected.length) {
          source = {mimeType: 'application/pdf', base64: encodeBase64(await pdfPages(await PDFDocument.load(bytes), selected))};
        } else {
          source.base64 = encodeBase64(bytes);
        }
        const params = buildRequestParams(source, schema, rereadPrompt(missing, selected.length ? selected : null));
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), REREAD_TIMEOUT_MS);
        try {
          const message = await anthropicClient({retries: 0, timeout: REREAD_TIMEOUT_MS})
            .messages.stream(params as Anthropic.Messages.MessageStreamParams, {signal: abort.signal}).finalMessage();
          const {error: usageError} = await service.rpc('add_analysis_usage', {analysis_id: analysisId,
            input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens});
          if (usageError) log('verification_usage_error', {analysis_id: analysisId, code: usageError.code});
          const outcome = interpretResult({type: 'succeeded', message} as BatchResult, schema);
          if (outcome.status === 'ready') {
            const result = mergeReread(extraction, outcome.extraction, selected.length ? selected : null);
            if (result.recovered.length) merged = result.extraction;
            verification.recovered = result.recovered;
          }
          log('verification_reread', {analysis_id: analysisId, pages: selected, status: outcome.status,
            input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens});
        } finally {
          clearTimeout(timer);
        }
      }
      verification.still_missing = missingExams(merged ?? extraction);
      verification.status = 'done';
      await record(verification, merged);
      log('verification_done', {analysis_id: analysisId, text_checked: textChecked, values_not_found: verification.values_not_found.length,
        recovered: verification.recovered.length, still_missing: verification.still_missing.length, ms: Date.now() - started});
    } catch (caught) {
      const failure = caught instanceof Anthropic.APIUserAbortError ? 'timeout'
        : caught instanceof Anthropic.APIError ? 'provider_error' : caught instanceof Error ? caught.message.slice(0, 80) : 'error';
      await record({...base, status: 'failed', failure});
      log('verification_failed', {analysis_id: analysisId, failure, ms: Date.now() - started});
    }
  };

  EdgeRuntime.waitUntil(run());
  return json({analysis_id: analysisId, status: 'running'}, 202);
});
