// Points of attention for a lab report, generated in code from the AI extraction (docs/compliance.md).
// The AI only transcribes; every comparison here is deterministic. No clinical interpretation:
// findings say what is outside the printed reference or needs checking, never what it means.
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

export type Sex = 'female' | 'male' | null;
export type ReferenceKind = 'range' | 'upper_limit' | 'lower_limit' | 'table_by_demographics'
  | 'table_by_clinical_category' | 'qualitative' | 'none';
export type LabFlag = 'within' | 'below' | 'above' | 'none';

export type ReferenceRow = {
  label: string; sex: Sex; age_min_years: number | null; age_max_years: number | null;
  low: number | null; low_inclusive: boolean; high: number | null; high_inclusive: boolean;
};
export type Reference = {
  kind: ReferenceKind; text: string;
  low: number | null; low_inclusive: boolean; high: number | null; high_inclusive: boolean;
  expected: string[]; rows: ReferenceRow[];
};
export type HistoryEntry = {date: string | null; value_number: number | null; value_text: string};
export type Parameter = {
  name: string; code: string | null; value_kind: 'numeric' | 'qualitative';
  value_number: number | null; value_text: string; unit: string | null;
  reference: Reference; lab_flag: LabFlag; history: HistoryEntry[]; page: number | null;
};
export type Exam = {
  exam_name: string; pages: number[]; material: string | null; method: string | null;
  responsible: {name: string; registration: string | null; role: string | null; signed_at: string | null}[];
  lab_notes: string[]; parameters: Parameter[];
};
export type Extraction = {
  schema_version: string; is_lab_report: boolean; legibility: 'ok' | 'partial' | 'unreadable';
  laboratory: {name: string | null; registration: string | null};
  patient_sex: Sex; patient_age_years: number | null;
  collected_at: string | null; generated_at: string | null;
  executed_exams: string[]; exams: Exam[];
};

export type FindingKind = 'out_of_reference' | 'table_check' | 'history_change' | 'lab_flag_divergence'
  | 'unverifiable' | 'incomplete_reading' | 'hemogram_inconsistency' | 'lab_note';
export type Finding = {
  kind: FindingKind;
  reason: string;
  exam_name: string | null;
  parameter_name: string | null;
  page: number | null;
  value_text: string | null;
  unit: string | null;
  reference_text: string | null;
  lab_flag: LabFlag | null;
  previous: {date: string | null; value_text: string} | null;
  details: Record<string, unknown>;
};

/** Display order on the result screen. */
export const FINDING_ORDER: FindingKind[] = ['out_of_reference', 'table_check', 'history_change',
  'lab_flag_divergence', 'unverifiable', 'incomplete_reading', 'hemogram_inconsistency', 'lab_note'];

/**
 * Provisional tolerances for the hemogram consistency checks, to be calibrated with more samples.
 * Sample 1 deviated up to 0.15% on indices and 0.56% on a small absolute count.
 */
export const HEMOGRAM_TOLERANCES = {
  indexRelative: 0.01,
  differentialPoints: 2,
  absoluteRelative: 0.02,
  // Floor proportional to the WBC count, so it works for /µL and 10³/µL alike and
  // absorbs the rounding of a percentage printed with one decimal.
  absoluteWbcFraction: 0.001,
};

/** Reasons that end the analysis without findings. */
export function failureReason(extraction: Extraction): string | null {
  if (!extraction.is_lab_report) return 'not_lab_report';
  if (extraction.legibility === 'unreadable') return 'unreadable';
  if (extraction.exams.length === 0) return 'no_exams_found';
  return null;
}

type Comparison =
  | {status: 'within' | 'below' | 'above' | 'not_expected'; bounds?: Bounds; row?: string}
  | {status: 'table_check'; reason: string}
  | {status: 'unverifiable'; reason: string}
  | {status: 'not_comparable'};
type Bounds = {low: number | null; low_inclusive: boolean; high: number | null; high_inclusive: boolean};

export const normalizeText = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%/^.]+/g, ' ').trim();

function compareNumber(value: number, bounds: Bounds): 'within' | 'below' | 'above' {
  const {low, high} = bounds;
  if (low !== null && (bounds.low_inclusive ? value < low : value <= low)) return 'below';
  if (high !== null && (bounds.high_inclusive ? value > high : value >= high)) return 'above';
  return 'within';
}

function pickRow(rows: ReferenceRow[], sex: Sex, age: number | null): ReferenceRow | null {
  const matches = rows.filter(row => {
    if (row.sex !== null && (sex === null || row.sex !== sex)) return false;
    if (row.age_min_years !== null && (age === null || age < row.age_min_years)) return false;
    if (row.age_max_years !== null && (age === null || age > row.age_max_years)) return false;
    return true;
  });
  return matches.length === 1 ? matches[0] : null;
}

function compareValue(value: number | null, text: string, kind: Parameter['value_kind'], reference: Reference,
  sex: Sex, age: number | null): Comparison {
  if (reference.kind === 'none') return {status: 'not_comparable'};
  if (reference.kind === 'table_by_clinical_category') return {status: 'table_check', reason: 'clinical_category'};
  if (reference.kind === 'qualitative') {
    if (reference.expected.length === 0) return {status: 'unverifiable', reason: 'reference_not_parsed'};
    const expected = reference.expected.map(normalizeText);
    return {status: expected.includes(normalizeText(text)) ? 'within' : 'not_expected'};
  }
  if (kind !== 'numeric' || value === null) return {status: 'unverifiable', reason: 'value_not_read'};
  if (reference.kind === 'table_by_demographics') {
    const row = pickRow(reference.rows, sex, age);
    if (!row) return {status: 'table_check', reason: 'no_unique_row'};
    if (row.low === null && row.high === null) return {status: 'unverifiable', reason: 'reference_not_parsed'};
    return {status: compareNumber(value, row), bounds: row, row: row.label};
  }
  const needsLow = reference.kind === 'range' || reference.kind === 'lower_limit';
  const needsHigh = reference.kind === 'range' || reference.kind === 'upper_limit';
  if ((needsLow && reference.low === null) || (needsHigh && reference.high === null)) {
    return {status: 'unverifiable', reason: 'reference_not_parsed'};
  }
  const bounds = {
    low: needsLow ? reference.low : null, low_inclusive: reference.low_inclusive,
    high: needsHigh ? reference.high : null, high_inclusive: reference.high_inclusive,
  };
  return {status: compareNumber(value, bounds), bounds};
}

function latest(history: HistoryEntry[]): HistoryEntry | null {
  if (history.length === 0) return null;
  // The extraction lists history most recent first; ISO dates, when all present, take precedence.
  if (history.every(entry => entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date))) {
    return [...history].sort((a, b) => (b.date as string).localeCompare(a.date as string))[0];
  }
  return history[0];
}

const labFlagAgrees = (flag: LabFlag, status: 'within' | 'below' | 'above' | 'not_expected') =>
  status === 'not_expected' ? flag === 'below' || flag === 'above' : flag === status;

function parameterFindings(exam: Exam, parameter: Parameter, extraction: Extraction): Finding[] {
  const previousEntry = latest(parameter.history);
  const base = {
    exam_name: exam.exam_name, parameter_name: parameter.name, page: parameter.page ?? exam.pages[0] ?? null,
    value_text: parameter.value_text, unit: parameter.unit, reference_text: parameter.reference.text,
    lab_flag: parameter.lab_flag,
    previous: previousEntry ? {date: previousEntry.date, value_text: previousEntry.value_text} : null,
  };
  const finding = (kind: FindingKind, reason: string, details: Record<string, unknown> = {}): Finding =>
    ({kind, reason, ...base, details});
  const {patient_sex: sex, patient_age_years: age} = extraction;
  const current = compareValue(parameter.value_number, parameter.value_text, parameter.value_kind, parameter.reference, sex, age);
  const findings: Finding[] = [];

  if (current.status === 'table_check') findings.push(finding('table_check', current.reason, {rows: parameter.reference.rows}));
  if (current.status === 'unverifiable') findings.push(finding('unverifiable', current.reason));
  if (current.status === 'table_check' || current.status === 'unverifiable' || current.status === 'not_comparable') {
    // The code cannot compare, but the laboratory flagged it: never drop the lab's own warning.
    if (parameter.lab_flag === 'below' || parameter.lab_flag === 'above') {
      findings.push(finding('out_of_reference', 'flagged_by_lab', {direction: parameter.lab_flag}));
    }
    return findings;
  }

  const {status} = current;
  if (status !== 'within') {
    findings.push(finding('out_of_reference', status === 'not_expected' ? 'not_expected_value' : `${status}_reference`, {
      direction: status, flagged_by_lab: parameter.lab_flag !== 'none', row: current.row ?? null,
    }));
  }
  if (parameter.lab_flag !== 'none' && !labFlagAgrees(parameter.lab_flag, status)) {
    findings.push(finding('lab_flag_divergence', 'lab_flag_differs', {computed: status}));
  }
  if (previousEntry) {
    const before = compareValue(previousEntry.value_number, previousEntry.value_text, parameter.value_kind,
      parameter.reference, sex, age);
    if (before.status === 'within' || before.status === 'below' || before.status === 'above' || before.status === 'not_expected') {
      const wasIn = before.status === 'within';
      const isIn = status === 'within';
      if (wasIn && !isIn) findings.push(finding('history_change', 'left_reference', {before: before.status, now: status}));
      else if (!wasIn && isIn) findings.push(finding('history_change', 'returned_to_reference', {before: before.status, now: status}));
      else if (!wasIn && !isIn && before.status !== status) {
        findings.push(finding('history_change', 'crossed_reference', {before: before.status, now: status}));
      }
    }
  }
  return findings;
}

const UNIT_ALIASES: Record<string, string> = {
  '10^6/ul': 'M/uL', 'milhoes/ul': 'M/uL', 'tera/l': 'M/uL', '10^12/l': 'M/uL',
  'g/dl': 'g/dL', '%': '%', 'fl': 'fL', 'u3': 'fL', 'pg': 'pg', 'uug': 'pg',
};
export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const key = unit.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[µμ]/g, 'u').replace(/⁶/g, '^6').replace(/¹²/g, '^12').replace(/³/g, '3').replace(/\s+/g, '').replace(/x10/g, '10')
    .replace(/mm3/g, 'ul'); // 1 mm³ = 1 µL
  return UNIT_ALIASES[key] ?? key;
}

const DIFFERENTIAL = ['neutrophils', 'lymphocytes', 'monocytes', 'eosinophils', 'basophils'];

function hemogramFindings(extraction: Extraction): Finding[] {
  const byCode = new Map<string, {exam: Exam; parameter: Parameter}>();
  for (const exam of extraction.exams) for (const parameter of exam.parameters) {
    if (parameter.code && parameter.value_number !== null && !byCode.has(parameter.code)) byCode.set(parameter.code, {exam, parameter});
  }
  const findings: Finding[] = [];
  const get = (code: string) => byCode.get(code)?.parameter.value_number ?? null;
  const unitOf = (code: string) => normalizeUnit(byCode.get(code)?.parameter.unit ?? null);
  const report = (code: string, reason: string, kind: FindingKind, details: Record<string, unknown>) => {
    const entry = byCode.get(code);
    if (!entry) return;
    findings.push({
      kind, reason, exam_name: entry.exam.exam_name, parameter_name: entry.parameter.name,
      page: entry.parameter.page ?? entry.exam.pages[0] ?? null, value_text: entry.parameter.value_text,
      unit: entry.parameter.unit, reference_text: null, lab_flag: null, previous: null, details,
    });
  };

  const indices: {code: string; inputs: Record<string, string[]>; unit: string[]; formula: (v: Record<string, number>) => number}[] = [
    {code: 'mcv', inputs: {hematocrit: ['%'], rbc: ['M/uL']}, unit: ['fL'], formula: v => v.hematocrit / v.rbc * 10},
    {code: 'mch', inputs: {hemoglobin: ['g/dL'], rbc: ['M/uL']}, unit: ['pg'], formula: v => v.hemoglobin / v.rbc * 10},
    {code: 'mchc', inputs: {hemoglobin: ['g/dL'], hematocrit: ['%']}, unit: ['g/dL', '%'], formula: v => v.hemoglobin / v.hematocrit * 100},
  ];
  for (const index of indices) {
    const printed = get(index.code);
    const values: Record<string, number> = {};
    let ready = printed !== null;
    for (const [code, units] of Object.entries(index.inputs)) {
      const value = get(code);
      if (value === null || value === 0) { ready = false; continue; }
      if (!units.includes(unitOf(code) ?? '')) { ready = false; report(index.code, 'unit_not_recognized', 'unverifiable', {check: index.code, input: code}); continue; }
      values[code] = value;
    }
    if (!ready || printed === null) continue;
    if (!index.unit.includes(unitOf(index.code) ?? '')) { report(index.code, 'unit_not_recognized', 'unverifiable', {check: index.code}); continue; }
    const calculated = index.formula(values);
    const deviation = Math.abs(printed - calculated) / calculated;
    if (deviation > HEMOGRAM_TOLERANCES.indexRelative) {
      report(index.code, 'index_mismatch', 'hemogram_inconsistency', {check: index.code, printed, calculated: round(calculated), deviation: round(deviation)});
    }
  }

  const percents = DIFFERENTIAL.map(type => get(`${type}_pct`));
  if (percents.every(value => value !== null)) {
    const sum = (percents as number[]).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 100) > HEMOGRAM_TOLERANCES.differentialPoints) {
      report('neutrophils_pct', 'differential_sum', 'hemogram_inconsistency', {check: 'differential_sum', sum: round(sum)});
    }
  }

  const wbc = get('wbc');
  if (wbc !== null) {
    for (const type of DIFFERENTIAL) {
      const percent = get(`${type}_pct`);
      const absolute = get(`${type}_abs`);
      if (percent === null || absolute === null) continue;
      if (unitOf(`${type}_abs`) !== unitOf('wbc')) { report(`${type}_abs`, 'unit_not_recognized', 'unverifiable', {check: `${type}_abs`}); continue; }
      const expected = percent * wbc / 100;
      const tolerance = Math.max(expected * HEMOGRAM_TOLERANCES.absoluteRelative, wbc * HEMOGRAM_TOLERANCES.absoluteWbcFraction);
      if (Math.abs(absolute - expected) > tolerance) {
        report(`${type}_abs`, 'absolute_mismatch', 'hemogram_inconsistency', {check: `${type}_abs`, printed: absolute, calculated: round(expected)});
      }
    }
  }
  return findings;
}

const round = (value: number) => Math.round(value * 10000) / 10000;

function completenessFindings(extraction: Extraction): Finding[] {
  const findings: Finding[] = [];
  const empty = {parameter_name: null, page: null, value_text: null, unit: null, reference_text: null, lab_flag: null, previous: null};
  if (extraction.legibility === 'partial') {
    findings.push({kind: 'incomplete_reading', reason: 'partial_legibility', exam_name: null, ...empty, details: {}});
  }
  const extracted = extraction.exams.map(exam => normalizeText(exam.exam_name));
  for (const declared of extraction.executed_exams) {
    const name = normalizeText(declared);
    if (!name) continue;
    if (!extracted.some(found => found === name || found.includes(name) || name.includes(found))) {
      findings.push({kind: 'incomplete_reading', reason: 'exam_not_extracted', exam_name: declared, ...empty, details: {}});
    }
  }
  return findings;
}

export function generateFindings(extraction: Extraction): Finding[] {
  const findings: Finding[] = [];
  for (const exam of extraction.exams) {
    for (const parameter of exam.parameters) findings.push(...parameterFindings(exam, parameter, extraction));
    for (const note of exam.lab_notes) {
      findings.push({kind: 'lab_note', reason: 'lab_note', exam_name: exam.exam_name, parameter_name: null,
        page: exam.pages[0] ?? null, value_text: note, unit: null, reference_text: null, lab_flag: null, previous: null, details: {}});
    }
  }
  findings.push(...completenessFindings(extraction), ...hemogramFindings(extraction));
  // Stable sort keeps the report's own order inside each group.
  return findings.sort((a, b) => FINDING_ORDER.indexOf(a.kind) - FINDING_ORDER.indexOf(b.kind));
}
