-- Clinical considerations (docs/clinical-considerations.md): the extraction also codes glucose, HbA1c, insulin, HOMA-IR,
-- eGFR and the urine albumin/creatinine ratio, so the meaning cards (modules/clinical-considerations/curated-meanings.json)
-- can be matched by code.
update public.analysis_modules set active_version = 'lab-report/3-instructions/4', updated_at = now() where id = 'lab-report';
