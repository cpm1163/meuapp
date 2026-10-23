-- Clinical considerations, type 1 (docs/clinical-considerations.md): the AI groups the parameters of a ready analysis
-- by theme. It receives only exam names, parameter names and units, never values or the patient; the code writes
-- every sentence. One grouping per analysis, started by the app when the analysis is opened.
create table public.analysis_groupings (
  analysis_id uuid primary key references public.document_analyses(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  version text not null check (length(btrim(version)) between 1 and 64),
  model text check (model is null or length(model) <= 100),
  groups jsonb check (groups is null or jsonb_typeof(groups) = 'array'),
  failure_reason text check (failure_reason is null or failure_reason ~ '^[a-z_]{1,64}$'),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz check (completed_at is null or completed_at >= created_at),
  check ((status = 'processing') = (completed_at is null)),
  check ((status = 'ready') = (groups is not null)),
  check ((status = 'failed') = (failure_reason is not null))
);
create index analysis_groupings_requested_by_idx on public.analysis_groupings(requested_by, created_at desc);

alter table public.analysis_groupings enable row level security;
revoke all on public.analysis_groupings from public, anon, authenticated;
grant select on public.analysis_groupings to authenticated;
grant all on public.analysis_groupings to service_role;
-- Each user reads only the groupings of their own analyses. Writes come only from the functions below.
create policy analysis_groupings_read on public.analysis_groupings for select to authenticated
  using (requested_by = (select auth.uid()));

-- 1. The requester starts the grouping of one of their ready analyses. Returns the row only when the AI should be
-- called: an existing grouping (ready, failed or still running) raises grouping_exists, so the AI runs at most once
-- per analysis. Only a grouping abandoned in 'processing' (past the analysis timeout) is started again.
create function public.start_analysis_grouping(analysis_id uuid, version text)
returns public.analysis_groupings language plpgsql security definer set search_path = '' as $$
declare
  analysis public.document_analyses;
  grouping public.analysis_groupings;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not module_private.can_use_module('clinical-considerations') then
    raise exception 'module_not_available' using errcode = '42501';
  end if;
  select * into analysis from public.document_analyses a
    where a.id = start_analysis_grouping.analysis_id and a.requested_by = auth.uid();
  if not found or analysis.status <> 'ready' then raise exception 'analysis_not_available' using errcode = '22023'; end if;
  insert into public.analysis_groupings(analysis_id, requested_by, version)
    values (analysis.id, auth.uid(), start_analysis_grouping.version)
    on conflict on constraint analysis_groupings_pkey do nothing
    returning * into grouping;
  if found then return grouping; end if;
  update public.analysis_groupings g set created_at = now(), version = start_analysis_grouping.version
    where g.analysis_id = analysis.id and g.status = 'processing'
      and g.created_at < now() - module_private.analysis_timeout()
    returning * into grouping;
  if found then return grouping; end if;
  raise exception 'grouping_exists' using errcode = '23505';
end;
$$;

-- 2. The server records the result or the failure, with the tokens the AI call used.
create function public.complete_analysis_grouping(analysis_id uuid, groups jsonb, model text,
  input_tokens integer, output_tokens integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.analysis_groupings g set status = 'ready', groups = complete_analysis_grouping.groups,
      model = complete_analysis_grouping.model, input_tokens = complete_analysis_grouping.input_tokens,
      output_tokens = complete_analysis_grouping.output_tokens, completed_at = now()
    where g.analysis_id = complete_analysis_grouping.analysis_id and g.status = 'processing';
  if not found then raise exception 'grouping_not_available' using errcode = '22023'; end if;
end;
$$;

create function public.fail_analysis_grouping(analysis_id uuid, reason text, model text default null,
  input_tokens integer default null, output_tokens integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.analysis_groupings g set status = 'failed', failure_reason = fail_analysis_grouping.reason,
      model = fail_analysis_grouping.model, input_tokens = fail_analysis_grouping.input_tokens,
      output_tokens = fail_analysis_grouping.output_tokens, completed_at = now()
    where g.analysis_id = fail_analysis_grouping.analysis_id and g.status = 'processing';
  if not found then raise exception 'grouping_not_available' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.start_analysis_grouping(uuid, text),
  public.complete_analysis_grouping(uuid, jsonb, text, integer, integer),
  public.fail_analysis_grouping(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.start_analysis_grouping(uuid, text) to authenticated;
grant execute on function public.complete_analysis_grouping(uuid, jsonb, text, integer, integer),
  public.fail_analysis_grouping(uuid, text, text, integer, integer) to service_role;
