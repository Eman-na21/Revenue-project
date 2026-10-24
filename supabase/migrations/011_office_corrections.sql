-- =====================================================================
-- 011_office_corrections.sql
-- The accountant cannot edit an office revenue entry he already saved. Instead he sends a
-- CORRECTION REQUEST (the right values + a reason), exactly like the field agents do.
-- The entry changes ONLY when the administrator approves.
--
--   accountant : sends requests, sees his own
--   admin      : sees all requests, approves or rejects
--   vice admin : cannot see or decide them (same as for the agents' corrections)
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Run it AFTER 009_office_revenue.sql.
-- Safe: it only ADDS a table, functions and rules. office_revenues itself is not changed
-- (its values change only through approve_office_correction, which only the administrator can run).
-- =====================================================================

-- 1. The requests table --------------------------------------------------------------------
create table if not exists public.office_correction_requests (
  id                 uuid primary key default gen_random_uuid(),
  office_revenue_id  uuid not null references public.office_revenues(id) on delete cascade,
  requested_by       uuid not null default auth.uid() references public.profiles(id),

  old_code           text,
  old_amount         numeric,
  old_receipt_number text,
  old_notes          text,

  new_code           text    not null references public.revenue_codes(code),
  new_amount         numeric not null check (new_amount > 0),
  new_receipt_number text    not null check (length(trim(new_receipt_number)) > 0),
  new_notes          text,

  reason             text    not null check (length(trim(reason)) > 0),
  status             text    not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note         text,
  decided_by         uuid references public.profiles(id),
  decided_at         timestamptz,
  created_at         timestamptz not null default now()
);

-- Only ONE waiting request per entry
create unique index if not exists office_correction_one_pending_per_entry
  on public.office_correction_requests (office_revenue_id) where status = 'pending';
create index if not exists office_correction_requests_user_idx
  on public.office_correction_requests (requested_by, created_at desc);

-- 2. When the accountant sends a request, the database itself fills in WHO he is and the OLD values
--    (so nobody can fake them) and refuses a request that changes nothing.
create or replace function public.office_correction_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.office_revenues%rowtype;
begin
  if not public.is_accountant() then raise exception 'Only the accountant can request corrections.'; end if;

  select * into e from public.office_revenues where id = new.office_revenue_id;
  if not found then raise exception 'That entry was not found.'; end if;

  if exists (select 1 from public.office_correction_requests where office_revenue_id = new.office_revenue_id and status = 'pending') then
    raise exception 'There is already a request waiting for this entry.';
  end if;

  if new.new_code = e.code
     and new.new_amount is not distinct from e.amount
     and trim(new.new_receipt_number) is not distinct from trim(e.receipt_number)
     and coalesce(trim(new.new_notes), '') = coalesce(trim(e.notes), '') then
    raise exception 'Nothing was changed.';
  end if;

  new.requested_by       := auth.uid();
  new.old_code           := e.code;
  new.old_amount         := e.amount;
  new.old_receipt_number := e.receipt_number;
  new.old_notes          := e.notes;
  new.new_receipt_number := trim(new.new_receipt_number);
  new.new_notes          := nullif(trim(coalesce(new.new_notes, '')), '');
  new.status             := 'pending';
  new.admin_note         := null;
  new.decided_by         := null;
  new.decided_at         := null;
  return new;
end $$;

drop trigger if exists office_correction_before_insert on public.office_correction_requests;
create trigger office_correction_before_insert
  before insert on public.office_correction_requests
  for each row execute function public.office_correction_before_insert();

-- 3. Who can see / add requests. Nobody can edit or delete them directly.
alter table public.office_correction_requests enable row level security;
revoke all on public.office_correction_requests from anon;

drop policy if exists office_corrections_select on public.office_correction_requests;
drop policy if exists office_corrections_insert on public.office_correction_requests;

create policy office_corrections_select on public.office_correction_requests
  for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

create policy office_corrections_insert on public.office_correction_requests
  for insert to authenticated
  with check (requested_by = auth.uid() and public.is_accountant());

-- 4. Approve / reject: ONLY the administrator. Approving replaces the wrong values in the entry.
create or replace function public.approve_office_correction(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.office_correction_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Only the administrator can approve requests.'; end if;

  select * into r from public.office_correction_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already decided.'; end if;

  update public.office_revenues
     set code           = r.new_code,
         amount         = r.new_amount,
         receipt_number = r.new_receipt_number,
         notes          = r.new_notes
   where id = r.office_revenue_id;

  update public.office_correction_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(),
         admin_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;
end $$;

create or replace function public.reject_office_correction(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.office_correction_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Only the administrator can reject requests.'; end if;

  select * into r from public.office_correction_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already decided.'; end if;

  update public.office_correction_requests
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         admin_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;
end $$;

revoke all on function public.approve_office_correction(uuid, text) from public, anon;
revoke all on function public.reject_office_correction(uuid, text)  from public, anon;
grant execute on function public.approve_office_correction(uuid, text) to authenticated;
grant execute on function public.reject_office_correction(uuid, text)  to authenticated;

-- 5. Live updates
do $$ begin
  alter publication supabase_realtime add table public.office_correction_requests;
exception when duplicate_object then null; end $$;

-- Check afterwards (should show the table and both functions):
-- select to_regclass('public.office_correction_requests') as tbl;
-- select proname from pg_proc where proname in ('approve_office_correction', 'reject_office_correction');
