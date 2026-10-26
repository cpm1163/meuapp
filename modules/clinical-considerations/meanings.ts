// Meaning cards of the clinical considerations (curated-meanings.json, docs/clinical-considerations.md, "Formato da
// saída"). Deterministic: the code decides which cards hold for the report, from the coded values and the
// classification against the printed reference; the AI only writes the text from the selected cards.
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

import {classifyParameter, normalizeUnit, type Extraction, type Parameter, type ParameterStatus} from '../lab-report/findings.ts';
import {ageFromBirthDate, ageFromYears, type AgeMonths, type StatementSex} from './compare.ts';

export type MeaningRange = {min?: number; min_inclusive?: boolean; max?: number; max_inclusive?: boolean; unit: string};
export type MeaningPremise = {parameter_code: string; range?: MeaningRange; status?: 'above' | 'below' | 'within'};
export type Meaning = {
  id: string; source: string; theme: string;
  population: {age_min_months: number | null; age_max_months: number | null; sex: StatementSex};
  premises: MeaningPremise[]; meaning: string;
  page: {pdf?: number; printed?: string; section?: string}; excerpt: string;
  caveats?: string[]; curation_notes?: string;
};
export type MeaningSource = {id: string; short: string; kind: 'guideline' | 'review'; reference: string; url: string};
export type CuratedMeanings = {version: number; curated_on: string; validation: string; notes: string[];
  sources: MeaningSource[]; meanings: Meaning[]};

export type Patient = {sex: 'female' | 'male' | null; age: AgeMonths | null};
/** A parameter named in the input of the AI: name and situation only, never the value. */
export type NamedParameter = {name: string; exam_name: string; status: ParameterStatus};
export type SelectedMeaning = {id: string; theme: string; meaning: string; source_id: string; caveats: string[];
  parameters: NamedParameter[]};
export type Selection = {
  selected: SelectedMeaning[];
  /** Outside the printed reference and not covered by any selected card: they go to the AI block without source. */
  unexplained: NamedParameter[];
};

const OUTSIDE = new Set<ParameterStatus>(['above', 'below', 'not_expected']);

// Category names are not values: "G2", "A1", "G3a" (KDIGO) and "tipo 2" (diabetes) may appear in the text.
const CATEGORY_LABELS = /\b[A-Z]\d[ab]?\b|\btipo [12]\b/gi;
/** True when the text has a number other than a category name (the considerations carry no values). */
export const hasNumbers = (text: string) => /\d/.test(text.replace(CATEGORY_LABELS, ''));
// Printed variants of the units used by the cards ("mg/g de creatinina" is the mg/g of the albumin/creatinine ratio).
const UNIT_ALIASES: Record<string, string> = {'mg/gdecreatinina': 'mg/g', 'mg/gcreatinina': 'mg/g'};
const unitKey = (unit: string) => {
  const key = normalizeUnit(unit) ?? '';
  return UNIT_ALIASES[key] ?? key;
};

function inRange(value: number, range: MeaningRange): boolean {
  if (range.min !== undefined && (range.min_inclusive ? value < range.min : value <= range.min)) return false;
  if (range.max !== undefined && (range.max_inclusive ? value > range.max : value >= range.max)) return false;
  return true;
}

const ageContained = (age: AgeMonths, meaning: Meaning) =>
  age.min >= (meaning.population.age_min_months ?? 0) && age.max <= (meaning.population.age_max_months ?? Infinity);

/**
 * The cards whose premises all hold, and the parameters outside the reference that no selected card explains.
 * Without age no card is selected (every card has a population); the parameters then all go to the AI block.
 */
export function selectMeanings(extraction: Extraction, patient: Patient, curated: CuratedMeanings): Selection {
  const years = patient.age ? Math.floor(patient.age.min / 12) : null;
  // First coded parameter of each code, as in the hemogram checks.
  const byCode = new Map<string, {key: string; exam_name: string; parameter: Parameter; status: ParameterStatus}>();
  const outside: (NamedParameter & {key: string})[] = [];
  for (const [examIndex, exam] of extraction.exams.entries()) for (const [index, parameter] of exam.parameters.entries()) {
    const key = `${examIndex}.${index}`;
    const {status} = classifyParameter(parameter, patient.sex, years);
    if (parameter.code && !byCode.has(parameter.code)) byCode.set(parameter.code, {key, exam_name: exam.exam_name, parameter, status});
    if (OUTSIDE.has(status)) outside.push({key, name: parameter.name, exam_name: exam.exam_name, status});
  }

  const selected: SelectedMeaning[] = [];
  const explained = new Set<string>();
  for (const meaning of curated.meanings) {
    if (!patient.age || !ageContained(patient.age, meaning)) continue;
    if (meaning.population.sex !== 'both' && meaning.population.sex !== patient.sex) continue;
    const matched = meaning.premises.map(premise => {
      const found = byCode.get(premise.parameter_code);
      if (!found) return null;
      if (premise.status && found.status !== premise.status) return null;
      if (premise.range) {
        const value = found.parameter.value_number;
        if (value === null || unitKey(found.parameter.unit) !== unitKey(premise.range.unit)) return null;
        if (!inRange(value, premise.range)) return null;
      }
      return found;
    });
    if (matched.some(item => item === null)) continue;
    const found = [...new Set(matched as NonNullable<typeof matched[number]>[])];
    found.forEach(item => explained.add(item.key));
    selected.push({id: meaning.id, theme: meaning.theme, meaning: meaning.meaning, source_id: meaning.source,
      caveats: meaning.caveats ?? [],
      parameters: found.map(item => ({name: item.parameter.name, exam_name: item.exam_name, status: item.status}))});
  }

  const unexplained = outside.filter(item => !explained.has(item.key))
    .map(({name, exam_name, status}) => ({name, exam_name, status}));
  return {selected, unexplained};
}

/**
 * Sex and age for the cards, as in the report screen: printed on the report first, then the patient record. The birth
 * date refines the age in months only when it agrees with the printed age.
 */
export function patientFor(extraction: Extraction, record: {sex: 'female' | 'male' | null; birth_date: string | null} | null): Patient {
  const sex = extraction.patient_sex ?? record?.sex ?? null;
  const byBirth = ageFromBirthDate(record?.birth_date ?? null, extraction.collected_at || null);
  const printed = ageFromYears(extraction.patient_age_years);
  if (!printed) return {sex, age: byBirth};
  return {sex, age: byBirth && Math.floor(byBirth.min / 12) === extraction.patient_age_years ? byBirth : printed};
}

/** Structural problems in the meanings file; an empty list means it can be used. */
export function checkMeanings(curated: CuratedMeanings): string[] {
  const errors: string[] = [];
  const sources = new Set(curated.sources.map(item => item.id));
  for (const source of curated.sources) {
    if (!source.short?.trim() || !source.reference?.trim()) errors.push(`source ${source.id}: missing short name or reference`);
    if (source.kind !== 'guideline' && source.kind !== 'review') errors.push(`source ${source.id}: unknown kind`);
  }
  const ids = new Set<string>();
  for (const meaning of curated.meanings) {
    const at = `meaning ${meaning.id}`;
    if (ids.has(meaning.id)) errors.push(`${at}: duplicate id`);
    ids.add(meaning.id);
    if (!sources.has(meaning.source)) errors.push(`${at}: unknown source ${meaning.source}`);
    if (!meaning.theme?.trim() || !meaning.meaning?.trim()) errors.push(`${at}: missing theme or meaning`);
    if (!meaning.excerpt?.trim() || !meaning.page) errors.push(`${at}: missing excerpt or page`);
    // The text goes to the AI and to the doctor without numbers (decided 26/10/2026).
    if (hasNumbers(meaning.meaning)) errors.push(`${at}: meaning has numbers`);
    const {age_min_months: min, age_max_months: max} = meaning.population;
    if (min !== null && max !== null && min >= max) errors.push(`${at}: empty age range`);
    if (meaning.premises.length === 0) errors.push(`${at}: no premises`);
    for (const premise of meaning.premises) {
      if (!premise.range && !premise.status) errors.push(`${at}: premise ${premise.parameter_code} without range or status`);
      if (premise.range && premise.range.min === undefined && premise.range.max === undefined) {
        errors.push(`${at}: premise ${premise.parameter_code} with empty range`);
      }
    }
  }
  return errors;
}
