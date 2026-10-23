-- Clinical considerations (docs/clinical-considerations.md): the extraction also codes the lipid profile and 25-OH vitamin D,
-- so the curated statements (modules/clinical-considerations/curated-statements.json) can be matched by code.
update public.analysis_modules set active_version = 'lab-report/3-instructions/3', updated_at = now() where id = 'lab-report';
