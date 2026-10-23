// Clinical considerations, type 2 only (reference divergence, docs/clinical-considerations.md): sentences built in
// code from the comparator results and the curated statements. No AI and no free text: every number comes from
// the report or from the curated file, and every sentence cites a curated source and page.

import type {Comparison, CuratedStatements, SkipReason, StatementClass} from './compare.ts';

export type Consideration = {
  title: string; exam_name: string; page: number | null;
  lines: {text: string; reference: number}[];
  caveats: string[];
};
export type ConsiderationsResult = {
  items: Consideration[];
  /** Parameters with curated statements that could not be compared, with the reason. */
  notCompared: {title: string; reason: string}[];
  references: {number: number; text: string; url: string}[];
};

export const CONSIDERATIONS_DISCLAIMER = 'Apoio à interpretação do médico assistente; não é laudo nem diagnóstico. '
  + 'Compara cada valor com diretrizes selecionadas pelo app, pela idade e pelo sexo informados. '
  + 'Bibliografia ainda não validada por médico.';

const SKIP_TEXT: Record<SkipReason, string> = {
  no_value: 'valor não lido no laudo',
  sex_unknown: 'sexo não informado',
  age_unknown: 'idade não informada',
  age_ambiguous: 'a idade em anos não basta para escolher a faixa; cadastre a data de nascimento do paciente',
  no_statement: 'sem diretriz selecionada para esta idade e sexo',
  fasting_unknown: 'o laudo não informa se a coleta foi em jejum',
  unit_mismatch: 'unidade diferente da usada pela diretriz',
};

const number = (value: number) => value.toLocaleString('pt-BR', {maximumFractionDigits: 2});

function bounds(item: StatementClass, unit: string): string {
  const {min, max} = item;
  if (min !== undefined && max !== undefined) {
    return item.min_inclusive && item.max_inclusive ? `${number(min)} a ${number(max)} ${unit}`
      : `${item.min_inclusive ? '≥' : '>'} ${number(min)} e ${item.max_inclusive ? '≤' : '<'} ${number(max)} ${unit}`;
  }
  if (min !== undefined) return `${item.min_inclusive ? '≥' : '>'} ${number(min)} ${unit}`;
  if (max !== undefined) return `${item.max_inclusive ? '≤' : '<'} ${number(max)} ${unit}`;
  return '';
}

/** "American Academy of Pediatrics (Misra et al., ...), como reproduzido pela SBP" → "American Academy of Pediatrics". */
const criterionName = (criterion: string) => criterion.split(' (')[0];

export function buildConsiderations(comparisons: Comparison[], curated: CuratedStatements): ConsiderationsResult {
  const statements = new Map(curated.statements.map(item => [item.id, item]));
  const sources = new Map(curated.sources.map(item => [item.id, item]));
  const references: ConsiderationsResult['references'] = [];
  const referenceNumber = (sourceId: string, page: string) => {
    const source = sources.get(sourceId)!;
    const text = `${source.reference} p. ${page}.`;
    const found = references.find(item => item.text === text);
    if (found) return found.number;
    references.push({number: references.length + 1, text, url: source.url});
    return references.length;
  };

  const items: Consideration[] = [];
  const notCompared: ConsiderationsResult['notCompared'] = [];
  // One consideration per printed parameter, in the order of the report.
  const keyOf = (item: Comparison) => `${item.exam_name}\u0000${item.parameter_name}\u0000${item.page ?? ''}`;
  const groups = new Map<string, Comparison[]>();
  for (const item of comparisons) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);

  for (const group of groups.values()) {
    const first = group[0];
    const compared = group.filter(item => item.status !== 'skipped');
    if (compared.length === 0) {
      const reasons = [...new Set(group.map(item => item.status === 'skipped' ? SKIP_TEXT[item.reason] : ''))].filter(Boolean);
      notCompared.push({title: first.parameter_name, reason: reasons.join('; ')});
      continue;
    }
    const consideration: Consideration = {title: first.parameter_name, exam_name: first.exam_name, page: first.page,
      lines: [], caveats: []};
    for (const item of compared) {
      const statement = statements.get(item.statement_id)!;
      const source = sources.get(statement.source)!;
      const printed = `${item.value_number === null ? '' : number(item.value_number)} ${item.unit}`.trim();
      const value = item.compared_unit === item.unit ? printed : `${printed} (${number(item.compared_value)} ${item.compared_unit})`;
      const by = `${source.short}${item.criterion ? `, critério ${criterionName(item.criterion)}` : ''}`;
      const matched = statement.classes.find(entry => entry.label === item.class_label);
      const result = item.status === 'classified' && matched
        ? `${matched.label.charAt(0).toLowerCase()}${matched.label.slice(1)} (${bounds(matched, statement.unit)})`
        : 'fora das faixas impressas por este critério';
      const fasting = item.also_statement_id ? ', com ou sem jejum' : '';
      consideration.lines.push({text: `${value}: ${result} pela ${by}${fasting}.`,
        reference: referenceNumber(statement.source, statement.page.printed)});
      for (const caveat of statement.caveats ?? []) if (!consideration.caveats.includes(caveat)) consideration.caveats.push(caveat);
    }
    items.push(consideration);
  }
  return {items, notCompared, references};
}
