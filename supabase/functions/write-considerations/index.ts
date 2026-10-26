// Writes the draft of the clinical considerations of a ready analysis (docs/clinical-considerations.md, 26/10/2026).
// 1. The database authorizes with the user's token (owner, ready analysis, considerations module) and reserves the
//    draft, so the AI runs at most once per analysis. The doctor starts it with a button.
// 2. The code selects the meaning cards; one synchronous AI call writes the text from them, without values or the
//    patient's identity; every sentence is checked in code before the draft is stored.

import type Anthropic from '@anthropic-ai/sdk';
import curatedJson from '../../../modules/clinical-considerations/curated-meanings.json' with {type: 'json'};
import {checkMeanings, patientFor, selectMeanings, type CuratedMeanings} from '../../../modules/clinical-considerations/meanings.ts';
import {buildWritingParams, validateDraft, WRITING_VERSION, writingInput} from '../../../modules/clinical-considerations/writing.ts';
import type {Extraction} from '../../../modules/lab-report/findings.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const curated = curatedJson as unknown as CuratedMeanings;

// Refusals raised by start_analysis_considerations, by exception message.
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
  // A broken cards file writes nothing rather than an unchecked text; checked before reserving the draft.
  if (checkMeanings(curated).length) return errorResponse('cards_unavailable', 500);

  const {error: startError} = await auth.client.rpc('start_analysis_considerations',
    {analysis_id: analysisId, version: WRITING_VERSION}).single();
  if (startError) {
    const code = startError.message;
    // Already ready, failed or running elsewhere: nothing to do, the app reads the stored row.
    if (code === 'considerations_exist') return json({analysis_id: analysisId, status: 'exists'});
    const status = START_ERRORS[code];
    if (!status) {
      log('considerations_start_error', {analysis_id: analysisId, code: startError.code});
      return errorResponse('start_failed', 500);
    }
    return errorResponse(code, status);
  }

  const service = serviceClient();
  const finish = async (reason: string | null, usage: Usage, draft: unknown = null) => {
    const {error} = reason
      ? await service.rpc('fail_analysis_considerations', {analysis_id: analysisId, reason, ...usage})
      : await service.rpc('complete_analysis_considerations', {analysis_id: analysisId, draft, ...usage});
    if (error) log('considerations_record_error', {analysis_id: analysisId, reason, code: error.code});
  };
  const noUsage: Usage = {model: null, input_tokens: null, output_tokens: null};

  const {data: analysis, error: readError} = await service.from('document_analyses')
    .select('extraction, document_id').eq('id', analysisId)
    .single<{extraction: Extraction | null; document_id: string}>();
  const extraction = analysis?.extraction;
  if (readError || !extraction || !Array.isArray(extraction.exams)) {
    await finish('no_extraction', noUsage);
    return errorResponse('no_extraction', 500);
  }
  // Only sex and birth date of the record, to complete what the report does not print; never name or CPF.
  const {data: document} = await service.from('documents').select('patient_id').eq('id', analysis.document_id)
    .maybeSingle<{patient_id: string | null}>();
  const {data: record} = document?.patient_id
    ? await service.from('patients').select('sex, birth_date').eq('id', document.patient_id)
      .maybeSingle<{sex: 'female' | 'male' | null; birth_date: string | null}>()
    : {data: null};

  const patient = patientFor(extraction, record ?? null);
  const selection = selectMeanings(extraction, patient, curated);
  if (selection.selected.length === 0 && selection.unexplained.length === 0) {
    await finish(null, noUsage, {paragraphs: [], unsourced: [], dropped: 0});
    return json({analysis_id: analysisId, status: 'ready'});
  }

  const started = Date.now();
  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    // No automatic retry (docs/compliance.md, Travas de custo). On a policy refusal the server reruns the request
    // on a fallback model within the same call.
    response = await anthropicClient({retries: 0}).beta.messages.create({
      ...buildWritingParams(writingInput(selection,
        {sex: patient.sex, age_years: patient.age ? Math.floor(patient.age.min / 12) : null})),
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  } catch (error) {
    log('considerations_provider_error', {analysis_id: analysisId, status: (error as {status?: number}).status ?? null});
    await finish('provider_error', noUsage);
    return errorResponse('provider_error', 502);
  }

  const usage: Usage = {model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens};
  const reason = response.stop_reason === 'refusal' ? 'refused'
    : response.stop_reason === 'max_tokens' ? 'output_truncated' : null;
  const text = response.content.find(block => block.type === 'text')?.text ?? '';
  const draft = reason ? null : validateDraft(text, selection);
  if (!draft) {
    await finish(reason ?? 'invalid_output', usage);
    log('considerations_failed', {analysis_id: analysisId, reason: reason ?? 'invalid_output', ...usage, ms: Date.now() - started});
    return errorResponse(reason ?? 'invalid_output', 502);
  }
  await finish(null, usage, draft);
  log('considerations_ready', {analysis_id: analysisId, ...usage, paragraphs: draft.paragraphs.length,
    unsourced: draft.unsourced.length, dropped: draft.dropped, ms: Date.now() - started});
  return json({analysis_id: analysisId, status: 'ready'});
});
