-- =====================================================================
-- 002_auth_rls_sync.sql
-- Real login (Supabase Auth) + real security (RLS) + saved recommendations
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

-- 0. Profile columns the app now uses --------------------------------
alter table public.profiles add column if not exists full_name    text;
alter table public.profiles add column if not exists role         text    not null default 'agent';
alter table public.profiles add column if not exists active       boolean not null default true;
alter table public.profiles add column if not exists daily_target numeric not null default 0;

update public.profiles set role = 'agent' where role is null;

-- 1. Helper functions (security definer = they can read profiles without recursion)
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

-- 2. Recommendations table (they were only kept in the browser before) ---
create table if not exists public.recommendations (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  message    text not null check (length(trim(message)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists recommendations_agent_idx on public.recommendations (agent_id, created_at desc);

-- 3. Remove ALL old policies on these tables (old ones were probably "allow everyone")
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('profiles', 'collections', 'recommendations')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles        enable row level security;
alter table public.collections     enable row level security;
alter table public.recommendations enable row level security;

revoke all on public.profiles, public.collections, public.recommendations from anon;

-- 4. New policies ------------------------------------------------------
-- profiles: everyone sees their own row, admin sees all, only admin edits
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- collections: an agent sees/adds only his own, admin sees everything
create policy collections_select on public.collections
  for select to authenticated
  using (agent_id = auth.uid() or public.is_admin());

create policy collections_insert_own on public.collections
  for insert to authenticated
  with check (agent_id = auth.uid() and public.is_active_user());

-- recommendations: admin writes, the agent it is addressed to reads
create policy recommendations_select on public.recommendations
  for select to authenticated
  using (agent_id = auth.uid() or public.is_admin());

create policy recommendations_insert_admin on public.recommendations
  for insert to authenticated
  with check (public.is_admin());

-- 5. Auto-create a profile when a new Auth user is created ---------------
-- NOTE: role is ALWAYS 'agent' here. Admin is promoted only by SQL (step 7),
-- so nobody can make themselves admin through sign-up metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, role, daily_target, active)
  values (
    new.id,
    lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    'agent',
    coalesce(nullif(new.raw_user_meta_data->>'daily_target', '')::numeric, 0),
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Live updates (Realtime) -------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.collections;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.recommendations;
exception when duplicate_object then null; end $$;

-- 7. AFTER running the above ------------------------------------------
-- (a) Check that every profile has a matching login user (email must not be null):
--       select p.username, u.email from public.profiles p left join auth.users u on u.id = p.id;
--
-- (b) Create the admin user in Dashboard -> Authentication -> Users -> Add user
--       email: YOUR_ADMIN_EMAIL (a real email you own)   password: (choose a strong one)   [x] Auto Confirm User
--     then make that user the admin:
--       update public.profiles set role = 'admin', full_name = 'Nuru Mohammed'
--       where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
--
-- (c) Dashboard -> Authentication -> Sign In / Providers: turn OFF "Allow new users to sign up".
