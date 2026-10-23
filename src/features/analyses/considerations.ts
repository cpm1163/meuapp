import curatedJson from '../../../modules/clinical-considerations/curated-statements.json';
import { ageFromBirthDate, ageFromYears, checkStatements, compareWithStatements, type CuratedStatements }
  from '../../../modules/clinical-considerations/compare';
import { buildConsiderations, type ConsiderationsResult } from '../../../modules/clinical-considerations/considerations';
import type { Extraction } from '../../../modules/lab-report/findings';
import type { Report } from './report';

// Clinical considerations (level B, docs/clinical-considerations.md), built in the app from the stored extraction:
// no new AI call, so older analyses get them too. Shown only to accounts with the module granted and its terms accepted.
export const CONSIDERATIONS_MODULE = 'clinical-considerations';

const curated = curatedJson as unknown as CuratedStatements;
// A broken curated file shows no considerations rather than wrong ones.
const usable = checkStatements(curated).length === 0;

/** Age and sex as in the report (printed first, then the record); the birth date refines the age only when it agrees. */
export function considerationsFor(extraction: Extraction, report: Report, birthDate: string | null): ConsiderationsResult | null {
  if (!usable) return null;
  const byBirth = ageFromBirthDate(birthDate, report.collectedAt);
  const age = byBirth && Math.floor(byBirth.min / 12) === report.age ? byBirth : ageFromYears(report.age);
  return buildConsiderations(compareWithStatements(extraction, { sex: report.sex, age }, curated), curated);
}
