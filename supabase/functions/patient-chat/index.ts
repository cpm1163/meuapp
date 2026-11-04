// Patient chat, test only (docs/knowledge-base.md): the only access to the KB.
// 1. A signal from the code's list guarantees the urgency reply, whatever happens next.
// 2. The database authorizes with the user's token and applies the limit, before the AI is called.
// 3. One AI call, never retried, that returns only a classification. The code picks the text the person reads.
// Logs and the database never carry the question.

import type Anthropic from '@anthropic-ai/sdk';
import {decide, isInvalidCitation, MAX_QUESTION_LENGTH, parseClassification, type Classification} from '../../../modules/patient-chat/decision.ts';
import type {KbItem} from '../../../modules/patient-chat/kb.ts';
import {buildChatParams} from '../../../modules/patient-chat/request.ts';
import {hasUrgencySignal} from '../../../modules/patient-chat/urgency-signals.ts';
import {anthropicClient, authenticate, corsHeaders, errorResponse, json, log, serviceClient} from '../_shared/common.ts';

// A new connection per call: a reused one that had died failed the question without any retry to save it.
const noPoolClient = Deno.createHttpClient({poolMaxIdlePerHost: 0});

// Refusals raised by start_patient_chat, by exception message.
const START_ERRORS: Record<string, number> = {
  not_authenticated: 401,
  module_not_available: 403,
  kb_unavailable: 503,
  chat_limit_reached: 429,
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as {question?: unknown} | null;
  if (typeof body?.question !== 'string') return errorResponse('invalid_question', 400);
  const question = body.question.trim();
  const signal = hasUrgencySignal(question);
  // A signal is never refused for its length or the limit: the reply is fixed and costs nothing.
  const urgencyWithoutAi = () => {
    log('patient_chat_reply', {outcome: 'urgency', detected_by: 'code', ai_called: false});
    return json(decide(true, null, []));
  };

  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return signal ? urgencyWithoutAi() : errorResponse('invalid_question', 400);
  }

  const {data: usageId, error: startError} = await auth.client.rpc('start_patient_chat');
  if (startError) {
    const code = startError.message;
    if (code === 'chat_limit_reached' && signal) return urgencyWithoutAi();
    const status = START_ERRORS[code];
    if (!status) {
      log('patient_chat_start_error', {code: startError.code});
      return errorResponse('start_failed', 500);
    }
    return errorResponse(code, status);
  }

  const service = serviceClient();
  const started = Date.now();
  const {data: kbRows, error: kbError} = await service.from('patient_chat_kb_items')
    .select('item, question, answer').order('item');
  const kb = (kbRows ?? []) as KbItem[];
  let classification: Classification | null = null;
  let reason: string | null = kbError || !kb.length ? 'kb_read_failed' : null;

  if (!reason) {
    try {
      // No automatic retry (docs/compliance.md, Travas de custo); Haiku has no server-side fallback on a refusal.
      const response = await anthropicClient({retries: 0, timeout: 30_000}).messages.create(
        buildChatParams(question, kb) as unknown as Anthropic.MessageCreateParamsNonStreaming,
        {fetchOptions: {client: noPoolClient} as RequestInit});
      const {error} = await service.from('patient_chat_usage').update({
        model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
      }).eq('id', usageId);
      if (error) log('patient_chat_usage_error', {code: error.code});
      if (response.stop_reason === 'refusal') reason = 'refused';
      else if (response.stop_reason === 'max_tokens') reason = 'output_truncated';
      else {
        classification = parseClassification(response.content.find(block => block.type === 'text')?.text ?? '');
        if (!classification) reason = 'invalid_output';
      }
      log('patient_chat_tokens', {model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens});
    } catch (error) {
      reason = 'provider_error';
      // A connection failure has no status: the name and the cause tell a timeout from a dropped connection.
      const {status, cause} = error as {status?: number; cause?: {name?: string; message?: string}};
      log('patient_chat_provider_error', {
        status: status ?? null, error_class: (error as object)?.constructor?.name ?? null, cause_name: cause?.name ?? null,
        cause_message: cause?.message?.replaceAll(question, '[pergunta]').slice(0, 200) ?? null,
      });
    }
  }

  const decision = decide(signal, classification, kb);
  log('patient_chat_reply', {
    outcome: decision.outcome, detected_by: decision.detected_by, item: decision.item, reason,
    invalid_citation: isInvalidCitation(classification, kb), ms: Date.now() - started,
  });
  return json(decision);
});
