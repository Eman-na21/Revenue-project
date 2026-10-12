-- =====================================================================
-- 006_agent_leaderboard.sql
-- Lets every signed-in agent see how all agents are doing in a date range
-- (ONLY totals per agent: name, daily target, amounts by kind of revenue).
-- Individual records, receipt numbers, notes and photos are NOT exposed.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: it only ADDS a function. Nothing is changed or deleted.
-- =====================================================================

create or replace function public.agent_leaderboard(p_start date, p_end date)
returns table (
  agent_id            uuid,
  agent_name          text,
  daily_target        numeric,
  chat                numeric,
  forest              numeric,
  sand                numeric,
  royalty_unspecified numeric,
  other               numeric
)
language sql
security definer           -- reads totals of ALL agents even though RLS hides other agents' rows
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
    coalesce(sum(c.amount) filter (where c.category is null or trim(c.category) not in ('Chat', 'Chat Royalty', 'Royalty', 'Traffic Fines')), 0)
  from public.profiles p
  left join public.collections c
    on c.agent_id = p.id
   and c.collected_at::date between p_start and p_end
  where public.is_active_user()              -- only signed-in, active users get an answer
    and coalesce(p.role, 'agent') <> 'admin'   -- same list of agents the administrator's report shows
  group by p.id, p.full_name, p.username, p.daily_target;
$$;

revoke all on function public.agent_leaderboard(date, date) from public, anon;
grant execute on function public.agent_leaderboard(date, date) to authenticated;

-- Try it (should list every active agent with amounts):
-- select * from public.agent_leaderboard(date_trunc('month', now())::date, now()::date);
