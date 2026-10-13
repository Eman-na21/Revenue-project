-- =====================================================================
-- 007_correction_requests.sql
-- An agent cannot edit a saved collection. Instead he sends a CORRECTION REQUEST
-- (the right values + a reason). The record changes ONLY when the administrator approves.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe: it only ADDS a table, functions and rules. The collections table itself is not changed
-- (its values change only through approve_correction, which only the administrator can run).
-- =====================================================================

-- 1. The requests table. The type of collection_id is copied from collections.id automatically.
do $$
declare id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a
  where a.attrelid = 'public.collections'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($f$
    create table if not exists public.correction_requests (
      id                  uuid primary key default gen_random_uuid(),
      collection_id       %s not null references public.collections(id) on delete cascade,
      agent_id            uuid not null references public.profiles(id) on delete cascade,

      old_category        text,
      old_royalty_type    text,
      old_amount          numeric,
      old_receipt_number  text,
      old_notes           text,

      new_category        text    not null,
      new_royalty_type    text,
      new_amount          numeric not null check (new_amount > 0),
      new_receipt_number  text    not null check (length(trim(new_receipt_number)) > 0),
      new_notes           text,

      reason              text    not null check (length(trim(reason)) > 0),
      status              text    not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
      admin_note          text,
      decided_by          uuid references public.profiles(id),
      decided_at          timestamptz,
      created_at          timestamptz not null default now(),

      constraint correction_royalty_values check (new_royalty_type is null or new_royalty_type in ('forest', 'sand')),
      constraint correction_royalty_only check (new_royalty_type is null or new_category = 'Royalty'),
      constraint correction_royalty_needed check (new_category <> 'Royalty' or new_royalty_type is not null)
    )
  $f$, id_type);
end $$;

-- Only ONE waiting request per record
create unique index if not exists correction_one_pending_per_record
  on public.correction_requests (collection_id) where status = 'pending';
create index if not exists correction_requests_agent_idx
  on public.correction_requests (agent_id, created_at desc);

-- 2. When an agent sends a request, the database itself fills in WHO he is and the OLD values
--    (so nobody can fake them) and refuses requests for other agents' records.
create or replace function public.correction_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.collections%rowtype;
begin
  select * into c from public.collections where id = new.collection_id;
  if not found then raise exception 'That record was not found.'; end if;
  if c.agent_id <> auth.uid() then raise exception 'You can only request corrections for your own records.'; end if;

  if exists (select 1 from public.correction_requests where collection_id = new.collection_id and status = 'pending') then
    raise exception 'There is already a request waiting for this record.';
  end if;

  if new.new_category        is not distinct from c.category
     and new.new_royalty_type  is not distinct from c.royalty_type
     and new.new_amount        is not distinct from c.amount
     and trim(new.new_receipt_number) is not distinct from trim(c.receipt_number)
     and coalesce(trim(new.new_notes), '') = coalesce(trim(c.notes), '') then
    raise exception 'Nothing was changed.';
  end if;

  new.agent_id           := c.agent_id;
  new.old_category       := c.category;
  new.old_royalty_type   := c.royalty_type;
  new.old_amount         := c.amount;
  new.old_receipt_number := c.receipt_number;
  new.old_notes          := c.notes;
  new.new_receipt_number := trim(new.new_receipt_number);
  new.new_notes          := nullif(trim(coalesce(new.new_notes, '')), '');
  new.status             := 'pending';
  new.admin_note         := null;
  new.decided_by         := null;
  new.decided_at         := null;
  return new;
end $$;

drop trigger if exists correction_before_insert on public.correction_requests;
create trigger correction_before_insert
  before insert on public.correction_requests
  for each row execute function public.correction_before_insert();

-- 3. Who can see / add requests. Nobody can edit or delete them directly.
alter table public.correction_requests enable row level security;
revoke all on public.correction_requests from anon;

drop policy if exists corrections_select on public.correction_requests;
drop policy if exists corrections_insert_own on public.correction_requests;

create policy corrections_select on public.correction_requests
  for select to authenticated
  using (agent_id = auth.uid() or public.is_admin());

create policy corrections_insert_own on public.correction_requests
  for insert to authenticated
  with check (agent_id = auth.uid() and public.is_active_user());

-- 4. Approve / reject: ONLY the administrator. Approving replaces the wrong values in the record.
create or replace function public.approve_correction(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.correction_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Only the administrator can approve requests.'; end if;

  select * into r from public.correction_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already decided.'; end if;

  update public.collections
     set category       = r.new_category,
         royalty_type   = r.new_royalty_type,
         amount         = r.new_amount,
         receipt_number = r.new_receipt_number,
         notes          = r.new_notes
   where id = r.collection_id;

  update public.correction_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(),
         admin_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;
end $$;

create or replace function public.reject_correction(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.correction_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Only the administrator can reject requests.'; end if;

  select * into r from public.correction_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already decided.'; end if;

  update public.correction_requests
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         admin_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;
end $$;

revoke all on function public.approve_correction(uuid, text) from public, anon;
revoke all on function public.reject_correction(uuid, text)  from public, anon;
grant execute on function public.approve_correction(uuid, text) to authenticated;
grant execute on function public.reject_correction(uuid, text)  to authenticated;

-- 5. Live updates
do $$ begin
  alter publication supabase_realtime add table public.correction_requests;
exception when duplicate_object then null; end $$;

-- Check afterwards (should show the table and both functions):
-- select to_regclass('public.correction_requests') as tbl;
-- select proname from pg_proc where proname in ('approve_correction', 'reject_correction');
