-- =====================================================================
-- 008_vice_admin.sql
-- Adds the role "vice_admin" (ም/አስተዳዳሪ).
-- A vice admin can READ everything the admin reads for Overview / Monthly reports
-- (all collections, all agents, receipt photos) and SEND recommendations.
-- A vice admin can NOT: edit or add agents, see or approve correction requests,
-- or add collections.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: no data is deleted or changed. It only changes WHO may do what.
-- =====================================================================

-- 1. Allow the new role value (an older rule that listed only admin/agent is replaced)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'vice_admin', 'agent')) not valid;

-- 2. Helpers
create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('admin', 'vice_admin')
  );
$$;

create or replace function public.is_active_agent()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and coalesce(role, 'agent') = 'agent'
  );
$$;

-- 3. Who may READ everything: admin and vice admins (is_admin() stays for admin-only things)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists collections_select on public.collections;
create policy collections_select on public.collections
  for select to authenticated
  using (agent_id = auth.uid() or public.is_staff());

drop policy if exists recommendations_select on public.recommendations;
create policy recommendations_select on public.recommendations
  for select to authenticated
  using (agent_id = auth.uid() or public.is_staff());

-- 4. Who may WRITE
--    - only active AGENTS add collections
drop policy if exists collections_insert_own on public.collections;
create policy collections_insert_own on public.collections
  for insert to authenticated
  with check (agent_id = auth.uid() and public.is_active_agent());

--    - admin AND vice admins send recommendations
drop policy if exists recommendations_insert_admin on public.recommendations;
drop policy if exists recommendations_insert_staff on public.recommendations;
create policy recommendations_insert_staff on public.recommendations
  for insert to authenticated
  with check (public.is_staff());

-- 5. Receipt photos: agents upload into their own folder; admin and vice admins can view all
drop policy if exists receipts_insert_own on storage.objects;
create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_agent()
  );

drop policy if exists receipts_select_own_or_admin on storage.objects;
drop policy if exists receipts_select_own_or_staff on storage.objects;
create policy receipts_select_own_or_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- 6. The ranking list must contain AGENTS only (not admin / vice admins)
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
    coalesce(sum(c.amount) filter (where c.category is null or trim(c.category) not in ('Chat', 'Chat Royalty', 'Royalty', 'Traffic Fines')), 0)
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

-- 7. AFTER running this file, create each vice admin:
--    (a) Dashboard -> Authentication -> Users -> Add user -> Create new user
--        email + a strong password, tick "Auto Confirm User".  (use each person's REAL email)
--    (b) Then run (put the real emails and names):
--
--    update public.profiles
--    set role = 'vice_admin',
--        full_name = case (select email from auth.users where id = profiles.id)
--          when 'FIRST_EMAIL@example.com'  then 'First Name'
--          when 'SECOND_EMAIL@example.com' then 'Second Name'
--          when 'THIRD_EMAIL@example.com'  then 'Third Name'
--        end
--    where id in (select id from auth.users
--                 where email in ('FIRST_EMAIL@example.com', 'SECOND_EMAIL@example.com', 'THIRD_EMAIL@example.com'));
--
--    Check:  select username, full_name, role from public.profiles where role = 'vice_admin';
