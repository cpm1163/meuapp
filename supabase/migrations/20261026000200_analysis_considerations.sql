-- Clinical considerations as a draft (docs/clinical-considerations.md, 26/10/2026): the AI writes the meaning of the
-- results from the meaning cards selected in code, the code checks every sentence, and the doctor edits and approves
-- the text. The AI receives only age, sex, parameter names, their situation and the cards, never values or the patient.
-- One draft per analysis, started by the doctor with a button; the PDF carries only the approved text.
create table public.analysis_considerations (
  analysis_id uuid primary key references public.document_analyses(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  version text not null check (length(btrim(version)) between 1 and 64),
  model text check (model is null or length(model) <= 100),
  -- The checked AI draft, kept unchanged for audit; the doctor's text goes to approved_text.
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  failure_reason text check (failure_reason is null or failure_reason ~ '^[a-z_]{1,64}$'),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  approved_text text check (approved_text is null or length(approved_text) between 1 and 20000),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz check (completed_at is null or completed_at >= created_at),
  check ((status = 'processing') = (completed_at is null)),
  check ((status = 'ready') = (draft is not null)),
  check ((status = 'failed') = (failure_reason is not null)),
  check ((approved_text is null) = (approved_at is null)),
  check (approved_text is null or status = 'ready')
);
create index analysis_considerations_requested_by_idx on public.analysis_considerations(requested_by, created_at desc);

alter table public.analysis_considerations enable row level security;
revoke all on public.analysis_considerations from public, anon, authenticated;
grant select on public.analysis_considerations to authenticated;
grant all on public.analysis_considerations to service_role;
-- Each user reads only the considerations of their own analyses. Writes come only from the functions below.
create policy analysis_considerations_read on public.analysis_considerations for select to authenticated
  using (requested_by = (select auth.uid()));

-- 1. The requester starts the draft of one of their ready analyses. Returns the row only when the AI should be called:
-- an existing draft (ready, failed or still running) raises considerations_exist, so the AI runs at most once per
-- analysis. Only a draft abandoned in 'processing' (past the analysis timeout) is started again.
create function public.start_analysis_considerations(analysis_id uuid, version text)
returns public.analysis_considerations language plpgsql security definer set search_path = '' as $$
declare
  analysis public.document_analyses;
  considerations public.analysis_considerations;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not module_private.can_use_module('clinical-considerations') then
    raise exception 'module_not_available' using errcode = '42501';
  end if;
  select * into analysis from public.document_analyses a
    where a.id = start_analysis_considerations.analysis_id and a.requested_by = auth.uid();
  if not found or analysis.status <> 'ready' then raise exception 'analysis_not_available' using errcode = '22023'; end if;
  insert into public.analysis_considerations(analysis_id, requested_by, version)
    values (analysis.id, auth.uid(), start_analysis_considerations.version)
    on conflict on constraint analysis_considerations_pkey do nothing
    returning * into considerations;
  if found then return considerations; end if;
  update public.analysis_considerations c set created_at = now(), version = start_analysis_considerations.version
    where c.analysis_id = analysis.id and c.status = 'processing'
      and c.created_at < now() - module_private.analysis_timeout()
    returning * into considerations;
  if found then return considerations; end if;
  raise exception 'considerations_exist' using errcode = '23505';
end;
$$;

-- 2. The server records the checked draft or the failure, with the tokens the AI call used.
create function public.complete_analysis_considerations(analysis_id uuid, draft jsonb, model text,
  input_tokens integer, output_tokens integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.analysis_considerations c set status = 'ready', draft = complete_analysis_considerations.draft,
      model = complete_analysis_considerations.model, input_tokens = complete_analysis_considerations.input_tokens,
      output_tokens = complete_analysis_considerations.output_tokens, completed_at = now()
    where c.analysis_id = complete_analysis_considerations.analysis_id and c.status = 'processing';
  if not found then raise exception 'considerations_not_available' using errcode = '22023'; end if;
end;
$$;

create function public.fail_analysis_considerations(analysis_id uuid, reason text, model text default null,
  input_tokens integer default null, output_tokens integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.analysis_considerations c set status = 'failed', failure_reason = fail_analysis_considerations.reason,
      model = fail_analysis_considerations.model, input_tokens = fail_analysis_considerations.input_tokens,
      output_tokens = fail_analysis_considerations.output_tokens, completed_at = now()
    where c.analysis_id = fail_analysis_considerations.analysis_id and c.status = 'processing';
  if not found then raise exception 'considerations_not_available' using errcode = '22023'; end if;
end;
$$;

-- 3. The doctor approves the text, edited or not; approving again replaces it. Only the approved text goes to the PDF.
create function public.approve_analysis_considerations(analysis_id uuid, text text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  approved timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not module_private.can_use_module('clinical-considerations') then
    raise exception 'module_not_available' using errcode = '42501';
  end if;
  if approve_analysis_considerations.text is null or length(btrim(approve_analysis_considerations.text)) = 0
    or length(approve_analysis_considerations.text) > 20000 then
    raise exception 'invalid_text' using errcode = '22023';
  end if;
  update public.analysis_considerations c set approved_text = btrim(approve_analysis_considerations.text),
      approved_at = approved
    where c.analysis_id = approve_analysis_considerations.analysis_id and c.requested_by = auth.uid()
      and c.status = 'ready';
  if not found then raise exception 'considerations_not_available' using errcode = '22023'; end if;
  return approved;
end;
$$;

revoke all on function public.start_analysis_considerations(uuid, text),
  public.complete_analysis_considerations(uuid, jsonb, text, integer, integer),
  public.fail_analysis_considerations(uuid, text, text, integer, integer),
  public.approve_analysis_considerations(uuid, text) from public, anon, authenticated;
grant execute on function public.start_analysis_considerations(uuid, text),
  public.approve_analysis_considerations(uuid, text) to authenticated;
grant execute on function public.complete_analysis_considerations(uuid, jsonb, text, integer, integer),
  public.fail_analysis_considerations(uuid, text, text, integer, integer) to service_role;
