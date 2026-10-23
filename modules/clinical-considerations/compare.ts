// Compares coded lab values with the curated statements (curated-statements.json, docs/clinical-considerations.md).
// Deterministic: the AI never reads a cutoff. Whenever age, sex, fasting or unit do not allow a safe match,
// the parameter is skipped with a reason instead of being classified.
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

import {normalizeUnit, type Extraction} from '../lab-report/findings.ts';

export type StatementSex = 'female' | 'male' | 'both';
export type StatementFasting = 'fasting' | 'non_fasting' | 'any';
export type StatementClass = {
  label: string; min?: number; min_inclusive?: boolean; max?: number; max_inclusive?: boolean;
};
export type Statement = {
  id: string; source: string; parameter_code: string; parameter: string; unit: string; criterion?: string;
  population: {age_min_months: number | null; age_max_months: number | null; sex: StatementSex};
  fasting: StatementFasting; classes: StatementClass[];
  page: {pdf: number; printed: string}; excerpt: string; curation_notes?: string;
};
export type Source = {id: string; title: string; url: string};
export type CuratedStatements = {version: number; validation: string; sources: Source[]; statements: Statement[]};

/** Age as an interval in months, [min, max): an age in whole years covers 12 months. */
export type AgeMonths = {min: number; max: number};
export type Patient = {sex: 'female' | 'male' | null; age: AgeMonths | null};
export type FastingState = 'fasting' | 'non_fasting' | null;

export type SkipReason = 'no_value' | 'sex_unknown' | 'age_unknown' | 'age_ambiguous' | 'no_statement'
  | 'fasting_unknown' | 'unit_mismatch';
export type Comparison = {
  parameter_code: string; parameter_name: string; exam_name: string; page: number | null;
  value_number: number | null; unit: string;
} & (
  | {status: 'classified' | 'outside_classes'; statement_id: string; source_id: string; criterion: string | null;
    compared_value: number; compared_unit: string; class_label: string | null}
  | {status: 'skipped'; reason: SkipReason}
);

export function ageFromYears(years: number | null): AgeMonths | null {
  if (years === null || !Number.isInteger(years) || years < 0) return null;
  return {min: years * 12, max: years * 12 + 12};
}

/** Completed months between birth and collection (YYYY-MM-DD), or null if either date is missing or invalid. */
export function ageFromBirthDate(birthDate: string | null, collectedAt: string | null): AgeMonths | null {
  const birth = parseDate(birthDate);
  const collected = parseDate(collectedAt);
  if (!birth || !collected) return null;
  let months = (collected.year - birth.year) * 12 + (collected.month - birth.month);
  if (collected.day < birth.day) months -= 1;
  return months < 0 ? null : {min: months, max: months + 1};
}

function parseDate(value: string | null): {year: number; month: number; day: number} | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? {year: Number(match[1]), month: Number(match[2]), day: Number(match[3])} : null;
}

/**
 * Fasting state from what the laboratory printed; the AI only transcribes it.
 * "Fasting" needs 12 h, as defined by SBC 2025 ("jejum de 12 horas"); a shorter or unclear fast stays unknown.
 */
export function fastingState(text: string, hours: number | null): FastingState {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const saysNonFasting = /\bsem jejum\b/.test(normalized);
  if (saysNonFasting) return hours === null || hours === 0 ? 'non_fasting' : null;
  return hours !== null && hours >= 12 ? 'fasting' : null;
}

/** Factors to the statement's unit, keyed by normalized unit; only conversions stated in the sources. */
const CONVERSIONS: Record<string, Record<string, number>> = {
  'mg/dl': {'mg/dl': 1},
  'g/l': {'g/l': 1, 'g/dL': 10},
  // SBP 2024, Quadro 3: 1 ng/mL = 2,5 nmol/L.
  'ng/ml': {'ng/ml': 1, 'nmol/l': 0.4},
};

function convert(value: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const factor = from ? CONVERSIONS[normalizeUnit(toUnit) ?? '']?.[from] : undefined;
  return factor === undefined ? null : Math.round(value * factor * 1e6) / 1e6;
}

function inClass(value: number, item: StatementClass): boolean {
  if (item.min !== undefined && (item.min_inclusive ? value < item.min : value <= item.min)) return false;
  if (item.max !== undefined && (item.max_inclusive ? value > item.max : value >= item.max)) return false;
  return true;
}

const ageContained = (age: AgeMonths, statement: Statement) =>
  age.min >= (statement.population.age_min_months ?? 0) && age.max <= (statement.population.age_max_months ?? Infinity);
const ageOverlaps = (age: AgeMonths, statement: Statement) =>
  age.max > (statement.population.age_min_months ?? 0) && age.min < (statement.population.age_max_months ?? Infinity);

/** Statements that apply to the patient, or the first reason that rules them all out. */
function applicable(candidates: Statement[], patient: Patient, fasting: FastingState): Statement[] | SkipReason {
  if (!patient.age) return 'age_unknown';
  const age = patient.age;
  const byAge = candidates.filter(item => ageContained(age, item));
  if (byAge.length === 0) return candidates.some(item => ageOverlaps(age, item)) ? 'age_ambiguous' : 'no_statement';
  const bySex = byAge.filter(item => item.population.sex === 'both' || item.population.sex === patient.sex);
  if (bySex.length === 0) return patient.sex === null ? 'sex_unknown' : 'no_statement';
  const byFasting = bySex.filter(item => item.fasting === 'any' || item.fasting === fasting);
  if (byFasting.length === 0) return fasting === null ? 'fasting_unknown' : 'no_statement';
  return byFasting;
}

export function compareWithStatements(extraction: Extraction, patient: Patient, curated: CuratedStatements): Comparison[] {
  const byCode = new Map<string, Statement[]>();
  for (const statement of curated.statements) {
    byCode.set(statement.parameter_code, [...(byCode.get(statement.parameter_code) ?? []), statement]);
  }
  const comparisons: Comparison[] = [];
  for (const exam of extraction.exams) for (const parameter of exam.parameters) {
    const fasting = fastingState(exam.fasting_text, exam.fasting_hours);
    const candidates = parameter.code ? byCode.get(parameter.code) : undefined;
    if (!parameter.code || !candidates) continue;
    const base = {parameter_code: parameter.code, parameter_name: parameter.name, exam_name: exam.exam_name,
      page: parameter.page, value_number: parameter.value_number, unit: parameter.unit};
    const value = parameter.value_number;
    if (value === null) {
      comparisons.push({...base, status: 'skipped', reason: 'no_value'});
      continue;
    }
    const statements = applicable(candidates, patient, fasting);
    if (typeof statements === 'string') {
      comparisons.push({...base, status: 'skipped', reason: statements});
      continue;
    }
    for (const statement of statements) {
      const compared = convert(value, parameter.unit, statement.unit);
      if (compared === null) {
        comparisons.push({...base, status: 'skipped', reason: 'unit_mismatch'});
        continue;
      }
      const match = statement.classes.find(item => inClass(compared, item));
      comparisons.push({...base, status: match ? 'classified' : 'outside_classes', statement_id: statement.id,
        source_id: statement.source, criterion: statement.criterion ?? null, compared_value: compared,
        compared_unit: statement.unit, class_label: match?.label ?? null});
    }
  }
  return comparisons;
}

/** Structural problems in the curated file; an empty list means it can be used. */
export function checkStatements(curated: CuratedStatements): string[] {
  const errors: string[] = [];
  const sources = new Set(curated.sources.map(item => item.id));
  const ids = new Set<string>();
  for (const statement of curated.statements) {
    const at = `statement ${statement.id}`;
    if (ids.has(statement.id)) errors.push(`${at}: duplicate id`);
    ids.add(statement.id);
    if (!sources.has(statement.source)) errors.push(`${at}: unknown source ${statement.source}`);
    if (!CONVERSIONS[normalizeUnit(statement.unit) ?? '']) errors.push(`${at}: unit ${statement.unit} has no conversions`);
    const {age_min_months: min, age_max_months: max} = statement.population;
    if (min !== null && max !== null && min >= max) errors.push(`${at}: empty age range`);
    if (!statement.excerpt.trim() || !statement.page) errors.push(`${at}: missing excerpt or page`);
    if (statement.classes.length === 0) errors.push(`${at}: no classes`);
    // Overlapping classes would make the result depend on their order.
    for (const [index, item] of statement.classes.entries()) {
      for (const other of statement.classes.slice(index + 1)) {
        if (classesOverlap(item, other)) errors.push(`${at}: classes ${item.label} and ${other.label} overlap`);
      }
    }
  }
  return errors;
}

function classesOverlap(a: StatementClass, b: StatementClass): boolean {
  const aboveMin = (item: StatementClass, other: StatementClass) => item.max === undefined || other.min === undefined
    || item.max > other.min || (item.max === other.min && !!item.max_inclusive && !!other.min_inclusive);
  return aboveMin(a, b) && aboveMin(b, a);
}
