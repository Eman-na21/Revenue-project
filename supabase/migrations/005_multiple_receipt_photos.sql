-- =====================================================================
-- 005_multiple_receipt_photos.sql
-- One collection can now have several receipt photos (up to 30).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: it only ADDS a column and COPIES the existing single photos into it.
-- Nothing is deleted. (The old receipt_path column stays, unused.)
-- =====================================================================

-- 1. List of photo paths
alter table public.collections
  add column if not exists receipt_paths text[] not null default '{}';

-- 2. Copy the single photo of existing records into the list
update public.collections
set receipt_paths = array[receipt_path]
where receipt_path is not null
  and cardinality(receipt_paths) = 0;

-- 3. Safety rules
--    (a) every photo path must start with THE SAME agent's id
create or replace function public.paths_owned_by(paths text[], owner uuid)
returns boolean language sql immutable as $$
  select coalesce(bool_and(p like owner::text || '/%'), true) from unnest(paths) as p;
$$;

do $$ begin
  alter table public.collections
    add constraint collections_receipt_paths_owner
    check (public.paths_owned_by(receipt_paths, agent_id));
exception when duplicate_object then null; end $$;

--    (b) at most 30 photos per collection
do $$ begin
  alter table public.collections
    add constraint collections_receipt_paths_max
    check (cardinality(receipt_paths) <= 30);
exception when duplicate_object then null; end $$;

-- Check afterwards:
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'collections' and column_name = 'receipt_paths';
