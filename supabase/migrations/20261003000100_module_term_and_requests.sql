-- FASE 02 decisions of 03/10/2026:
-- 1. Every grant lasts 30 calendar days from the moment it is issued; the admin no longer chooses.
-- 2. No contact info in the app: a user requests a module and the admin follows up.
-- 3. Analyses belong to the user who requested them (FASE 03); the draft terms change accordingly.

-- 1. Fixed 30-day term. Grants issued without a term get 30 days from their own issue date.
update public.module_grants set expires_at = granted_at + interval '30 days' where expires_at is null;
alter table public.module_grants alter column expires_at set not null;

create table public.module_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.analysis_modules(id) on delete restrict,
  requested_at timestamptz not null default now(),
  closed_at timestamptz check (closed_at is null or closed_at >= requested_at),
  closed_by uuid references auth.users(id) on delete set null,
  outcome text check (outcome in ('granted', 'handled')),
  check ((closed_at is null) = (outcome is null))
);
-- At most one pending request per user and module.
create unique index module_requests_one_open_idx on public.module_requests(user_id, module_id) where closed_at is null;
create index module_requests_pending_idx on public.module_requests(requested_at) where closed_at is null;

alter table public.module_requests enable row level security;
revoke all on public.module_requests from public, anon, authenticated;
grant select on public.module_requests to authenticated;
grant all on public.module_requests to service_role;
create policy requests_read_self on public.module_requests for select to authenticated
  using (user_id = (select auth.uid()));

drop function public.admin_grant_module(uuid, text, timestamptz, text);
create function public.admin_grant_module(user_id uuid, module_id text, note text default null)
returns public.module_grants language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); module public.analysis_modules; grant_row public.module_grants;
begin
  perform module_private.require_admin();
  if not exists(select 1 from auth.users u where u.id = admin_grant_module.user_id and u.deleted_at is null) then
    raise exception 'user_not_available' using errcode = '22023';
  end if;
  select * into module from public.analysis_modules m where m.id = admin_grant_module.module_id;
  if not found or module.status = 'disabled' then raise exception 'module_not_available' using errcode = '22023'; end if;
  -- An expired grant that was never revoked is closed so the new one can be issued.
  update public.module_grants g set revoked_at = now(), revoked_by = actor
    where g.user_id = admin_grant_module.user_id and g.module_id = module.id
      and g.revoked_at is null and g.expires_at <= now();
  insert into public.module_grants(user_id, module_id, granted_by, expires_at, note)
    values(admin_grant_module.user_id, module.id, actor, now() + interval '30 days', nullif(btrim(admin_grant_module.note), ''))
    returning * into grant_row;
  update public.module_requests r set closed_at = now(), closed_by = actor, outcome = 'granted'
    where r.user_id = admin_grant_module.user_id and r.module_id = module.id and r.closed_at is null;
  return grant_row;
end;
$$;

-- 2. Requests. A user asks for a module they do not have active; one pending request at a time.
create function public.request_module(module_id text)
returns public.module_requests language plpgsql security definer set search_path = '' as $$
declare request_row public.module_requests;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists(select 1 from public.analysis_modules m where m.id = request_module.module_id and m.status <> 'disabled') then
    raise exception 'module_not_available' using errcode = '22023';
  end if;
  if module_private.has_active_grant(request_module.module_id) then
    raise exception 'module_already_granted' using errcode = '22023';
  end if;
  insert into public.module_requests(user_id, module_id) values(auth.uid(), request_module.module_id)
    returning * into request_row;
  return request_row;
end;
$$;

-- Modules the caller can request (not disabled, no active grant), with the pending request date if any.
create function public.requestable_modules()
returns table(module_id text, name text, description text, module_status text, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.description, m.status, r.requested_at
    from public.analysis_modules m
    left join public.module_requests r on r.module_id = m.id and r.user_id = (select auth.uid()) and r.closed_at is null
    where (select auth.uid()) is not null and m.status <> 'disabled' and not module_private.has_active_grant(m.id)
    order by m.name;
$$;

create function public.admin_list_module_requests()
returns table(request_id uuid, user_id uuid, email text, module_id text, requested_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform module_private.require_admin();
  return query select r.id, r.user_id, u.email::text, r.module_id, r.requested_at
    from public.module_requests r join auth.users u on u.id = r.user_id
    where r.closed_at is null
    order by r.requested_at;
end;
$$;

-- Closes a request without granting (e.g. contact made, purchase declined).
create function public.admin_close_module_request(request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform module_private.require_admin();
  update public.module_requests r set closed_at = now(), closed_by = auth.uid(), outcome = 'handled'
    where r.id = admin_close_module_request.request_id and r.closed_at is null;
  if not found then raise exception 'request_not_available' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.admin_grant_module(uuid, text, text), public.request_module(text),
  public.requestable_modules(), public.admin_list_module_requests(), public.admin_close_module_request(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_grant_module(uuid, text, text), public.request_module(text),
  public.requestable_modules(), public.admin_list_module_requests(), public.admin_close_module_request(uuid)
  to authenticated;

-- 3. Draft terms text changed (analyses visible only to the requester): new version, new acceptance.
update public.analysis_modules set terms_version = '2026-10-03-draft' where id = 'lab-report';
