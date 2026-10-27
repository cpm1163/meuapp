import { classifyParameter, generateFindings, normalizeText, type Extraction, type Finding, type ParameterStatus, type Sex } from '../../../modules/lab-report/findings';
import { splitUnsourced, textBlocks, UNSOURCED_NOTE, UNSOURCED_TITLE, WRITING_DISCLAIMER } from '../../../modules/clinical-considerations/writing';
import { DISCLAIMER, findingDetails, findingTitle, findingTone, groupFindings, reasonText, TONE_COLORS, TONE_NOTE, valueWithUnit } from './findings-text';

// Full report of one analysis (decided 16/10/2026, docs/exam-comparison.md): every parameter by exam, classified in
// code against the printed reference (level A). It never carries the patient's name or CPF, only age and sex,
// because the PDF leaves the app (WhatsApp); the extraction itself never transcribes the patient's identification.

type Parameter = Extraction['exams'][number]['parameters'][number];

// The sum of the differential ("Leucócitos 100 %", reference "100 %") is sometimes transcribed as a parameter:
// it says nothing about the patient, so it is left out of the tables.
function isDifferentialTotal(parameter: Parameter): boolean {
  const digits = (text: string) => text.replace(/[\s%]/g, '').replace(',', '.');
  return `${parameter.value_text}${parameter.unit}`.includes('%') && ['100', '100.0'].includes(digits(parameter.value_text))
    && ['100', '100.0'].includes(digits(parameter.reference.text));
}

export type Demographics = { sex: Sex; birthDate: string | null };
export type ReportRow = {
  name: string; value: string; reference: string; status: ParameterStatus; statusText: string;
  row: string | null; labFlag: string | null; previous: string | null; page: number | null;
};
export type ReportExam = { name: string; detail: string; rows: ReportRow[]; notes: string[] };
export type Report = {
  laboratory: string; collectedAt: string; age: number | null; sex: Sex;
  // Where age and sex came from: printed on the report or taken from the patient record.
  demographicsSource: 'report' | 'record' | null;
  highlights: Finding[]; exams: ReportExam[]; otherExams: string[];
  // Printed sex or age that contradicts the patient record: the exam may be linked to the wrong patient.
  recordMismatch: string[];
  // What the report prints and the record lacks, offered to complete the record (never filled automatically).
  recordGaps: { sex: Sex; age: number | null };
};

export const STATUS_TEXT: Record<ParameterStatus, string> = {
  within: 'Dentro', below: 'Abaixo', above: 'Acima', not_expected: 'Diferente do esperado',
  table_check: 'Conferir tabela', unverifiable: 'Não comparado', not_comparable: 'Sem referência',
};
// Colors follow only the printed reference, as laboratories do; they never mean clinical severity.
export const STATUS_COLORS: Record<ParameterStatus, { text: string; background: string }> = {
  within: { text: '#2B8065', background: '#E3F4EE' },
  below: { text: '#B54708', background: '#FFEAD5' },
  above: { text: '#B42318', background: '#FDECEA' },
  not_expected: { text: '#B42318', background: '#FDECEA' },
  table_check: { text: '#7A5C00', background: '#F8EDC6' },
  unverifiable: { text: '#7A5C00', background: '#F8EDC6' },
  not_comparable: { text: '#55546D', background: '#F0EFF5' },
};
const FLAG_TEXT: Record<string, string> = { above: 'acima', below: 'abaixo', within: 'dentro' };
const SEX_TEXT: Record<'female' | 'male', string> = { female: 'Feminino', male: 'Masculino' };
// Lab notes stay inside each exam; the highlights are what the doctor should look at first.
const NOT_HIGHLIGHTED = new Set(['lab_note']);

export const formatDate = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : iso;

/** Whole years between the birth date and the collection date (or today when the report has no date). */
export function ageAt(birthDate: string, collectedAt: string, today = new Date()): number | null {
  const birth = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!birth) return null;
  const at = /^(\d{4})-(\d{2})-(\d{2})/.exec(collectedAt);
  const [y, m, d] = at ? [Number(at[1]), Number(at[2]), Number(at[3])] : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const age = y - Number(birth[1]) - (m < Number(birth[2]) || (m === Number(birth[2]) && d < Number(birth[3])) ? 1 : 0);
  return age >= 0 ? age : null;
}

export const sexText = (sex: 'female' | 'male') => SEX_TEXT[sex];

export function sexAgeText(report: Pick<Report, 'age' | 'sex'>): string {
  const parts = [report.age !== null ? `${report.age} anos` : null, report.sex ? SEX_TEXT[report.sex] : null].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Idade e sexo não informados';
}

// Some laboratories print the age at the release date, so one year of difference is tolerated.
const AGE_TOLERANCE_YEARS = 1;

/** Printed sex or age that contradicts the patient record (the main risk of linking exams to patients). */
export function recordMismatch(extraction: Extraction, record: Demographics | null): string[] {
  if (!record) return [];
  const problems: string[] = [];
  if (extraction.patient_sex && record.sex && extraction.patient_sex !== record.sex) {
    problems.push(`Sexo no laudo: ${SEX_TEXT[extraction.patient_sex]}; no cadastro: ${SEX_TEXT[record.sex]}.`);
  }
  // Without the collection date the record age would be today's, not comparable with an older report.
  const recordAge = record.birthDate && /^\d{4}-\d{2}-\d{2}/.test(extraction.collected_at)
    ? ageAt(record.birthDate, extraction.collected_at) : null;
  if (extraction.patient_age_years !== null && recordAge !== null
    && Math.abs(extraction.patient_age_years - recordAge) > AGE_TOLERANCE_YEARS) {
    problems.push(`Idade no laudo: ${extraction.patient_age_years} anos; pelo cadastro, na data da coleta: ${recordAge} anos.`);
  }
  return problems;
}

/** Printed sex missing from the record, and printed age when the record has no birth date. */
export function recordGaps(extraction: Extraction, record: Demographics | null): Report['recordGaps'] {
  if (!record) return { sex: null, age: null };
  return {
    sex: !record.sex ? extraction.patient_sex : null,
    age: !record.birthDate ? extraction.patient_age_years : null,
  };
}

/**
 * Builds the report. Age and sex printed on the report win; the patient record fills what is missing, so tables by
 * sex and age can pick their row.
 */
export function buildReport(extraction: Extraction, storedFindings: Finding[], record: Demographics | null): Report {
  const printed = extraction.patient_sex !== null || extraction.patient_age_years !== null;
  const sex = extraction.patient_sex ?? record?.sex ?? null;
  const age = extraction.patient_age_years
    ?? (record?.birthDate ? ageAt(record.birthDate, extraction.collected_at) : null);
  const filled = sex !== extraction.patient_sex || age !== extraction.patient_age_years;
  // Regenerated with the current code, so the table and the highlights always agree, also for older analyses;
  // the findings stored by the server stay as the record of what was shown then.
  let findings = storedFindings;
  try { findings = generateFindings({ ...extraction, patient_sex: sex, patient_age_years: age }); } catch { /* keep stored */ }
  return {
    laboratory: [extraction.laboratory.name, extraction.laboratory.registration].filter(Boolean).join(' · '),
    collectedAt: extraction.collected_at,
    age, sex,
    demographicsSource: filled ? 'record' : printed ? 'report' : null,
    highlights: findings.filter(finding => !NOT_HIGHLIGHTED.has(finding.kind)),
    exams: extraction.exams.map(exam => ({
      name: exam.exam_name,
      detail: [exam.material, exam.method].filter(Boolean).join(' · '),
      notes: exam.lab_notes.filter(Boolean),
      rows: exam.parameters.filter(parameter => !isDifferentialTotal(parameter)).map(parameter => {
        const { status, row } = classifyParameter(parameter, sex, age);
        const previous = parameter.history[0];
        return {
          name: parameter.name,
          value: valueWithUnit(parameter.value_text, parameter.unit || null),
          reference: parameter.reference.text,
          status, statusText: STATUS_TEXT[status], row,
          labFlag: parameter.lab_flag === 'none' ? null : FLAG_TEXT[parameter.lab_flag] ?? null,
          previous: previous ? `${previous.value_text}${previous.date ? ` (${formatDate(previous.date)})` : ''}` : null,
          page: parameter.page ?? exam.pages[0] ?? null,
        };
      }),
    })),
    otherExams: extraction.other_exams.map(exam => exam.exam_name).filter(Boolean),
    recordMismatch: recordMismatch(extraction, record),
    recordGaps: recordGaps(extraction, record),
  };
}

/**
 * Search on the report screen: every word of the query must appear in the parameter or exam name, ignoring accents
 * and case, or name a group of exams (SEARCH_GROUPS). An exam whose name matches keeps all its rows. `index` is the exam's position in the full report.
 */
// Group words that never appear in printed names ("lipídios" finds "Colesterol Total"). Navigation only: a group
// lists where to look, it never classifies a result. Keys are prefixes of the normalized word.
const SEARCH_GROUPS: [string, string[]][] = [
  ['lipid', ['colesterol', 'hdl', 'ldl', 'triglicer', 'lipoprot', 'apolipo']],
  ['tireo', ['tsh', 't4', 't3', 'tireo', 'tiroxina', 'triiodotironina']],
  ['tiroid', ['tsh', 't4', 't3', 'tireo', 'tiroxina', 'triiodotironina']],
  ['hepat', ['tgo', 'tgp', 'ast', 'alt', 'transaminase', 'gama', 'ggt', 'bilirrubina', 'fosfatase', 'albumina']],
  ['figado', ['tgo', 'tgp', 'ast', 'alt', 'transaminase', 'gama', 'ggt', 'bilirrubina', 'fosfatase', 'albumina']],
  ['renal', ['creatinina', 'ureia', 'filtracao', 'tfg', 'albumina/creatinina']],
  ['rim', ['creatinina', 'ureia', 'filtracao', 'tfg', 'albumina/creatinina']],
  ['glicem', ['glicose', 'glicada', 'hba1c', 'insulina', 'homa']],
  ['diabet', ['glicose', 'glicada', 'hba1c', 'insulina', 'homa']],
];
// Words that only describe the group ("perfil lipídico", "função renal", "exame de tireoide").
const SEARCH_FILLERS = new Set(['perfil', 'funcao', 'exame', 'exames', 'de', 'da', 'do', 'das', 'dos']);

/** Matcher for a search query, or null when the query has no words. */
function queryMatcher(query: string): ((text: string) => boolean) | null {
  const all = normalizeText(query).split(' ').filter(Boolean);
  const words = all.some(word => !SEARCH_FILLERS.has(word)) ? all.filter(word => !SEARCH_FILLERS.has(word)) : all;
  if (words.length === 0) return null;
  const wordMatches = (normalized: string, word: string) => normalized.includes(word)
    || SEARCH_GROUPS.some(([prefix, terms]) => word.startsWith(prefix) && terms.some(term => normalized.includes(term)));
  return text => { const normalized = normalizeText(text); return words.every(word => wordMatches(normalized, word)); };
}

export function searchExams(exams: ReportExam[], query: string): { exam: ReportExam; index: number }[] {
  const matches = queryMatcher(query);
  if (!matches) return exams.map((exam, index) => ({ exam, index }));
  return exams.flatMap((exam, index) => {
    if (matches(exam.name)) return [{ exam, index }];
    const rows = exam.rows.filter(row => matches(`${row.name} ${exam.name}`));
    return rows.length ? [{ exam: { ...exam, rows }, index }] : [];
  });
}

// The section is searched like a parameter name: each word may appear anywhere in it (like %word%).
const SECTION_NAME = 'Considerações clínicas Referências bibliográficas bibliografia diretrizes';

/** Whether the considerations section matches a search: by its name or by any word of its text. */
export function searchConsiderations(text: string, query: string): boolean {
  const matches = queryMatcher(query);
  return !!matches && (matches(SECTION_NAME) || matches(text));
}

/** The considerations approved by the doctor, the only ones that go to the PDF (decided 26/10/2026). */
export type ApprovedConsiderations = { text: string; approvedAt: string; references: string[] };

const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

/** Level B section, only when the doctor approved the text (see writing.ts). */
function considerationsHtml(approved: ApprovedConsiderations): string {
  const blocks = (text: string) => textBlocks(text).map(block =>
    `<p>${block.title ? `<b>${escape(block.title)}</b><br/>` : ''}${escape(block.body).replace(/\n/g, '<br/>')}</p>`).join('');
  const { sourced, unsourced } = splitUnsourced(approved.text);
  const references = approved.references.length ? `<h3>Referências bibliográficas</h3><ol>${
    approved.references.map(item => `<li>${escape(item)}</li>`).join('')}</ol>` : '';
  return `<h2>Considerações clínicas</h2><div class="box">${escape(WRITING_DISCLAIMER)}</div><p class="muted">Revisado pelo médico em ${
    escape(new Date(approved.approvedAt).toLocaleDateString('pt-BR'))}.</p>${blocks(sourced)}${unsourced !== null ? `<div class="box"><b>${escape(UNSOURCED_TITLE)}</b><br/><span class="muted">${
    escape(UNSOURCED_NOTE)}</span>${blocks(unsourced)}</div>` : ''}${references}`;
}

/** HTML for expo-print. Everything is escaped: the texts come from the AI transcription and from the doctor. */
export function reportHtml(report: Report, generatedAt: Date, considerations: ApprovedConsiderations | null = null): string {
  // One card per point of attention, colored by the side of the reference (findingTone).
  const highlights = groupFindings(report.highlights).map(group => `<h3>${escape(group.title)} (${group.items.length})</h3>${
    group.items.map(item => {
      const tone = TONE_COLORS[findingTone(item)];
      return `<div class="card" style="background:${tone.background};border-color:${tone.border}"><b>${escape(findingTitle(item))}</b><br/><span style="color:${
        tone.text};font-weight:600">${escape(reasonText(item))}</span>${
        findingDetails(item).map(line => `<br/><span class="muted">${escape(line)}</span>`).join('')}</div>`;
    }).join('')}`).join('');
  const exams = report.exams.map(exam => `<h2>${escape(exam.name)}</h2>${exam.detail ? `<p class="muted">${escape(exam.detail)}</p>` : ''}
    <table><thead><tr><th>Parâmetro</th><th>Resultado</th><th>Referência impressa</th><th>Situação</th></tr></thead><tbody>${
    exam.rows.map(row => `<tr><td>${escape(row.name)}${
      row.page ? `<br/><span class="muted">pág. ${row.page}</span>` : ''}</td><td>${escape(row.value)}${
      row.previous ? `<br/><span class="muted">anterior: ${escape(row.previous)}</span>` : ''}</td><td>${escape(row.reference)}${
      row.row ? `<br/><span class="muted">linha: ${escape(row.row)}</span>` : ''}</td><td><span class="badge" style="color:${STATUS_COLORS[row.status].text};background:${
      STATUS_COLORS[row.status].background}">${escape(row.statusText)}</span>${
      row.labFlag ? `<br/><span class="muted">laboratório: ${escape(row.labFlag)}</span>` : ''}</td></tr>`).join('')}</tbody></table>${
    exam.notes.length ? `<p class="muted"><b>Notas do laboratório:</b> ${exam.notes.map(escape).join(' · ')}</p>` : ''}`).join('');
  const others = report.otherExams.length
    ? `<h2>Não analisados</h2><p>${report.otherExams.map(escape).join(' · ')}</p>` : '';
  const source = report.demographicsSource === 'record' ? ' (do cadastro)' : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    @page { margin: 32pt; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; font-size: 10pt; color: #24253D; }
    h1 { font-size: 16pt; margin: 0 0 4pt; } h2 { font-size: 12pt; margin: 16pt 0 4pt; } h3 { font-size: 10.5pt; margin: 10pt 0 2pt; }
    .muted { color: #68667D; font-size: 8.5pt; } .box { background: #F0EFF5; padding: 8pt; border-radius: 6pt; margin: 8pt 0; }
    table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #DAD6EA; padding: 4pt; text-align: left; vertical-align: top; }
    th { font-size: 8.5pt; color: #55546D; } tr { page-break-inside: avoid; }
    .badge { display: inline-block; padding: 1pt 5pt; border-radius: 8pt; font-weight: 600; font-size: 8.5pt; }
    ul { margin: 2pt 0; padding-left: 14pt; } li { margin-bottom: 4pt; }
    .card { border: 1px solid; border-radius: 6pt; padding: 6pt 8pt; margin: 4pt 0; page-break-inside: avoid; }
  </style></head><body>
    <h1>Relatório de exames laboratoriais</h1>
    <p>${report.laboratory ? `Laboratório: ${escape(report.laboratory)}<br/>` : ''}Coleta: ${
      report.collectedAt ? escape(formatDate(report.collectedAt)) : 'data não impressa'}<br/>Paciente: ${escape(sexAgeText(report))}${source}</p>
    <div class="box">${escape(DISCLAIMER)} Transcrição automática por IA e comparação por regras do app; não é laudo nem diagnóstico.</div>
    <h2>Pontos de atenção</h2>${highlights ? `<p class="muted">${escape(TONE_NOTE)}</p>${highlights}` : '<p>Nenhum ponto de atenção encontrado.</p>'}
    ${exams}${considerations ? considerationsHtml(considerations) : ''}${others}
    <p class="muted">Gerado em ${escape(generatedAt.toLocaleString('pt-BR'))}. Sem identificação do paciente.</p>
  </body></html>`;
}
