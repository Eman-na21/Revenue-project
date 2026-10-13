-- =====================================================================
-- 004_receipt_photos.sql
-- Receipt photos: private storage bucket + rules + a column to remember the photo.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: it only ADDS things. Nothing is deleted or changed.
-- =====================================================================

-- 1. Where each record remembers its photo
alter table public.collections add column if not exists receipt_path text;

-- A photo path must start with the SAME agent's id (an agent cannot point at someone else's photo)
do $$ begin
  alter table public.collections
    add constraint collections_receipt_path_owner
    check (receipt_path is null or receipt_path like agent_id::text || '/%');
exception when duplicate_object then null; end $$;

-- 2. The private bucket (not public, max 5 MB per photo, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Rules: an agent may ADD photos only into his own folder (folder name = his id)
--    and may see only his own. The admin may see all. Nobody can change or delete.
drop policy if exists receipts_insert_own on storage.objects;
drop policy if exists receipts_select_own_or_admin on storage.objects;

create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );

create policy receipts_select_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Check afterwards (should list the 2 policies):
-- select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts_%';
