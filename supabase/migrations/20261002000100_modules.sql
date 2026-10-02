-- FASE 02: admin role, module catalog, module grants and terms acceptance.
-- Clients never write these tables directly; every change goes through the functions below.
create schema if not exists module_private;
revoke all on schema module_private from public, anon, authenticated;
grant usage on schema module_private to authenticated;

-- The admin role is granted only server-side (migration or service role), never by a client.
create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text not null default 'server' check (length(btrim(created_by)) between 1 and 200)
);

create table public.analysis_modules (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 64),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  level text not null check (level in ('A', 'B')),
  skill_id text,
  active_version text,
  terms_version text not null check (length(btrim(terms_version)) between 1 and 64),
  status text not null default 'draft' check (status in ('draft', 'testing', 'active', 'disabled')),
  updated_at timestamptz not null default now()
);

create table public.module_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.analysis_modules(id) on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz check (expires_at is null or expires_at > granted_at),
  revoked_at timestamptz check (revoked_at is null or revoked_at >= granted_at),
  revoked_by uuid references auth.users(id) on delete set null,
  note text check (note is null or length(note) <= 500),
  check (revoked_by is null or revoked_at is not null)
);
-- At most one unrevoked grant per user and module. Expired grants are revoked before a new one is issued.
create unique index module_grants_one_open_idx on public.module_grants(user_id, module_id) where revoked_at is null;
create index module_grants_module_idx on public.module_grants(module_id, user_id);

create table public.module_terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.analysis_modules(id) on delete restrict,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, module_id, terms_version)
);

alter table public.app_admins enable row level security;
alter table public.analysis_modules enable row level security;
alter table public.module_grants enable row level security;
alter table public.module_terms_acceptances enable row level security;
revoke all on public.app_admins, public.analysis_modules, public.module_grants, public.module_terms_acceptances
  from public, anon, authenticated;
grant select on public.app_admins, public.analysis_modules, public.module_grants, public.module_terms_acceptances
  to authenticated;
grant all on public.app_admins, public.analysis_modules, public.module_grants, public.module_terms_acceptances
  to service_role;

create function module_private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

create function module_private.has_active_grant(module_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.module_grants g
    where g.module_id = has_active_grant.module_id and g.user_id = (select auth.uid())
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()));
$$;

-- Used by the analysis function (FASE 03): active module, active grant and current terms accepted.
create function module_private.can_use_module(module_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.analysis_modules m
    where m.id = can_use_module.module_id and m.status = 'active'
      and module_private.has_active_grant(m.id)
      and exists(select 1 from public.module_terms_acceptances t
        where t.user_id = (select auth.uid()) and t.module_id = m.id and t.terms_version = m.terms_version));
$$;
revoke all on function module_private.is_admin(), module_private.has_active_grant(text),
  module_private.can_use_module(text) from public, anon;
grant execute on function module_private.is_admin(), module_private.has_active_grant(text),
  module_private.can_use_module(text) to authenticated;

create policy app_admins_read_self on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));
-- Users see active modules and modules granted to them (even if expired or revoked); admins see all.
create policy modules_read on public.analysis_modules for select to authenticated
  using (status = 'active' or module_private.is_admin() or exists(
    select 1 from public.module_grants g where g.module_id = analysis_modules.id and g.user_id = (select auth.uid())));
create policy grants_read on public.module_grants for select to authenticated
  using (user_id = (select auth.uid()) or module_private.is_admin());
create policy terms_read_self on public.module_terms_acceptances for select to authenticated
  using (user_id = (select auth.uid()));

create function module_private.touch_module()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger analysis_modules_updated before update on public.analysis_modules
  for each row execute function module_private.touch_module();
revoke all on function module_private.touch_module() from public, anon, authenticated;

create function module_private.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not module_private.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
end;
$$;
revoke all on function module_private.require_admin() from public, anon, authenticated;

-- Exact e-mail lookup for admins only; never a user directory.
create function public.admin_find_user(search_email text)
returns table(user_id uuid, email text)
language plpgsql security definer set search_path = '' as $$
begin
  perform module_private.require_admin();
  return query select u.id, u.email::text from auth.users u
    where lower(u.email) = lower(btrim(admin_find_user.search_email)) and u.deleted_at is null;
end;
$$;

create function public.admin_grant_module(user_id uuid, module_id text, expires_at timestamptz default null, note text default null)
returns public.module_grants language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); module public.analysis_modules; grant_row public.module_grants;
begin
  perform module_private.require_admin();
  if not exists(select 1 from auth.users u where u.id = admin_grant_module.user_id and u.deleted_at is null) then
    raise exception 'user_not_available' using errcode = '22023';
  end if;
  select * into module from public.analysis_modules m where m.id = admin_grant_module.module_id;
  if not found or module.status = 'disabled' then raise exception 'module_not_available' using errcode = '22023'; end if;
  if admin_grant_module.expires_at is not null and admin_grant_module.expires_at <= now() then
    raise exception 'invalid_expiration' using errcode = '22023';
  end if;
  -- An expired grant that was never revoked is closed so the new one can be issued.
  update public.module_grants g set revoked_at = now(), revoked_by = actor
    where g.user_id = admin_grant_module.user_id and g.module_id = module.id
      and g.revoked_at is null and g.expires_at is not null and g.expires_at <= now();
  insert into public.module_grants(user_id, module_id, granted_by, expires_at, note)
    values(admin_grant_module.user_id, module.id, actor, admin_grant_module.expires_at, nullif(btrim(admin_grant_module.note), ''))
    returning * into grant_row;
  return grant_row;
end;
$$;

create function public.admin_revoke_module_grant(grant_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform module_private.require_admin();
  update public.module_grants g set revoked_at = now(), revoked_by = auth.uid()
    where g.id = admin_revoke_module_grant.grant_id and g.revoked_at is null;
  if not found then raise exception 'grant_not_available' using errcode = '22023'; end if;
end;
$$;

create function public.admin_list_module_grants(filter_module_id text default null)
returns table(grant_id uuid, user_id uuid, email text, module_id text, granted_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, active boolean, note text)
language plpgsql security definer set search_path = '' as $$
begin
  perform module_private.require_admin();
  return query select g.id, g.user_id, u.email::text, g.module_id, g.granted_at, g.expires_at, g.revoked_at,
      (g.revoked_at is null and (g.expires_at is null or g.expires_at > now())), g.note
    from public.module_grants g join auth.users u on u.id = g.user_id
    where admin_list_module_grants.filter_module_id is null or g.module_id = admin_list_module_grants.filter_module_id
    order by g.granted_at desc;
end;
$$;

create function public.admin_set_module_status(module_id text, status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform module_private.require_admin();
  if admin_set_module_status.status not in ('draft', 'testing', 'active', 'disabled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.analysis_modules m set status = admin_set_module_status.status where m.id = admin_set_module_status.module_id;
  if not found then raise exception 'module_not_available' using errcode = '22023'; end if;
end;
$$;

-- Records acceptance of the module's current terms. Requires an active grant.
create function public.accept_module_terms(module_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_terms text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not module_private.has_active_grant(accept_module_terms.module_id) then
    raise exception 'module_not_granted' using errcode = '42501';
  end if;
  select m.terms_version into current_terms from public.analysis_modules m where m.id = accept_module_terms.module_id;
  insert into public.module_terms_acceptances(user_id, module_id, terms_version)
    values(auth.uid(), accept_module_terms.module_id, current_terms)
    on conflict do nothing;
end;
$$;

-- "Meus módulos": modules granted to the caller, with access and terms state.
create function public.my_modules()
returns table(module_id text, name text, description text, module_status text, granted_at timestamptz,
  expires_at timestamptz, active boolean, terms_version text, terms_accepted boolean)
language sql stable security definer set search_path = '' as $$
  select distinct on (m.id) m.id, m.name, m.description, m.status, g.granted_at, g.expires_at,
      (g.revoked_at is null and (g.expires_at is null or g.expires_at > now())),
      m.terms_version,
      exists(select 1 from public.module_terms_acceptances t
        where t.user_id = g.user_id and t.module_id = m.id and t.terms_version = m.terms_version)
    from public.module_grants g join public.analysis_modules m on m.id = g.module_id
    where g.user_id = (select auth.uid())
    order by m.id, (g.revoked_at is null) desc, g.granted_at desc;
$$;

revoke all on function public.admin_find_user(text), public.admin_grant_module(uuid, text, timestamptz, text),
  public.admin_revoke_module_grant(uuid), public.admin_list_module_grants(text),
  public.admin_set_module_status(text, text), public.accept_module_terms(text), public.my_modules()
  from public, anon, authenticated;
grant execute on function public.admin_find_user(text), public.admin_grant_module(uuid, text, timestamptz, text),
  public.admin_revoke_module_grant(uuid), public.admin_list_module_grants(text),
  public.admin_set_module_status(text, text), public.accept_module_terms(text), public.my_modules()
  to authenticated;

-- First module. Stays in draft until the analysis itself exists (FASE 03).
insert into public.analysis_modules(id, name, description, level, terms_version, status) values
  ('lab-report', 'Análise de exames laboratoriais',
   'Lista os pontos de atenção de um laudo laboratorial, sem interpretação clínica.', 'A', '2026-10-02-draft', 'draft');
