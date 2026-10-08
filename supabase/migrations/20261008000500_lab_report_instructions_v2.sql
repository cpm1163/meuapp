-- FASE 03: structured outputs rejected the schema ("The compiled grammar is too large", second real test, 08/10/2026).
-- The schema now goes in the instructions and the answer is validated in code (modules/lab-report/request.ts).
update public.analysis_modules set active_version = 'lab-report/3-instructions/2', updated_at = now() where id = 'lab-report';
