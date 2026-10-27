// Starts the lab-report analysis of a document (docs/compliance.md, Função de análise).
// 1. The database authorizes with the user's token (module, grant, terms, owner, daily limit) and reserves the document.
// 2. The file is downloaded with the server credential and sent in one direct, streamed call (decided on 27/10/2026:
//    the batch queue took hours). The call runs as a background task, so the app gets 202 at once and polls the status.
// 3. The answer is validated and recorded here; collect-analyses only finishes batches submitted before.

import Anthropic from '@anthropic-ai/sdk';
import {encodeBase64} from '@std/encoding/base64';
import schema from '../../../modules/lab-report/extraction.schema.json' with {type: 'json'};
import {type BatchResult, buildRequestParams, interpretResult, MODEL, MODULE_VERSION, type Outcome} from '../../../modules/lab-report/request.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';
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

  let params;
  try {
    params = buildRequestParams({mimeType: document.mime_type, base64: encodeBase64(new Uint8Array(await file.arrayBuffer()))}, schema);
  } catch {
    await fail('unsupported_file_type');
    return errorResponse('unsupported_file_type', 422);
  }

  const anthropic = anthropicClient({retries: 0, timeout: CALL_TIMEOUT_MS});
  const run = async () => {
    const started = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);
    let outcome: Outcome;
    try {
      const message = await anthropic.messages.stream(params as Anthropic.Messages.MessageStreamParams,
        {signal: abort.signal}).finalMessage();
      outcome = interpretResult({type: 'succeeded', message} as BatchResult, schema);
    } catch (caught) {
      if (caught instanceof Anthropic.APIUserAbortError || caught instanceof Anthropic.APIConnectionTimeoutError) {
        outcome = {status: 'failed', reason: 'timeout', model: MODEL, usage: null};
      } else if (caught instanceof Anthropic.APIError) {
        outcome = interpretResult({type: 'errored', error: caught.error as {error?: {type?: string; message?: string}}}, schema);
      } else {
        outcome = {status: 'failed', reason: 'provider_error', model: null, usage: null};
      }
    } finally {
      clearTimeout(timer);
    }
    await recordOutcome(service, analysis.id, outcome, {mode: 'direct', ms: Date.now() - started});
  };

  EdgeRuntime.waitUntil(run());
  log('analysis_submitted', {analysis_id: analysis.id, mode: 'direct', model: MODEL});
  return json({analysis_id: analysis.id, status: 'processing'}, 202);
});
