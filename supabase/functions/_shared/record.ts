// Records an analysis outcome (docs/compliance.md, Função de análise), shared by analyze-document (direct call)
// and collect-analyses (batches still in flight). Returns false when the outcome could not be recorded.

import type {SupabaseClient} from '@supabase/supabase-js';
import type {Outcome} from '../../../modules/lab-report/request.ts';
import {log} from './common.ts';

export async function recordOutcome(service: SupabaseClient, analysisId: string, outcome: Outcome,
  logFields: Record<string, unknown>): Promise<boolean> {
  const {error: recordError} = outcome.status === 'ready'
    ? await service.rpc('complete_document_analysis',
      {analysis_id: analysisId, extraction: outcome.extraction, findings: outcome.findings, model: outcome.model})
    : await service.rpc('fail_document_analysis', {analysis_id: analysisId, reason: outcome.reason, model: outcome.model});
  // 'analysis_not_available': a concurrent call already recorded it.
  if (recordError && recordError.message !== 'analysis_not_available') {
    log('analysis_record_error', {analysis_id: analysisId, code: recordError.code});
    return false;
  }
  if (outcome.status === 'failed' && outcome.detail) {
    const {error: detailError} = await service.from('document_analyses')
      .update({failure_detail: outcome.detail}).eq('id', analysisId).eq('status', 'failed');
    if (detailError) log('analysis_detail_error', {analysis_id: analysisId, code: detailError.code});
  }
  // Usage record (analysis_usage) survives the deletion of the document; the log below keeps the same numbers.
  if (outcome.usage) {
    const {error: usageError} = await service.rpc('record_analysis_usage', {
      analysis_id: analysisId, model: outcome.model,
      input_tokens: outcome.usage.input_tokens ?? null, output_tokens: outcome.usage.output_tokens ?? null,
    });
    if (usageError) log('analysis_usage_error', {analysis_id: analysisId, code: usageError.code});
  }
  log('analysis_collected', {
    analysis_id: analysisId, ...logFields, status: outcome.status, model: outcome.model,
    reason: outcome.status === 'failed' ? outcome.reason : null,
    detail: outcome.status === 'failed' ? outcome.detail ?? null : null,
    findings: outcome.status === 'ready' ? outcome.findings.length : null,
    input_tokens: outcome.usage?.input_tokens ?? null, output_tokens: outcome.usage?.output_tokens ?? null,
  });
  return true;
}
