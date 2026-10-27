// Builds the AI request for a lab report and turns the AI result (direct call or batch) into an analysis outcome.
// No SDK types: self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.
// The AI only transcribes; findings are generated here, in code (docs/compliance.md).

import {INSTRUCTIONS, INSTRUCTIONS_VERSION} from './instructions.ts';
import {failureReason, generateFindings, type Extraction, type Finding} from './findings.ts';
import {validateSchema, type JsonSchema} from './schema-check.ts';

// Haiku for speed and cost while testing (decided by the user on 27/10/2026: a fast result matters more than accuracy now).
export const MODEL = 'claude-haiku-5-5';
// Cost ceiling per analysis (docs/compliance.md, Travas de custo): room for a long report's JSON plus thinking.
export const MAX_TOKENS = 64000;
export const EFFORT = 'low';
export const MODULE_VERSION = INSTRUCTIONS_VERSION;

export type SourceFile = {mimeType: string; base64: string};

const IMAGE_TYPES = ['image/jpeg', 'image/png'];

/**
 * Instructions plus the JSON Schema the answer must follow. Structured outputs (output_config.format) is not used:
 * the API rejected this schema with "The compiled grammar is too large" (first real test, 08/10/2026).
 * The answer is validated against the full schema in interpretResult, so anything off-format still fails.
 */
export function systemPrompt(schema: JsonSchema): string {
  const {$schema: _schema, title: _title, ...rest} = schema;
  return `${INSTRUCTIONS}

Formato da resposta
Responda somente com um objeto JSON válido que siga exatamente o JSON Schema abaixo: sem texto antes ou depois, sem bloco de código e sem campos a mais.
${JSON.stringify(rest)}`;
}

/** The JSON object in the model's answer, tolerating a code fence or text around it. */
export function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** Messages API params for one analysis (direct streaming call); `instruction` narrows a reread to some exams. */
export function buildRequestParams(file: SourceFile, schema: JsonSchema,
  instruction = 'Transcreva este documento conforme as instruções.') {
  let source;
  if (file.mimeType === 'application/pdf') {
    source = {type: 'document', source: {type: 'base64', media_type: 'application/pdf', data: file.base64}};
  } else if (IMAGE_TYPES.includes(file.mimeType)) {
    source = {type: 'image', source: {type: 'base64', media_type: file.mimeType, data: file.base64}};
  } else {
    throw new Error('unsupported_file_type');
  }
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: {effort: EFFORT},
    system: systemPrompt(schema),
    messages: [{role: 'user', content: [source, {type: 'text', text: instruction}]}],
  };
}

export type Usage = {input_tokens?: number; output_tokens?: number} | null;
export type BatchResult =
  | {type: 'succeeded'; message: {model: string; stop_reason: string | null; content: {type: string; text?: string}[]; usage?: Usage}}
  | {type: 'errored'; error?: {error?: {type?: string; message?: string}}}
  | {type: 'expired' | 'canceled'};

export type Outcome =
  | {status: 'ready'; extraction: Extraction; findings: Finding[]; model: string; usage: Usage}
  | {status: 'failed'; reason: string; model: string | null; usage: Usage; detail?: string};

export type Reading = {ok: true; extraction: Extraction; model: string; usage: Usage} | {ok: false; outcome: Outcome};

/** Validates the AI output and generates the findings. Any doubt ends as a failure, never a partial result. */
export function interpretResult(result: BatchResult, schema: JsonSchema): Outcome {
  const reading = readResult(result, schema);
  return reading.ok ? finishOutcome(reading.extraction, reading.model, reading.usage) : reading.outcome;
}

/** The checked extraction of one reading (a whole report or one part), before the report-level checks. */
export function readResult(result: BatchResult, schema: JsonSchema): Reading {
  const fail = (outcome: Outcome): Reading => ({ok: false, outcome});
  if (result.type === 'errored') {
    // The provider's own error (e.g. a request it rejects); it never carries document content.
    const error = result.error?.error;
    const reason = error?.type === 'invalid_request_error' ? 'provider_invalid_request' : 'provider_error';
    const detail = [error?.type, error?.message].filter(Boolean).join(': ').slice(0, 500) || undefined;
    return fail({status: 'failed', reason, model: null, usage: null, detail});
  }
  if (result.type !== 'succeeded') return fail({status: 'failed', reason: `provider_${result.type}`, model: null, usage: null});
  const {message} = result;
  const failed = (reason: string, detail?: string): Reading =>
    fail({status: 'failed', reason, model: message.model, usage: message.usage ?? null, ...(detail ? {detail} : {})});
  if (message.stop_reason === 'refusal') return failed('model_refusal');
  if (message.stop_reason === 'max_tokens') return failed('output_truncated');
  if (message.stop_reason !== 'end_turn') return failed('unexpected_stop');
  const text = message.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('');
  let extraction: Extraction;
  try {
    extraction = JSON.parse(extractJson(text));
  } catch {
    return failed('invalid_output', 'json_parse');
  }
  // Field paths only, never values (e.g. "$.exams[3].parameters[2].value_kind: value not in enum").
  const errors = validateSchema(schema, extraction);
  if (errors.length > 0) return failed('invalid_output', errors.slice(0, 5).join('; ').slice(0, 450));
  return {ok: true, extraction, model: message.model, usage: message.usage ?? null};
}

/** Report-level checks and findings, on the whole extraction (merged when read in parts). */
export function finishOutcome(extraction: Extraction, model: string, usage: Usage): Outcome {
  const reason = failureReason(extraction);
  if (reason) return {status: 'failed', reason, model, usage};
  return {status: 'ready', extraction, findings: generateFindings(extraction), model, usage};
}
