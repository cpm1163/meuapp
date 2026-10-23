// Clinical considerations, type 1 (grouping by theme, docs/clinical-considerations.md).
// The AI only names themes and assigns parameters to them. It receives exam names, parameter names and units, never
// values, references or the patient. The code checks the answer and writes every sentence from the report's own
// classification. Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

import type {Extraction} from '../lab-report/findings.ts';

export const GROUPING_VERSION = 'grouping/1';
export const GROUPING_MODEL = 'claude-opus-5-5';
// Grouping names is classification-like work: low effort keeps it fast and cheap.
export const GROUPING_EFFORT = 'low';
export const GROUPING_MAX_TOKENS = 16000;

export type Group = {title: string; parameter_ids: string[]};
export const OTHERS_TITLE = 'Outros exames';
const MAX_GROUPS = 30;
const MAX_TITLE = 60;
// A theme names a system or a panel; words of diagnosis, cause, risk or conduct belong to types 3 and 4.
const FORBIDDEN_TITLE = /diagnost|sugest|sugere|compativ|recomend|suplement|tanner|doenc|deficien|insuficien|anemia|hipotes|conduta|tratament|risco|toxic|alterad|normal|preservad|elevad|baix/;

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Parameter id used by the AI and by the code: "<exam index>.<parameter index>" in the extraction. */
export const parameterId = (examIndex: number, parameterIndex: number) => `${examIndex}.${parameterIndex}`;

/** What the AI sees: names and units only. */
export function groupingInput(extraction: Extraction): {id: string; exam: string; parameter: string; unit: string}[] {
  return extraction.exams.flatMap((exam, examIndex) => exam.parameters.map((parameter, parameterIndex) => ({
    id: parameterId(examIndex, parameterIndex), exam: exam.exam_name, parameter: parameter.name, unit: parameter.unit,
  })));
}

export const GROUPING_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {type: 'string'},
          parameter_ids: {type: 'array', items: {type: 'string'}},
        },
        required: ['title', 'parameter_ids'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups'],
  additionalProperties: false,
};

export const GROUPING_INSTRUCTIONS = `Você organiza os parâmetros de um laudo laboratorial brasileiro por tema, para um médico ler o relatório.
Você recebe só nomes de exames, nomes de parâmetros e unidades, sem resultados.

Regras
- Agrupe por sistema ou painel clínico, como "Perfil lipídico", "Hemograma", "Função renal", "Função hepática", "Tireoide", "Metabolismo da glicose", "Ferro", "Vitaminas", "Eletrólitos", "Hormônios", "Coagulação", "Sensibilização alérgica (IgE)", "Urina".
- Use os ids recebidos. Cada id entra em no máximo um tema. O que não se encaixar em nenhum tema fica de fora.
- O título nomeia só o tema, com até 60 caracteres. Não diga nada sobre resultados, diagnóstico, causa, risco, gravidade ou conduta.
- Junte parâmetros de exames diferentes quando forem do mesmo tema (ex.: colesterol total, HDL, LDL e triglicérides).
- Ordene os temas na ordem em que aparecem no laudo.`;

/** Messages API params (synchronous call, structured output). */
export function buildGroupingParams(extraction: Extraction) {
  return {
    model: GROUPING_MODEL,
    max_tokens: GROUPING_MAX_TOKENS,
    output_config: {effort: GROUPING_EFFORT, format: {type: 'json_schema', schema: GROUPING_SCHEMA}},
    system: GROUPING_INSTRUCTIONS,
    messages: [{role: 'user' as const, content: JSON.stringify(groupingInput(extraction))}],
  };
}

/**
 * Checks the AI answer against the extraction. Unknown ids and repeated ids are dropped; a theme whose title is
 * empty, too long or interpretive loses its title and its parameters go to "Outros exames"; parameters left out
 * also go there. Null when the answer is not the expected JSON.
 */
export function validateGroups(text: string, extraction: Extraction): Group[] | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const groups = (parsed as {groups?: unknown})?.groups;
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS) return null;
  const known = groupingInput(extraction).map(item => item.id);
  const valid = new Set(known);
  const used = new Set<string>();
  const result: Group[] = [];
  const others: string[] = [];
  for (const group of groups as {title?: unknown; parameter_ids?: unknown}[]) {
    const ids = Array.isArray(group?.parameter_ids)
      ? group.parameter_ids.filter((id): id is string => typeof id === 'string' && valid.has(id) && !used.has(id))
      : [];
    const unique = [...new Set(ids)];
    unique.forEach(id => used.add(id));
    if (unique.length === 0) continue;
    const title = typeof group?.title === 'string' ? group.title.trim() : '';
    if (!title || title.length > MAX_TITLE || FORBIDDEN_TITLE.test(normalize(title))) others.push(...unique);
    else result.push({title, parameter_ids: unique});
  }
  others.push(...known.filter(id => !used.has(id)));
  if (others.length) result.push({title: OTHERS_TITLE, parameter_ids: others});
  return result;
}

export type ThemeRow = {id: string; name: string; value: string; status: string};
export type Theme = {
  title: string;
  /** Outside the printed reference, with value and status. */
  outside: {name: string; value: string; status: string}[];
  within: string[];
  /** Not compared by the code (no reference, table to check, value not read). */
  unchecked: string[];
};

const OUTSIDE = new Set(['above', 'below', 'not_expected']);

/** Themes ready to show, written in code from the report rows (status against the printed reference only). */
export function buildThemes(groups: Group[], rows: ThemeRow[]): Theme[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  return groups.flatMap(group => {
    const members = group.parameter_ids.map(id => byId.get(id)).filter((row): row is ThemeRow => !!row);
    if (members.length === 0) return [];
    return [{
      title: group.title,
      outside: members.filter(row => OUTSIDE.has(row.status)).map(row => ({name: row.name, value: row.value, status: row.status})),
      within: members.filter(row => row.status === 'within').map(row => row.name),
      unchecked: members.filter(row => row.status !== 'within' && !OUTSIDE.has(row.status)).map(row => row.name),
    }];
  });
}

export const THEMES_NOTE = 'Temas agrupados por IA só pelos nomes dos exames; os valores e as situações vêm do laudo, '
  + 'comparados pelo app com a referência impressa.';

const OUTSIDE_TEXT: Record<string, string> = {
  above: 'acima da referência impressa', below: 'abaixo da referência impressa', not_expected: 'diferente do esperado',
};

/** The sentences of one theme, written in code. */
export function themeLines(theme: Theme): string[] {
  return [
    ...theme.outside.map(item => `${item.name}: ${item.value}, ${OUTSIDE_TEXT[item.status]}.`),
    ...(theme.within.length ? [`Dentro da referência impressa: ${theme.within.join(', ')}.`] : []),
    ...(theme.unchecked.length ? [`Sem comparação automática: ${theme.unchecked.join(', ')}.`] : []),
  ];
}

