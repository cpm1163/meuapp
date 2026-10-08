// Starts the lab-report analysis of a document (docs/compliance.md, Função de análise).
// 1. The database authorizes with the user's token (module, grant, terms, owner, daily limit) and reserves the document.
// 2. The file is downloaded with the server credential and submitted as a one-request batch.
// The function returns as soon as the batch exists; collect-analyses picks up the result.

import type Anthropic from '@anthropic-ai/sdk';
import {encodeBase64} from '@std/encoding/base64';
import schema from '../../../modules/lab-report/extraction.schema.json' with {type: 'json'};
import {buildRequestParams, MODEL, MODULE_VERSION} from '../../../modules/lab-report/request.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';

const MODULE_ID = 'lab-report';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let anthropic: Anthropic;
  let batchId: string;
  const started = Date.now();
  try {
    anthropic = anthropicClient({retries: 0});
    const batch = await anthropic.messages.batches.create({
      requests: [{custom_id: analysis.id, params: params as Anthropic.Messages.MessageCreateParamsNonStreaming}],
    });
    batchId = batch.id;
  } catch (error) {
    log('batch_create_error', {analysis_id: analysis.id, status: (error as {status?: number}).status ?? null});
    await fail('provider_error');
    return errorResponse('provider_error', 502);
  }

  const {error: recordError} = await service.rpc('set_analysis_batch', {analysis_id: analysis.id, batch_id: batchId, model: MODEL});
  if (recordError) {
    // Without the batch id the result could never be collected: cancel it so it is not processed for nothing.
    log('batch_record_error', {analysis_id: analysis.id, batch_id: batchId, code: recordError.code});
    await anthropic.messages.batches.cancel(batchId).catch(() => log('batch_cancel_error', {batch_id: batchId}));
    await fail('batch_not_recorded');
    return errorResponse('batch_not_recorded', 500);
  }

  log('analysis_submitted', {analysis_id: analysis.id, batch_id: batchId, model: MODEL, ms: Date.now() - started});
  return json({analysis_id: analysis.id, status: 'processing'}, 202);
});
