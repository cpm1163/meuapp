-- Private helpers are not exposed by PostgREST. Never accept a caller-supplied actor ID.
create schema if not exists document_private;
revoke all on schema document_private from public, anon, authenticated;
grant usage on schema document_private to authenticated;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint check (size_bytes between 1 and 10485760),
  status text not null default 'pending_upload' check (status in
    ('pending_upload', 'uploaded', 'processing', 'ready', 'failed', 'deleting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path = owner_id::text || '/' || id::text || '/original')
);
create index documents_owner_id_idx on public.documents(owner_id);

create table public.document_shares (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'reader' check (permission = 'reader'),
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);
create index document_shares_user_id_idx on public.document_shares(user_id, document_id);

alter table public.documents enable row level security;
alter table public.document_shares enable row level security;
revoke all on public.documents, public.document_shares from public, anon, authenticated;
grant select on public.documents, public.document_shares to authenticated;
grant update (name) on public.documents to authenticated;
grant delete on public.document_shares to authenticated;
grant all on public.documents, public.document_shares to service_role;

create function document_private.owns_document(document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.documents d where d.id = document_id and d.owner_id = (select auth.uid()));
$$;
create function document_private.can_read_document(document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.documents d where d.id = document_id and (
    d.owner_id = (select auth.uid()) or (
      d.status in ('uploaded', 'processing', 'ready', 'failed') and exists (
        select 1 from public.document_shares s where s.document_id = d.id and s.user_id = (select auth.uid())
      )
    )
  ));
$$;
revoke all on function document_private.owns_document(uuid), document_private.can_read_document(uuid) from public, anon;
grant execute on function document_private.owns_document(uuid), document_private.can_read_document(uuid) to authenticated;

create policy documents_read on public.documents for select to authenticated
  using (document_private.can_read_document(id));
create policy documents_rename on public.documents for update to authenticated
  using (owner_id = (select auth.uid()) and status <> 'deleting')
  with check (owner_id = (select auth.uid()) and status <> 'deleting');
create policy shares_read on public.document_shares for select to authenticated
  using (user_id = (select auth.uid()) or document_private.owns_document(document_id));
create policy shares_revoke on public.document_shares for delete to authenticated
  using (document_private.owns_document(document_id));

create function document_private.touch_document()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger documents_updated before update on public.documents
  for each row execute function document_private.touch_document();

-- Also enforce this invariant for administrative writes, not just the public RPC.
create function document_private.check_share()
returns trigger language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  select * into doc from public.documents where id = new.document_id for share;
  if doc.owner_id = new.user_id then raise exception 'self_share_not_allowed' using errcode = '23514'; end if;
  if doc.status not in ('uploaded', 'processing', 'ready', 'failed') then
    raise exception 'document_not_available' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger document_shares_check before insert or update on public.document_shares
  for each row execute function document_private.check_share();
revoke all on function document_private.touch_document(), document_private.check_share() from public, anon, authenticated;

create function public.create_document(document_name text, content_type text)
returns public.documents language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); doc_id uuid := gen_random_uuid(); doc public.documents;
begin
  if actor is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if content_type is null or content_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'unsupported_file_type' using errcode = '22023';
  end if;
  insert into public.documents(id, owner_id, name, storage_path, mime_type)
    values(doc_id, actor, btrim(document_name), actor::text || '/' || doc_id::text || '/original', content_type)
    returning * into doc;
  return doc;
end;
$$;

create function public.share_document(document_id uuid, recipient_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.documents; recipient uuid;
begin
  select * into doc from public.documents where id = document_id and owner_id = auth.uid() for update;
  if not found then raise exception 'document_not_available' using errcode = '42501'; end if;
  if doc.status not in ('uploaded','processing','ready','failed') then
    raise exception 'document_not_available' using errcode = '22023';
  end if;
  select id into recipient from auth.users where lower(email) = lower(btrim(recipient_email)) and deleted_at is null;
  if recipient is null or recipient = doc.owner_id then
    raise exception 'recipient_not_available' using errcode = '22023';
  end if;
  insert into public.document_shares(document_id,user_id) values(doc.id,recipient);
end;
$$;
revoke all on function public.create_document(text,text), public.share_document(uuid,text) from public, anon, authenticated;
grant execute on function public.create_document(text,text), public.share_document(uuid,text) to authenticated;

-- Recipient emails are visible only to this document's owner, never a user directory.
create function public.list_document_shares(document_id uuid)
returns table(user_id uuid, email text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not document_private.owns_document(document_id) then
    raise exception 'document_not_available' using errcode = '42501';
  end if;
  return query select s.user_id, u.email::text, s.created_at
    from public.document_shares s join auth.users u on u.id = s.user_id
    where s.document_id = list_document_shares.document_id order by s.created_at;
end;
$$;
revoke all on function public.list_document_shares(uuid) from public, anon, authenticated;
grant execute on function public.list_document_shares(uuid) to authenticated;
