// Urgency signals checked in code, besides the AI classification; either one triggers the urgency reply.
// DRAFT until reviewed by the partner physician. This list can only trigger urgency: it never blocks or refuses a message.

export const URGENCY_SIGNALS_STATUS = 'draft';
const SCAN_LIMIT = 2000;

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

// Expressions, never loose words. An informational question that uses one of them also gets the urgency reply, on purpose.
const SIGNALS = [
  'falta de ar', 'dificuldade para respirar', 'nao consegue respirar', 'se matar', 'suicidio', 'tirar a propria vida',
  'convulsao', 'desmaiou', 'inconsciente', 'nao acorda', 'engasgado', 'sangramento intenso', 'labios roxos',
  'intoxicacao', 'overdose',
];
const PATTERN = new RegExp(`\\b(?:${SIGNALS.join('|')})\\b`);

export function hasUrgencySignal(message: string): boolean {
  return PATTERN.test(normalize(message.slice(0, SCAN_LIMIT)));
}
