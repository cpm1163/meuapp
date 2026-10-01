insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('documents','documents',false,10485760,array['application/pdf','image/jpeg','image/png']);

-- Lock the reservation while Storage creates its metadata. Deletion waits for in-flight inserts.
create function document_private.can_upload_document(object_path text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  select * into doc from public.documents where storage_path = object_path for share;
  return found and doc.owner_id = auth.uid() and doc.status = 'pending_upload';
end;
$$;
revoke all on function document_private.can_upload_document(text) from public, anon;
grant execute on function document_private.can_upload_document(text) to authenticated;

create policy document_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and document_private.can_upload_document(name));
create policy document_files_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name
      and (d.status <> 'deleting' or d.owner_id = (select auth.uid()))
  ));
-- Delete is a two-step operation: first hide the document, then remove the object through Storage.
create policy document_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name
      and d.owner_id = (select auth.uid()) and d.status = 'deleting'
  ));
-- No UPDATE policy: replacing/upserting an existing object is forbidden.

create function public.complete_document_upload(document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.documents; meta jsonb; actual_size bigint;
begin
  select * into doc from public.documents where id = document_id and owner_id = auth.uid() for update;
  if not found then raise exception 'document_not_available' using errcode = '42501'; end if;
  if doc.status = 'uploaded' then return; end if;
  if doc.status <> 'pending_upload' then raise exception 'invalid_document_state' using errcode = '22023'; end if;
  select metadata into meta from storage.objects where bucket_id = 'documents' and name = doc.storage_path;
  actual_size := (meta->>'size')::bigint;
  if meta is null or actual_size is null or actual_size not between 1 and 10485760
     or (meta->>'mimetype') is distinct from doc.mime_type then
    raise exception 'invalid_uploaded_file' using errcode = '22023';
  end if;
  update public.documents set status = 'uploaded', size_bytes = actual_size where id = doc.id;
end;
$$;

create function public.begin_document_delete(document_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  select * into doc from public.documents where id = document_id and owner_id = auth.uid() for update;
  if not found then raise exception 'document_not_available' using errcode = '42501'; end if;
  update public.documents set status = 'deleting' where id = doc.id;
  delete from public.document_shares s where s.document_id = doc.id;
  return doc.storage_path;
end;
$$;
create function public.finish_document_delete(document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  select * into doc from public.documents where id = document_id and owner_id = auth.uid() for update;
  if not found then raise exception 'document_not_available' using errcode = '42501'; end if;
  if doc.status <> 'deleting' or exists (
    select 1 from storage.objects where bucket_id = 'documents' and name = doc.storage_path
  ) then raise exception 'file_removal_required' using errcode = '22023'; end if;
  delete from public.documents where id = doc.id;
end;
$$;
revoke all on function public.complete_document_upload(uuid), public.begin_document_delete(uuid), public.finish_document_delete(uuid) from public, anon, authenticated;
grant execute on function public.complete_document_upload(uuid), public.begin_document_delete(uuid), public.finish_document_delete(uuid) to authenticated;

-- Existing broad Storage policies must not accidentally grant access to this new bucket.
create policy document_files_anon_boundary on storage.objects as restrictive for all to anon
  using (bucket_id <> 'documents') with check (bucket_id <> 'documents');
create policy document_files_read_boundary on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'documents' or exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name
  ));
create policy document_files_insert_boundary on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'documents' or document_private.can_upload_document(name));
create policy document_files_update_boundary on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'documents') with check (bucket_id <> 'documents');
create policy document_files_delete_boundary on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'documents' or exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name
      and d.owner_id = (select auth.uid()) and d.status = 'deleting'
  ));
