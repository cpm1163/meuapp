// Starts the lab-report analysis of a document (docs/compliance.md, Função de análise).
// 1. The database authorizes with the user's token (module, grant, terms, owner, daily limit) and reserves the document.
// 2. The file is downloaded with the server credential and sent in one direct, streamed call (decided on 27/10/2026:
//    the batch queue took hours). A long PDF goes in parts read at the same time and merged (parts.ts). The calls run
//    as a background task, so the app gets 202 at once and polls the status.
// 3. The answer is validated and recorded here, then verify-analysis double-checks it; collect-analyses only finishes
//    batches submitted before.

import Anthropic from '@anthropic-ai/sdk';
import {encodeBase64} from '@std/encoding/base64';
import schema from '../../../modules/lab-report/extraction.schema.json' with {type: 'json'};
import {mergeParts, partPrompt} from '../../../modules/lab-report/parts.ts';
import {type BatchResult, buildRequestParams, finishOutcome, interpretResult, MODEL, MODULE_VERSION, type Outcome, readResult,
  type Reading} from '../../../modules/lab-report/request.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';
import {pdfParts} from '../_shared/pdf.ts';
import {recordOutcome} from '../_shared/record.ts';

declare const EdgeRuntime: {waitUntil(promise: Promise<unknown>): void};

const MODULE_ID = 'lab-report';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The Free plan stops a function after 150 s of wall clock: abort before that, so the failure is still recorded.
const CALL_TIMEOUT_MS = 125_000;

// Refusals raised by start_document_analysis, by exception message.
const START_ERRORS: Record<string, number> = {
  not_authenticated: 401,
  module_not_available: 403,
  document_not_available: 404,
  invalid_document_state: 409,
  analysis_in_progress: 409,
  daily_limit_reached: 429,
};

type Analysis = {id: string; document_id: string; module_version: string | null};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as {document_id?: unknown} | null;
  const documentId = body?.document_id;
  if (typeof documentId !== 'string' || !UUID.test(documentId)) return errorResponse('invalid_request', 400);

  const {data: analysis, error: startError} = await auth.client.rpc('start_document_analysis',
    {document_id: documentId, module_id: MODULE_ID}).single<Analysis>();
  if (startError || !analysis) {
    const code = startError?.message ?? 'start_failed';
    const status = START_ERRORS[code];
    if (!status) {
      log('analysis_start_error', {document_id: documentId, code: startError?.code});
      return errorResponse('start_failed', 500);
    }
    return errorResponse(code, status, code === 'daily_limit_reached' ? {next_available_at: startError?.details ?? null} : {});
  }

  const service = serviceClient();
  const fail = async (reason: string) => {
    const {error} = await service.rpc('fail_document_analysis', {analysis_id: analysis.id, reason, model: null});
    if (error) log('analysis_fail_error', {analysis_id: analysis.id, reason, code: error.code});
    log('analysis_failed', {analysis_id: analysis.id, reason});
  };

  // The catalog pins the instructions version; never run code at another version than the one recorded.
  if (analysis.module_version !== MODULE_VERSION) {
    await fail('module_version_mismatch');
    return errorResponse('module_version_mismatch', 500);
  }

  const {data: document, error: documentError} = await service.from('documents')
    .select('storage_path, mime_type').eq('id', analysis.document_id).single<{storage_path: string; mime_type: string}>();
  if (documentError || !document) {
    await fail('document_not_found');
    return errorResponse('document_not_found', 500);
  }
  const {data: file, error: downloadError} = await service.storage.from('documents').download(document.storage_path);
  if (downloadError || !file) {
    await fail('download_failed');
    return errorResponse('download_failed', 500);
  }

  // A long PDF is read in parts at the same time (modules/lab-report/parts.ts); a short one or a photo in one call.
  const bytes = new Uint8Array(await file.arrayBuffer());
  let requests: {params: ReturnType<typeof buildRequestParams>; pages: number[] | null}[];
  try {
    const parts = document.mime_type === 'application/pdf' ? await pdfParts(bytes) : null;
    requests = parts && parts.length > 1
      ? parts.map(part => ({params: buildRequestParams({mimeType: 'application/pdf', base64: part.base64}, schema,
        partPrompt(part.pages, part.pageCount)), pages: part.pages}))
      : [{params: buildRequestParams({mimeType: document.mime_type, base64: encodeBase64(bytes)}, schema), pages: null}];
  } catch {
    await fail('unsupported_file_type');
    return errorResponse('unsupported_file_type', 422);
  }

  const anthropic = anthropicClient({retries: 0, timeout: CALL_TIMEOUT_MS});
  const read = async (params: ReturnType<typeof buildRequestParams>, signal: AbortSignal): Promise<Reading> => {
    try {
      const message = await anthropic.messages.stream(params as Anthropic.Messages.MessageStreamParams, {signal}).finalMessage();
      return readResult({type: 'succeeded', message} as BatchResult, schema);
    } catch (caught) {
      if (caught instanceof Anthropic.APIUserAbortError || caught instanceof Anthropic.APIConnectionTimeoutError) {
        return {ok: false, outcome: {status: 'failed', reason: 'timeout', model: MODEL, usage: null}};
      }
      if (caught instanceof Anthropic.APIError) {
        return {ok: false, outcome: interpretResult({type: 'errored', error: caught.error as {error?: {type?: string; message?: string}}}, schema)};
      }
      return {ok: false, outcome: {status: 'failed', reason: 'provider_error', model: null, usage: null}};
    }
  };
  const run = async () => {
    const started = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);
    let outcome: Outcome;
    try {
      const readings = await Promise.all(requests.map(request => read(request.params, abort.signal)));
      const usages = readings.map(reading => reading.ok ? reading.usage : reading.outcome.usage);
      const usage = usages.some(Boolean) ? {
        input_tokens: usages.reduce((total, item) => total + (item?.input_tokens ?? 0), 0),
        output_tokens: usages.reduce((total, item) => total + (item?.output_tokens ?? 0), 0),
      } : null;
      // Any part that fails fails the analysis: a reading with missing pages is never shown as complete.
      const failedIndex = readings.findIndex(reading => !reading.ok);
      const failedPart = readings[failedIndex];
      if (failedPart && !failedPart.ok) {
        const pages = requests[failedIndex].pages;
        const where = pages ? `parte ${failedIndex + 1} de ${requests.length} (páginas ${pages[0]}-${pages.at(-1)})` : null;
        const detail = [where, failedPart.outcome.status === 'failed' ? failedPart.outcome.detail : null].filter(Boolean).join(': ');
        outcome = {...failedPart.outcome, usage, ...(detail ? {detail} : {})};
      }
      else {
        const ok = readings.filter(reading => reading.ok);
        const extraction = requests.length > 1
          ? mergeParts(ok.map((reading, index) => ({extraction: reading.extraction, pages: requests[index].pages!})))
          : ok[0].extraction;
        outcome = finishOutcome(extraction, ok[0].model, usage);
      }
    } finally {
      clearTimeout(timer);
    }
    const recorded = await recordOutcome(service, analysis.id, outcome,
      {mode: 'direct', parts: requests.length, ms: Date.now() - started});
    // Double check in its own invocation (verify-analysis), as the caller: the reading is already visible meanwhile.
    if (recorded && outcome.status === 'ready') {
      const {error} = await auth.client.functions.invoke('verify-analysis', {body: {analysis_id: analysis.id}});
      if (error) log('verification_start_error', {analysis_id: analysis.id});
    }
  };

  EdgeRuntime.waitUntil(run());
  log('analysis_submitted', {analysis_id: analysis.id, mode: 'direct', parts: requests.length, model: MODEL});
  return json({analysis_id: analysis.id, status: 'processing'}, 202);
});
