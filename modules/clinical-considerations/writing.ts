// Clinical considerations as a draft written by the AI (docs/clinical-considerations.md, "Formato da saída", 26/10/2026).
// The code selects the meaning cards (meanings.ts); the AI writes running text from them, citing the card of each
// sentence, plus a separate block without source for the results no card explains. The code checks every sentence and
// drops the ones that break the rules; the doctor then edits and approves the draft. The AI never receives values,
// name or CPF: only age, sex, parameter names, their situation against the printed reference and the cards.
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

import {hasNumbers, type Selection} from './meanings.ts';

export const WRITING_VERSION = 'considerations/2';
export const WRITING_MODEL = 'claude-opus-5-5';
export const WRITING_EFFORT = 'medium';
export const WRITING_MAX_TOKENS = 16000;

export type DraftSentence = {text: string; card_ids: string[]};
export type Draft = {
  paragraphs: {theme: string; sentences: DraftSentence[]}[];
  /** Results without a card, written by the AI from general knowledge and shown as such. */
  unsourced: {text: string; parameters: string[]}[];
  /** Sentences dropped by the checks, for the record. */
  dropped: number;
  /** Each dropped sentence with the rule it broke, to diagnose gaps (considerations/2). */
  dropped_details?: DroppedSentence[];
  /** Results outside the reference that no kept sentence covers, shown to the doctor (considerations/2). */
  uncovered?: string[];
};
export type DropRule = 'empty' | 'too_long' | 'numbers' | 'conduct' | 'certainty' | 'no_card' | 'unknown_card'
  | 'side' | 'unknown_parameter' | 'citation' | 'theme';
export type DroppedSentence = {part: 'sourced' | 'unsourced'; text: string; rule: DropRule};

const STATUS_TEXT: Record<string, string> = {
  above: 'acima da referência impressa', below: 'abaixo da referência impressa', within: 'dentro da referência impressa',
  not_expected: 'diferente do valor esperado',
};
const MAX_SENTENCE = 600;
const MAX_THEME = 60;

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Conduct, prescription and certainty about the patient stay out (docs/clinical-considerations.md).
const CONDUCT = /\b(solicit|recomend|deve(m|ria)?\b|tratar|tratamento|inici(ar|e)|prescrev|suspend|encaminh|repetir|investig|acompanhar|considerar)/;
const CERTAINTY = /\b(o paciente (tem|apresenta|possui|e portador)|diagnostico de|confirma|indica(m)?\b)/;
// The block without source must not look sourced: no citation markers, guideline or society names.
const CITATION = /\[|\bet al\b|diretriz|guideline|sociedade|\bsb[a-z]{1,3}\b|kdigo|\boms\b|\bwho\b/;
const RAISED = /elevad|aument|acima|\balt[oa]s?\b/;
const LOWERED = /reduzid|diminu|abaixo|\bbaix[oa]s?\b/;

/** What the AI sees. */
export function writingInput(selection: Selection, patient: {sex: 'female' | 'male' | null; age_years: number | null}) {
  return {
    patient: {sex: patient.sex === 'female' ? 'feminino' : patient.sex === 'male' ? 'masculino' : 'não informado',
      age_years: patient.age_years},
    cards: selection.selected.map(card => ({
      id: card.id, theme: card.theme, meaning: card.meaning, caveats: card.caveats,
      parameters: card.parameters.map(item => ({name: item.name, situation: STATUS_TEXT[item.status] ?? 'sem comparação'})),
    })),
    without_card: selection.unexplained.map(item => ({name: item.name, exam: item.exam_name,
      situation: STATUS_TEXT[item.status] ?? 'sem comparação'})),
  };
}

export const WRITING_SCHEMA = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: {type: 'string'},
          sentences: {
            type: 'array',
            items: {
              type: 'object',
              properties: {text: {type: 'string'}, card_ids: {type: 'array', items: {type: 'string'}}},
              required: ['text', 'card_ids'],
              additionalProperties: false,
            },
          },
        },
        required: ['theme', 'sentences'],
        additionalProperties: false,
      },
    },
    unsourced: {
      type: 'array',
      items: {
        type: 'object',
        properties: {text: {type: 'string'}, parameters: {type: 'array', items: {type: 'string'}}},
        required: ['text', 'parameters'],
        additionalProperties: false,
      },
    },
  },
  required: ['paragraphs', 'unsourced'],
  additionalProperties: false,
};

export const WRITING_INSTRUCTIONS = `Você escreve o rascunho das considerações clínicas de um laudo laboratorial brasileiro para o médico assistente, que vai revisar, editar e aprovar o texto.
Você recebe idade e sexo do paciente, fichas de significado já selecionadas pelo app (cada uma com o tema, o significado e os parâmetros que a sustentam) e a lista de resultados fora da referência que nenhuma ficha explica. Você não recebe valores.

Parte 1 — paragraphs (com base nas fichas)
- Escreva texto corrido, como um médico escreveria, com um parágrafo por tema. Junte as fichas do mesmo tema e mostre o que o conjunto significa.
- Use somente o que as fichas dizem. Não acrescente significado, causa, risco ou associação que nenhuma ficha traga. Você pode reescrever com suas palavras e ligar as fichas entre si.
- Cada frase indica em card_ids as fichas que a sustentam. Toda frase precisa de pelo menos uma ficha.
- Mencione os avisos (caveats) das fichas quando couberem.
- No máximo cinco frases por tema: junte as fichas em frases mais completas em vez de repetir.

Parte 2 — unsourced (sem ficha)
- Todo resultado de without_card precisa aparecer em pelo menos uma frase. Escreva uma ou duas frases por resultado (ou por grupo de resultados relacionados) sobre o que o achado pode significar, com base em conhecimento geral.
- Em parameters, liste só nomes de without_card, copiados exatamente como recebidos. Não liste parâmetros das fichas.
- Não cite diretriz, sociedade, autor nem referência: esse bloco é mostrado como análise sem fonte verificada.

Regras para todo o texto
- Sem números: nada de valores, limites, porcentagens ou anos. Nomes de categoria como G2 e A1 podem aparecer. Escreva "hemoglobina glicada", não "HbA1c".
- Linguagem de hipótese: "compatível com", "pode estar associado a". Nunca afirme que o paciente tem uma doença nem use "indica".
- Sem conduta: não sugira exames, tratamento, encaminhamento, repetição ou acompanhamento.
- Português do Brasil, frases curtas e claras. Temas com até 60 caracteres.`;

/** Messages API params (synchronous call, structured output). */
export function buildWritingParams(input: ReturnType<typeof writingInput>) {
  return {
    model: WRITING_MODEL,
    max_tokens: WRITING_MAX_TOKENS,
    output_config: {effort: WRITING_EFFORT, format: {type: 'json_schema', schema: WRITING_SCHEMA}},
    system: WRITING_INSTRUCTIONS,
    messages: [{role: 'user' as const, content: JSON.stringify(input)}],
  };
}

function commonRule(text: string): DropRule | null {
  const plain = normalize(text);
  if (!text.trim()) return 'empty';
  if (text.length > MAX_SENTENCE) return 'too_long';
  if (hasNumbers(text)) return 'numbers';
  if (CONDUCT.test(plain)) return 'conduct';
  if (CERTAINTY.test(plain)) return 'certainty';
  return null;
}

/**
 * Checks the AI answer against the selection and keeps only the sentences that pass. A sentence in the sourced part
 * must cite selected cards, and may say "raised" or "lowered" only when one of its cards has a parameter on that side
 * (or the card's own meaning says so). Null when the answer is not the expected JSON. Every dropped sentence is kept
 * with its rule, and the results outside the reference that no kept sentence covers are listed for the doctor.
 */
export function validateDraft(text: string, selection: Selection): Draft | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const answer = parsed as {paragraphs?: unknown; unsourced?: unknown};
  if (!Array.isArray(answer?.paragraphs) || !Array.isArray(answer?.unsourced)) return null;
  const cards = new Map(selection.selected.map(card => [card.id, card]));
  const withoutCard = new Map(selection.unexplained.map(item => [item.name, item.status]));
  const droppedDetails: DroppedSentence[] = [];

  const sideAllowed = (sentence: string, ids: string[], side: 'above' | 'below') => {
    const words = side === 'above' ? RAISED : LOWERED;
    if (!words.test(normalize(sentence))) return true;
    return ids.some(id => {
      const card = cards.get(id)!;
      return card.parameters.some(item => item.status === side) || words.test(normalize(card.meaning));
    });
  };

  const paragraphs: Draft['paragraphs'] = [];
  for (const paragraph of answer.paragraphs as {theme?: unknown; sentences?: unknown}[]) {
    const theme = typeof paragraph?.theme === 'string' ? paragraph.theme.trim() : '';
    const sentences: DraftSentence[] = [];
    for (const item of Array.isArray(paragraph?.sentences) ? paragraph.sentences as {text?: unknown; card_ids?: unknown}[] : []) {
      const sentence = typeof item?.text === 'string' ? item.text.trim() : '';
      const ids = Array.isArray(item?.card_ids) ? [...new Set(item.card_ids.filter((id): id is string => typeof id === 'string'))] : [];
      const rule: DropRule | null = ids.length === 0 ? 'no_card' : !ids.every(id => cards.has(id)) ? 'unknown_card'
        : commonRule(sentence) ?? (sideAllowed(sentence, ids, 'above') && sideAllowed(sentence, ids, 'below') ? null : 'side');
      if (rule) droppedDetails.push({part: 'sourced', text: sentence, rule});
      else sentences.push({text: sentence, card_ids: ids});
    }
    if (sentences.length && theme && theme.length <= MAX_THEME && !hasNumbers(theme)) paragraphs.push({theme, sentences});
    else droppedDetails.push(...sentences.map(item => ({part: 'sourced' as const, text: item.text, rule: 'theme' as const})));
  }

  const unsourced: Draft['unsourced'] = [];
  for (const item of answer.unsourced as {text?: unknown; parameters?: unknown}[]) {
    const sentence = typeof item?.text === 'string' ? item.text.trim() : '';
    const names = Array.isArray(item?.parameters) ? [...new Set(item.parameters.filter((name): name is string => typeof name === 'string'))] : [];
    const plain = normalize(sentence);
    const sides = names.map(name => withoutCard.get(name));
    const rule: DropRule | null = names.length === 0 || !names.every(name => withoutCard.has(name)) ? 'unknown_parameter'
      : commonRule(sentence) ?? (CITATION.test(plain) ? 'citation'
        : (RAISED.test(plain) && !sides.includes('above')) || (LOWERED.test(plain) && !sides.includes('below')) ? 'side' : null);
    if (rule) droppedDetails.push({part: 'unsourced', text: sentence, rule});
    else unsourced.push({text: sentence, parameters: names});
  }

  const covered = new Set([
    ...paragraphs.flatMap(paragraph => paragraph.sentences.flatMap(sentence => sentence.card_ids))
      .flatMap(id => cards.get(id)!.parameters.map(item => item.name)),
    ...unsourced.flatMap(item => item.parameters),
  ]);
  const expected = [...selection.selected.flatMap(card => card.parameters), ...selection.unexplained]
    .filter(item => item.status !== 'within').map(item => item.name);
  const uncovered = [...new Set(expected.filter(name => !covered.has(name)))];
  return {paragraphs, unsourced, dropped: droppedDetails.length, dropped_details: droppedDetails, uncovered};
}

export const UNSOURCED_TITLE = 'Análise da IA, sem fonte verificada';
export const UNSOURCED_NOTE = 'Os achados abaixo não têm significado na bibliografia selecionada pelo app. O texto foi escrito '
  + 'pela IA com base em conhecimento geral e não foi conferido em diretriz.';
export const DRAFT_NOTE = 'Rascunho — não revisado. Leia, edite se necessário e aprove; só o texto aprovado vai para o PDF.';

type CardsFile = {
  sources: {id: string; kind: 'guideline' | 'review'; reference: string}[];
  meanings: {id: string; source: string; page: {pdf?: number; printed?: string; section?: string}}[];
};

/**
 * The draft as editable text: one block per theme with [n] after each sentence, then the block without source under
 * its own title. References are numbered in order of first citation, one per source and page; reviews say so.
 */
export function draftText(draft: Draft, cards: CardsFile): {text: string; references: string[]} {
  const sources = new Map(cards.sources.map(item => [item.id, item]));
  const meanings = new Map(cards.meanings.map(item => [item.id, item]));
  const references: string[] = [];
  const numberOf = (cardId: string) => {
    const meaning = meanings.get(cardId);
    const source = meaning && sources.get(meaning.source);
    if (!meaning || !source) return null;
    const page = meaning.page.printed ? ` p. ${meaning.page.printed}.` : meaning.page.section ? ` Seção: ${meaning.page.section}.` : '';
    const text = `${source.reference}${page}${source.kind === 'review' ? ' (revisão, não diretriz)' : ''}`;
    const found = references.indexOf(text);
    if (found >= 0) return found + 1;
    references.push(text);
    return references.length;
  };
  const blocks = draft.paragraphs.map(paragraph => `${paragraph.theme}\n${paragraph.sentences.map(sentence => {
    const numbers = [...new Set(sentence.card_ids.map(numberOf).filter((item): item is number => item !== null))];
    return `${sentence.text}${numbers.length ? ' ' + numbers.map(item => `[${item}]`).join('') : ''}`;
  }).join(' ')}`);
  if (draft.unsourced.length) blocks.push(`${UNSOURCED_TITLE}\n${draft.unsourced.map(item => item.text).join(' ')}`);
  return {text: blocks.join('\n\n'), references};
}

/** Splits an approved or draft text at the title of the block without source, so it can be shown apart. */
export function splitUnsourced(text: string): {sourced: string; unsourced: string | null} {
  const at = text.indexOf(UNSOURCED_TITLE);
  if (at < 0) return {sourced: text.trim(), unsourced: null};
  return {sourced: text.slice(0, at).trim(), unsourced: text.slice(at + UNSOURCED_TITLE.length).trim()};
}

export const WRITING_DISCLAIMER = 'Apoio à interpretação do médico assistente; não é laudo nem diagnóstico. Texto escrito por IA '
  + 'a partir de fichas da bibliografia selecionada pelo app e conferido por regras do app. Bibliografia ainda não validada por médico.';

/**
 * Blocks of a (possibly edited) text, separated by blank lines. A first line without final punctuation and up to the
 * theme length is the block title, as written by draftText; anything else is body.
 */
export function textBlocks(text: string): {title: string | null; body: string}[] {
  return text.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).map(block => {
    const [first, ...rest] = block.split('\n');
    const isTitle = rest.length > 0 && first.trim().length <= MAX_THEME && !/[.!?:;]$/.test(first.trim());
    return isTitle ? {title: first.trim(), body: rest.join('\n').trim()} : {title: null, body: block};
  });
}
