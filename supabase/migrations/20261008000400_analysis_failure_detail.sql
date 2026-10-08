-- FASE 03: the first real analysis (08/10/2026) failed with provider_error and no way to see why.
-- 1. failure_detail keeps the provider's own error (type and message), never document content. Written by the server.
-- 2. lab-report/3: missing texts are empty strings, so the schema fits the structured outputs limit of 16 union parameters.

alter table public.document_analyses add column failure_detail text
  check (failure_detail is null or length(failure_detail) <= 500);
alter table public.document_analyses add constraint document_analyses_detail_only_when_failed
  check (status = 'failed' or failure_detail is null);

update public.analysis_modules set active_version = 'lab-report/3-instructions/1', updated_at = now() where id = 'lab-report';
