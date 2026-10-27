-- Double check of the AI reading (docs/compliance.md, decided 27/10/2026): after the analysis is recorded, the server
-- checks the transcribed values against the text of the PDF and rereads, page by page, the exams listed by the
-- laboratory that the first reading missed. The analysis stays visible while the check runs.

alter table public.document_analyses add column verification jsonb
  check (verification is null or jsonb_typeof(verification) = 'object');

-- Records the check. With an extraction (exams recovered by the reread), the extraction and its findings are replaced.
create function public.record_analysis_verification(analysis_id uuid, verification jsonb,
  extraction jsonb default null, findings jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.document_analyses a set verification = record_analysis_verification.verification,
      extraction = coalesce(record_analysis_verification.extraction, a.extraction),
      findings = coalesce(record_analysis_verification.findings, a.findings)
    where a.id = record_analysis_verification.analysis_id and a.status = 'ready';
  if not found then raise exception 'analysis_not_available' using errcode = '42501'; end if;
end;
$$;

-- Adds the tokens of the reread to the usage already recorded for the analysis.
create function public.add_analysis_usage(analysis_id uuid, input_tokens integer, output_tokens integer)
returns void language sql security definer set search_path = '' as $$
  update public.analysis_usage u set input_tokens = coalesce(u.input_tokens, 0) + coalesce(add_analysis_usage.input_tokens, 0),
      output_tokens = coalesce(u.output_tokens, 0) + coalesce(add_analysis_usage.output_tokens, 0)
    where u.analysis_id = add_analysis_usage.analysis_id;
$$;

revoke all on function public.record_analysis_verification(uuid, jsonb, jsonb, jsonb),
  public.add_analysis_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.record_analysis_verification(uuid, jsonb, jsonb, jsonb),
  public.add_analysis_usage(uuid, integer, integer) to service_role;
