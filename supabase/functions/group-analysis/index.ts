// Groups the parameters of a ready analysis by theme (clinical considerations, type 1; docs/clinical-considerations.md).
// 1. The database authorizes with the user's token (owner, ready analysis, considerations module) and reserves the
//    grouping, so the AI runs at most once per analysis.
// 2. One synchronous AI call with names and units only; the answer is checked in code before it is stored.

import type Anthropic from '@anthropic-ai/sdk';
import {buildGroupingParams, groupingInput, GROUPING_VERSION, validateGroups} from '../../../modules/clinical-considerations/grouping.ts';
import type {Extraction} from '../../../modules/lab-report/findings.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Refusals raised by start_analysis_grouping, by exception message.
const START_ERRORS: Record<string, number> = {
  not_authenticated: 401,
  module_not_available: 403,
  analysis_not_available: 404,
};

type Usage = {model: string | null; input_tokens: number | null; output_tokens: number | null};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as {analysis_id?: unknown} | null;
  const analysisId = body?.analysis_id;
  if (typeof analysisId !== 'string' || !UUID.test(analysisId)) return errorResponse('invalid_request', 400);

  const {error: startError} = await auth.client.rpc('start_analysis_grouping',
    {analysis_id: analysisId, version: GROUPING_VERSION}).single();
  if (startError) {
    const code = startError.message;
    // Already ready, failed or running elsewhere: nothing to do, the app reads the stored row.
    if (code === 'grouping_exists') return json({analysis_id: analysisId, status: 'exists'});
    const status = START_ERRORS[code];
    if (!status) {
      log('grouping_start_error', {analysis_id: analysisId, code: startError.code});
      return errorResponse('start_failed', 500);
    }
    return errorResponse(code, status);
  }

  const service = serviceClient();
  const finish = async (reason: string | null, usage: Usage, groups: unknown = null) => {
    const {error} = reason
      ? await service.rpc('fail_analysis_grouping', {analysis_id: analysisId, reason, ...usage})
      : await service.rpc('complete_analysis_grouping', {analysis_id: analysisId, groups, ...usage});
    if (error) log('grouping_record_error', {analysis_id: analysisId, reason, code: error.code});
  };
  const noUsage: Usage = {model: null, input_tokens: null, output_tokens: null};

  const {data: analysis, error: readError} = await service.from('document_analyses')
    .select('extraction').eq('id', analysisId).single<{extraction: Extraction | null}>();
  const extraction = analysis?.extraction;
  if (readError || !extraction || !Array.isArray(extraction.exams)) {
    await finish('no_extraction', noUsage);
    return errorResponse('no_extraction', 500);
  }
  if (groupingInput(extraction).length === 0) {
    await finish(null, noUsage, []);
    return json({analysis_id: analysisId, status: 'ready'});
  }

  const started = Date.now();
  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    // No automatic retry (docs/compliance.md, Travas de custo). On a policy refusal the server reruns the request
    // on a fallback model within the same call.
    response = await anthropicClient({retries: 0}).beta.messages.create({
      ...buildGroupingParams(extraction),
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  } catch (error) {
    log('grouping_provider_error', {analysis_id: analysisId, status: (error as {status?: number}).status ?? null});
    await finish('provider_error', noUsage);
    return errorResponse('provider_error', 502);
  }

  const usage: Usage = {model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens};
  const reason = response.stop_reason === 'refusal' ? 'refused'
    : response.stop_reason === 'max_tokens' ? 'output_truncated' : null;
  const text = response.content.find(block => block.type === 'text')?.text ?? '';
  const groups = reason ? null : validateGroups(text, extraction);
  if (!groups) {
    await finish(reason ?? 'invalid_output', usage);
    log('grouping_failed', {analysis_id: analysisId, reason: reason ?? 'invalid_output', ...usage, ms: Date.now() - started});
    return errorResponse(reason ?? 'invalid_output', 502);
  }
  await finish(null, usage, groups);
  log('grouping_ready', {analysis_id: analysisId, ...usage, groups: groups.length, ms: Date.now() - started});
  return json({analysis_id: analysisId, status: 'ready'});
});
