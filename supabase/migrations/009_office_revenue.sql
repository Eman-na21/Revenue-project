-- =====================================================================
-- 009_office_revenue.sql
-- Office revenue entered by the ACCOUNTANT (a new role), kept apart from the
-- field agents' collections.
--
--   * new role "accountant" (one account)
--   * revenue_codes   : the list of revenue codes (1101 ... 5028)
--   * office_revenues : one row per entry (code, amount, receipt, photos, date)
--   * the accountant's DAILY PLAN is stored in profiles.daily_target, exactly like
--     the agents' plan, and only the administrator can change it
--
-- Who may do what
--   accountant           : add office revenue, read office revenue, upload receipt photos
--   admin + vice admins  : read office revenue and codes, view receipt photos
--   admin only           : change the accountant's daily plan, add / edit revenue codes
--   nobody               : edit or delete an office revenue row directly
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: it only ADDS things (plus a wider role list). No data is deleted or changed.
-- Agents, vice admins and the leaderboard are not affected
-- (agent_leaderboard only lists role = 'agent').
-- =====================================================================

-- 1. Allow the new role value -----------------------------------------
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
  add constraint profiles_role_check
  check (role in ('admin', 'vice_admin', 'agent', 'accountant')) not valid;

-- 2. Helper -------------------------------------------------------------
create or replace function public.is_accountant()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = 'accountant'
  );
$$;

-- 3. Revenue codes --------------------------------------------------------
-- name_en / name_am are empty for now: fill them in later (see the end of this file).
create table if not exists public.revenue_codes (
  code       text primary key check (code ~ '^[0-9]{3,6}$'),
  name_en    text not null default '',
  name_am    text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.revenue_codes (code) values
  ('1101'), ('1102'), ('1103'), ('1108'), ('1169'),
  ('1221'), ('1222'), ('1224'), ('1225'), ('1227'),
  ('1231'), ('1234'), ('1237'), ('1238'), ('1249'),
  ('1254'), ('1264'), ('1279'), ('1291'), ('1292'),
  ('1413'), ('1437'), ('1468'), ('1489'), ('5028')
on conflict (code) do nothing;

-- 4. Office revenue entries -------------------------------------------------
create table if not exists public.office_revenues (
  id             uuid primary key default gen_random_uuid(),
  code           text not null references public.revenue_codes(code),
  amount         numeric(14,2) not null check (amount > 0),
  receipt_number text not null check (length(trim(receipt_number)) > 0),
  notes          text,
  receipt_paths  text[] not null default '{}',
  revenue_date   date not null,
  entered_by     uuid not null default auth.uid() references public.profiles(id),
  created_at     timestamptz not null default now(),
  constraint office_revenues_paths_max   check (cardinality(receipt_paths) <= 30),
  constraint office_revenues_paths_owner check (public.paths_owned_by(receipt_paths, entered_by))
);

create index if not exists office_revenues_date_idx on public.office_revenues (revenue_date);
create index if not exists office_revenues_code_idx on public.office_revenues (code);

-- The database itself fills in WHO entered the row and refuses a date in the future
-- (Addis Ababa time), so neither can be faked from the browser.
create or replace function public.office_revenues_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.entered_by := auth.uid();
  new.receipt_number := trim(new.receipt_number);
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  if new.revenue_date > (now() at time zone 'Africa/Addis_Ababa')::date then
    raise exception 'The date cannot be in the future.';
  end if;
  return new;
end $$;

drop trigger if exists office_revenues_before_insert on public.office_revenues;
create trigger office_revenues_before_insert
  before insert on public.office_revenues
  for each row execute function public.office_revenues_before_insert();

-- 5. Row Level Security ---------------------------------------------------------
alter table public.revenue_codes   enable row level security;
alter table public.office_revenues enable row level security;
revoke all on public.revenue_codes, public.office_revenues from anon;

drop policy if exists revenue_codes_select on public.revenue_codes;
drop policy if exists revenue_codes_insert_admin on public.revenue_codes;
drop policy if exists revenue_codes_update_admin on public.revenue_codes;

create policy revenue_codes_select on public.revenue_codes
  for select to authenticated
  using (public.is_staff() or public.is_accountant());

create policy revenue_codes_insert_admin on public.revenue_codes
  for insert to authenticated
  with check (public.is_admin());

create policy revenue_codes_update_admin on public.revenue_codes
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists office_revenues_select on public.office_revenues;
drop policy if exists office_revenues_insert_accountant on public.office_revenues;

create policy office_revenues_select on public.office_revenues
  for select to authenticated
  using (public.is_staff() or public.is_accountant());

create policy office_revenues_insert_accountant on public.office_revenues
  for insert to authenticated
  with check (entered_by = auth.uid() and public.is_accountant());

-- 6. Receipt photos: the accountant may upload into his own folder too ------------------
--    (select rule is unchanged: own folder, or admin / vice admins see everything)
drop policy if exists receipts_insert_own on storage.objects;
create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_active_agent() or public.is_accountant())
  );

-- 7. Live updates -----------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.office_revenues;
exception when duplicate_object then null; end $$;

-- 8. AFTER running this file ---------------------------------------------------------------
--    (a) Create the accountant's login:
--        Dashboard -> Authentication -> Users -> Add user -> Create new user
--        email (the part before @ is the USERNAME he types to sign in) + a strong password,
--        tick "Auto Confirm User".
--    (b) Make him the accountant and set his name and daily plan
--        (the administrator can change the plan later inside the app):
--
--        update public.profiles
--        set role = 'accountant',
--            full_name = 'ACCOUNTANT FULL NAME',
--            daily_target = 0
--        where id = (select id from auth.users where email = 'ACCOUNTANT_EMAIL@example.com');
--
--        Check:  select username, full_name, role, daily_target from public.profiles where role = 'accountant';
--
--    (c) Give the codes their names (optional, shown in the dropdown and the reports), for example:
--
--        update public.revenue_codes set name_en = 'English name', name_am = 'የአማርኛ ስም' where code = '1101';
