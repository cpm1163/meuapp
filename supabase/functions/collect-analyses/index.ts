// Collects the results of the caller's analyses whose batch has ended (docs/compliance.md, Função de análise).
// Validates the AI output, generates the findings in code, records the analysis and deletes the batch,
// so the extracted data does not stay stored at the provider. The app calls it while an analysis is processing.

import type Anthropic from '@anthropic-ai/sdk';
import schema from '../../../modules/lab-report/extraction.schema.json' with {type: 'json'};
import {type BatchResult, interpretResult, type Outcome} from '../../../modules/lab-report/request.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';

// Bounds the work (and the 150 s limit) of a single call; the rest is picked up by the next call.
const MAX_PER_CALL = 5;

type Pending = {id: string; provider_batch_id: string};

async function findResult(anthropic: Anthropic, batchId: string, analysisId: string): Promise<BatchResult | null> {
  for await (const entry of await anthropic.messages.batches.results(batchId)) {
    if (entry.custom_id === analysisId) return entry.result as BatchResult;
  }
  return null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  // RLS: only the caller's own analyses.
  const {data: pending, error} = await auth.client.from('document_analyses').select('id, provider_batch_id')
    .eq('requested_by', auth.user.id).eq('status', 'processing').not('provider_batch_id', 'is', null)
    .order('created_at').limit(MAX_PER_CALL).returns<Pending[]>();
  if (error) return errorResponse('query_failed', 500);
  if (!pending?.length) return json({analyses: []});

  const anthropic = anthropicClient({retries: 2});
  const service = serviceClient();
  const analyses: {id: string; status: string}[] = [];

  for (const analysis of pending) {
    const batchId = analysis.provider_batch_id;
    let outcome: Outcome;
    try {
      const batch = await anthropic.messages.batches.retrieve(batchId);
      if (batch.processing_status !== 'ended') {
        analyses.push({id: analysis.id, status: 'processing'});
        continue;
      }
      const result = await findResult(anthropic, batchId, analysis.id);
      outcome = result ? interpretResult(result, schema)
        : {status: 'failed', reason: 'provider_error', model: null, usage: null, detail: 'result_not_found'};
    } catch (caught) {
      // Provider unreachable: leave the analysis processing and try again on the next call.
      log('batch_read_error', {analysis_id: analysis.id, batch_id: batchId, status: (caught as {status?: number}).status ?? null});
      analyses.push({id: analysis.id, status: 'processing'});
      continue;
    }

    const {error: recordError} = outcome.status === 'ready'
      ? await service.rpc('complete_document_analysis',
        {analysis_id: analysis.id, extraction: outcome.extraction, findings: outcome.findings, model: outcome.model})
      : await service.rpc('fail_document_analysis', {analysis_id: analysis.id, reason: outcome.reason, model: outcome.model});
    // 'analysis_not_available': a concurrent call already recorded it.
    if (recordError && recordError.message !== 'analysis_not_available') {
      log('analysis_record_error', {analysis_id: analysis.id, code: recordError.code});
      analyses.push({id: analysis.id, status: 'processing'});
      continue;
    }
    if (outcome.status === 'failed' && outcome.detail) {
      const {error: detailError} = await service.from('document_analyses')
        .update({failure_detail: outcome.detail}).eq('id', analysis.id).eq('status', 'failed');
      if (detailError) log('analysis_detail_error', {analysis_id: analysis.id, code: detailError.code});
    }
    log('analysis_collected', {
      analysis_id: analysis.id, batch_id: batchId, status: outcome.status, model: outcome.model,
      reason: outcome.status === 'failed' ? outcome.reason : null,
      detail: outcome.status === 'failed' ? outcome.detail ?? null : null,
      findings: outcome.status === 'ready' ? outcome.findings.length : null,
      input_tokens: outcome.usage?.input_tokens ?? null, output_tokens: outcome.usage?.output_tokens ?? null,
    });
    await anthropic.messages.batches.delete(batchId).catch(() => log('batch_delete_error', {batch_id: batchId}));
    analyses.push({id: analysis.id, status: outcome.status});
  }

  return json({analyses});
});
