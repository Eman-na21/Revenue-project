-- =====================================================================
-- 010_trade_revenue.sql
-- Adds a 4th revenue category for the field agents:
--   "Trade Revenue"  (ከንግድ የሚገኝ ገቢ)
-- next to Chat, Royalty and Other Revenue.
--
--   * the collections table accepts the new category value
--   * agent_leaderboard (the ranking / report totals) gets a new "trade" column,
--     so trade money is NOT counted inside "other"
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: no money data is deleted or changed. Old records keep their category.
-- Run it BEFORE using the new app files, otherwise saving a Trade Revenue
-- collection may be refused and the agents' report may show an error.
--
-- (An earlier draft of this file used the name "Road Revenue". If you already ran that draft,
--  running this file is still correct: step 2 renames anything saved under the old name.)
-- =====================================================================

-- 1. Remove the old category rule(s) on collections -----------------------------------------
--    A rule that lists the allowed category names (it mentions 'Other Revenue') is dropped and
--    replaced in step 3. The royalty_type rules are not touched.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.collections'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%Other Revenue%'
  loop
    execute format('alter table public.collections drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.collections drop constraint if exists collections_category_check;

-- 2. Rename anything saved under the earlier draft name "Road Revenue" (normally nothing) -----------
update public.collections set category = 'Trade Revenue' where category = 'Road Revenue';

do $$
begin
  if to_regclass('public.correction_requests') is not null then
    update public.correction_requests set old_category = 'Trade Revenue' where old_category = 'Road Revenue';
    update public.correction_requests set new_category = 'Trade Revenue' where new_category = 'Road Revenue';
  end if;
end $$;

-- 3. The new rule: collections.category may be one of these -------------------------------------------
alter table public.collections
  add constraint collections_category_check
  check (category in ('Chat', 'Royalty', 'Trade Revenue', 'Other Revenue', 'Chat Royalty', 'Traffic Fines')) not valid;

-- 4. The ranking totals: a new "trade" column ------------------------------------------------------------
--    (a function cannot get a new column with "create or replace", so it is dropped and created again)
drop function if exists public.agent_leaderboard(date, date);

create function public.agent_leaderboard(p_start date, p_end date)
returns table (
  agent_id            uuid,
  agent_name          text,
  daily_target        numeric,
  chat                numeric,
  forest              numeric,
  sand                numeric,
  royalty_unspecified numeric,
  trade               numeric,
  other               numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    coalesce(nullif(trim(p.full_name), ''), p.username),
    coalesce(p.daily_target, 0),
    coalesce(sum(c.amount) filter (where trim(c.category) in ('Chat', 'Chat Royalty')), 0),
    coalesce(sum(c.amount) filter (where trim(c.category) in ('Royalty', 'Traffic Fines') and c.royalty_type = 'forest'), 0),
    coalesce(sum(c.amount) filter (where trim(c.category) in ('Royalty', 'Traffic Fines') and c.royalty_type = 'sand'), 0),
    coalesce(sum(c.amount) filter (where trim(c.category) in ('Royalty', 'Traffic Fines') and c.royalty_type is null), 0),
    coalesce(sum(c.amount) filter (where trim(c.category) = 'Trade Revenue'), 0),
    coalesce(sum(c.amount) filter (where c.category is null or trim(c.category) not in ('Chat', 'Chat Royalty', 'Royalty', 'Traffic Fines', 'Trade Revenue')), 0)
  from public.profiles p
  left join public.collections c
    on c.agent_id = p.id
   and c.collected_at::date between p_start and p_end
  where public.is_active_user()
    and coalesce(p.role, 'agent') = 'agent'
  group by p.id, p.full_name, p.username, p.daily_target;
$$;

revoke all on function public.agent_leaderboard(date, date) from public, anon;
grant execute on function public.agent_leaderboard(date, date) to authenticated;

-- Check afterwards (should list every active agent, with a "trade" column):
-- select * from public.agent_leaderboard(date_trunc('month', now())::date, now()::date);
