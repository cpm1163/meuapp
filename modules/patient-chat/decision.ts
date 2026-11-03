// Decides what the person reads. The AI only classifies: every text comes from here or, literally, from a KB item.
// Self-contained so it runs unchanged in the Edge Function (Deno), in the app and in the Node tests.

import type {KbItem} from './kb.ts';

export const MAX_QUESTION_LENGTH = 500;

export type Intent = 'answer' | 'not_in_kb' | 'refer_doctor' | 'decline';
export type Classification = {urgent: boolean; intent: Intent; item: number | null};
export type Outcome = 'urgency' | 'answer' | 'not_in_kb' | 'refer_doctor' | 'decline' | 'unavailable';
export type UrgencySource = 'code' | 'ai' | 'both';
export type Decision = {outcome: Outcome; text: string; item: number | null; detected_by: UrgencySource | null};

// DRAFT texts for the test; they need the partner physician's review before any real use.
export const REPLIES: Record<Exclude<Outcome, 'answer'>, string> = {
  urgency: 'Isso pode ser uma urgência. Procure atendimento agora: ligue 192 (SAMU) ou vá ao pronto-socorro mais próximo. Se houver risco de alguém tirar a própria vida, ligue também 188 (CVV), a qualquer hora.',
  not_in_kb: 'Não tenho essa informação. Converse com o médico.',
  refer_doctor: 'Não posso avaliar essa situação por aqui. Converse com o médico, que pode orientar você com segurança.',
  decline: 'Não posso ajudar com esse pedido. Posso responder a dúvidas gerais sobre saúde.',
  unavailable: 'Não consegui responder agora. Tente de novo em instantes. Se for urgência, ligue 192 (SAMU) ou vá ao pronto-socorro mais próximo.',
};

const INTENTS: Intent[] = ['answer', 'not_in_kb', 'refer_doctor', 'decline'];

/** The classification in the AI's answer, or null when it is not exactly the expected object. */
export function parseClassification(text: string): Classification | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const {urgent, intent, item} = parsed as Record<string, unknown>;
  if (typeof urgent !== 'boolean' || !INTENTS.includes(intent as Intent)) return null;
  if (item !== null && !Number.isInteger(item)) return null;
  return {urgent, intent: intent as Intent, item: item as number | null};
}

const fixed = (outcome: Exclude<Outcome, 'answer'>, detectedBy: UrgencySource | null = null): Decision =>
  ({outcome, text: REPLIES[outcome], item: null, detected_by: detectedBy});

/** `classification` is null when the AI failed, refused, was cut off, answered off-format or was not called. */
export function decide(signal: boolean, classification: Classification | null, kb: KbItem[]): Decision {
  if (signal) return fixed('urgency', classification?.urgent ? 'both' : 'code');
  if (!classification) return fixed('unavailable');
  if (classification.urgent) return fixed('urgency', 'ai');
  if (classification.intent !== 'answer') return fixed(classification.intent);
  const cited = kb.find(entry => entry.item === classification.item);
  return cited ? {outcome: 'answer', text: cited.answer, item: cited.item, detected_by: null} : fixed('not_in_kb');
}

/** The AI pointed to the KB, but the item is missing or does not exist. */
export function isInvalidCitation(classification: Classification | null, kb: KbItem[]): boolean {
  return classification?.intent === 'answer' && !kb.some(entry => entry.item === classification.item);
}
