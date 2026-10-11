-- =====================================================================
-- 003_royalty_type.sql
-- Splits "Royalty" into Forest Royalty (የደን ሮያሊቲ) and Sand Royalty (የአሸዋ ሮያሊቲ)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run: it only ADDS a column. Old records are not changed
-- (old Royalty records simply have no type and show as "Royalty (not specified)").
-- =====================================================================

alter table public.collections
  add column if not exists royalty_type text;

-- Only 'forest' or 'sand' are allowed...
do $$ begin
  alter table public.collections
    add constraint collections_royalty_type_values
    check (royalty_type is null or royalty_type in ('forest', 'sand'));
exception when duplicate_object then null; end $$;

-- ...and only on Royalty records
do $$ begin
  alter table public.collections
    add constraint collections_royalty_type_only_royalty
    check (royalty_type is null or category = 'Royalty');
exception when duplicate_object then null; end $$;

-- Check: this should show the new column
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'collections' and column_name = 'royalty_type';
