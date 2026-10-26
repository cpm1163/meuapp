import type { Finding, FindingKind } from '../../../modules/lab-report/findings';

// Facts about the printed numbers, never what they mean (level A, docs/compliance.md).
export const DISCLAIMER = 'Lista gerada automaticamente a partir do laudo, sem interpretação clínica. Confira sempre o laudo original.';

export const GROUP_TITLES: Record<FindingKind, string> = {
  out_of_reference: 'Fora da referência',
  table_check: 'Conferir tabela de referência',
  history_change: 'Mudança desde o exame anterior',
  lab_flag_divergence: 'Divergência com a marcação do laboratório',
  unverifiable: 'Não verificável',
  incomplete_reading: 'Leitura incompleta',
  not_analyzed: 'Não analisado',
  hemogram_inconsistency: 'Consistência do hemograma',
  lab_note: 'Notas do laboratório',
};

const REASONS: Record<string, string> = {
  above_reference: 'Acima da referência',
  below_reference: 'Abaixo da referência',
  not_expected_value: 'Diferente do valor esperado',
  flagged_by_lab: 'Marcado pelo laboratório',
  clinical_category: 'O laudo traz referências diferentes por categoria clínica (ex.: risco, fase do ciclo); confira qual se aplica',
  no_unique_row: 'Não foi possível escolher uma única linha da tabela pelo sexo e idade',
  left_reference: 'Estava dentro da referência; agora está fora',
  returned_to_reference: 'Estava fora da referência; agora está dentro',
  crossed_reference: 'Passou de um lado da referência para o outro',
  lab_flag_differs: 'A marcação do laboratório difere da comparação com a referência; confira no laudo',
  value_not_read: 'Valor não lido',
  reference_not_parsed: 'Referência não interpretada',
  qualitative_range: 'A referência é uma faixa em palavras; o app não sabe a ordem da escala, confira no laudo',
  unit_not_recognized: 'Unidade não reconhecida',
  partial_legibility: 'Parte do documento está ilegível',
  exam_not_extracted: 'Exame listado no laudo e não lido',
  descriptive_exam: 'Laudo descritivo: análise ainda não disponível para este tipo',
  other_exam: 'Página sem exame laboratorial',
  index_mismatch: 'O índice impresso não fecha com os valores do hemograma',
  differential_sum: 'A soma do diferencial não dá 100%',
  absolute_mismatch: 'O valor absoluto não fecha com o percentual e os leucócitos',
  lab_note: 'Nota do laboratório',
};

const DIRECTIONS: Record<string, string> = { above: 'acima', below: 'abaixo' };

// Card colors of the points of attention (decided 26/10/2026). They show only the side of the printed reference,
// never whether the value is favorable: above and below differ because below is not necessarily better or worse.
export type FindingTone = 'above' | 'below' | 'out' | 'check' | 'neutral';
export const TONE_COLORS: Record<FindingTone, { text: string; background: string; border: string }> = {
  above: { text: '#B42318', background: '#FEF3F2', border: '#FAD7D2' },
  below: { text: '#B54708', background: '#FFF6ED', border: '#FCDDBE' },
  out: { text: '#B42318', background: '#FEF3F2', border: '#FAD7D2' },
  check: { text: '#7A5C00', background: '#FCF7E4', border: '#EFE2B3' },
  neutral: { text: '#55546D', background: '#FFFFFF', border: '#DAD6EA' },
};
export const TONE_NOTE = 'As cores indicam se o valor está acima ou abaixo da referência do laudo, não se é favorável ou desfavorável.';
const ARROWS: Partial<Record<FindingTone, string>> = { above: '↑ ', below: '↓ ' };

export function findingTone(finding: Finding): FindingTone {
  if (finding.kind === 'table_check' || finding.kind === 'unverifiable') return 'check';
  if (finding.kind !== 'out_of_reference') return 'neutral';
  if (finding.reason === 'above_reference') return 'above';
  if (finding.reason === 'below_reference') return 'below';
  if (finding.reason === 'flagged_by_lab') {
    const direction = finding.details.direction;
    return direction === 'above' || direction === 'below' ? direction : 'out';
  }
  return 'out';
}

export function reasonText(finding: Finding): string {
  const base = REASONS[finding.reason] ?? finding.reason;
  const direction = DIRECTIONS[String(finding.details.direction ?? '')];
  const text = finding.reason === 'flagged_by_lab' && direction ? `${base} (${direction})` : base;
  return `${ARROWS[findingTone(finding)] ?? ''}${text}`;
}

/** Title line of a finding: parameter (or exam) and value with unit. */
export function findingTitle(finding: Finding): string {
  const name = finding.parameter_name ?? finding.exam_name ?? '';
  if (finding.kind === 'lab_note' || !finding.value_text) return name;
  return `${name}: ${finding.value_text}${finding.unit ? ` ${finding.unit}` : ''}`;
}

/** Context lines: reference, previous value, exam and page. */
export function findingDetails(finding: Finding): string[] {
  const lines: string[] = [];
  if (finding.kind === 'lab_note' && finding.value_text) lines.push(finding.value_text);
  if (finding.reference_text) lines.push(`Referência: ${finding.reference_text}`);
  if (finding.previous) {
    const printed = finding.previous.date;
    const date = !printed ? 'data não impressa'
      : /^\d{4}-\d{2}-\d{2}$/.test(printed) ? printed.split('-').reverse().join('/') : printed;
    lines.push(`Anterior: ${finding.previous.value_text} (${date})`);
  }
  if (finding.parameter_name && finding.exam_name) lines.push(`Exame: ${finding.exam_name}`);
  if (finding.page) lines.push(`Página ${finding.page}`);
  return lines;
}

/** Findings grouped in display order (they arrive sorted from findings.ts). */
export function groupFindings(findings: Finding[]): { kind: FindingKind; title: string; items: Finding[] }[] {
  const groups: { kind: FindingKind; title: string; items: Finding[] }[] = [];
  for (const finding of findings) {
    const last = groups[groups.length - 1];
    if (last?.kind === finding.kind) last.items.push(finding);
    else groups.push({ kind: finding.kind, title: GROUP_TITLES[finding.kind], items: [finding] });
  }
  return groups;
}
