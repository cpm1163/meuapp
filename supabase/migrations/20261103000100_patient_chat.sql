-- Patient chat, test only (docs/knowledge-base.md, decided 03/11/2026): questions answered only from a fictitious KB.
-- This migration may reach the cloud on the next db push, and stays inert there: the module is 'disabled', because
-- requestable_modules and request_module only hide that status, and no KB data comes with it.
-- Only the local script tests/patient-chat.seed.cjs moves the module to 'testing' and loads the KB.
insert into public.analysis_modules(id, name, description, level, terms_version, status) values
  ('patient-chat', 'Chat de perguntas (teste)',
   'Responde a perguntas só por uma base fictícia, para testar os guardrails. Não usar com pacientes.',
   'A', '2026-11-03-draft', 'disabled');

-- Read only by the server, after the authorization: no policy and no grant for the app.
create table public.patient_chat_kb_items (
  item integer primary key check (item > 0),
  question text not null check (length(btrim(question)) > 0),
  answer text not null check (length(btrim(answer)) > 0)
);
alter table public.patient_chat_kb_items enable row level security;
revoke all on public.patient_chat_kb_items from public, anon, authenticated;
grant all on public.patient_chat_kb_items to service_role;

-- Only numbers, never the question. Separate from analysis_usage, which counts toward the daily limit of analyses.
create table public.patient_chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  model text check (model is null or length(model) <= 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0)
);
create index patient_chat_usage_user_created_idx on public.patient_chat_usage(user_id, created_at desc);
alter table public.patient_chat_usage enable row level security;
revoke all on public.patient_chat_usage from public, anon, authenticated;
grant select on public.patient_chat_usage to authenticated;
grant all on public.patient_chat_usage to service_role;
create policy patient_chat_usage_read on public.patient_chat_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Provisional value. Changing it takes a small migration.
create function module_private.patient_chat_daily_limit()
returns integer language sql immutable set search_path = '' as $$ select 60 $$;
revoke all on function module_private.patient_chat_daily_limit() from public, anon, authenticated;

-- Authorizes and reserves one question, before the AI is called. Failed questions count too: they were billed.
create function public.start_patient_chat()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); used integer; usage_id uuid;
begin
  if actor is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not module_private.can_use_module('patient-chat') then
    raise exception 'module_not_available' using errcode = '42501';
  end if;
  if not exists(select 1 from public.patient_chat_kb_items) then
    raise exception 'kb_unavailable' using errcode = '55000';
  end if;
  -- One start at a time per user, so two simultaneous requests cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('patient_chat_limit:' || actor::text, 0));
  select count(*) into used from public.patient_chat_usage u
    where u.user_id = actor and u.created_at > now() - interval '24 hours';
  if used >= module_private.patient_chat_daily_limit() then
    raise exception 'chat_limit_reached' using errcode = '54000';
  end if;
  insert into public.patient_chat_usage(user_id) values(actor) returning id into usage_id;
  return usage_id;
end;
$$;
revoke all on function public.start_patient_chat() from public, anon;
grant execute on function public.start_patient_chat() to authenticated;
