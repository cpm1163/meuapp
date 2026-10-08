-- FASE 03: first real test of the lab-report analysis (08/10/2026).
-- 'testing' makes the module usable only by accounts with an active grant and accepted terms.
update public.analysis_modules set status = 'testing', updated_at = now() where id = 'lab-report';
