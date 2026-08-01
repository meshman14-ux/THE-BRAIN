-- ============================================================================
-- debts_and_vehicles
--
-- Two numbers sit at the top of Jay's designs and neither could be produced:
-- what he owes, and what is about to expire on a vehicle. Debt lived as a
-- single metric reading, which cannot express a creditor, a plan or a payment
-- day. Vehicles had nowhere at all.
--
-- NULLABILITY IS THE POINT HERE. Every amount and every date below is
-- nullable, because "I have not rung them yet" is the true state of most of
-- this data and it is not zero. A zero balance means cleared; a null balance
-- means unknown. Conflating them would tell Jay he is closer to debt-free than
-- he is, which is the exact failure this system exists to prevent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- vehicles
--
-- A dedicated table rather than rows in `assets`. These are date-driven legal
-- deadlines that get queried as "what is due in the next 30 days" — the whole
-- reason the table exists. Burying those dates in `meta` jsonb would make the
-- one important query awkward and unindexable.
-- ---------------------------------------------------------------------------

create table if not exists public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  pillar_id      uuid references public.pillars (id) on delete set null,
  name           text not null,
  registration   text,
  make_model     text,
  tax_due        date,
  mot_due        date,
  insurance_due  date,
  last_service   date,
  next_service   date,
  status         text not null default 'active',
  sort_order     integer not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  meta           jsonb not null default '{}'::jsonb
);

alter table public.vehicles enable row level security;

drop policy if exists "own" on public.vehicles;
create policy "own" on public.vehicles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists vehicles_user_status_idx
  on public.vehicles (user_id, status, sort_order);

comment on table public.vehicles is
  'Vehicles with their legal deadlines. Every date is nullable: a null date means "not recorded", which the UI must never render as either overdue or fine.';
comment on column public.vehicles.meta is
  'Maintenance checklist and anything else per-vehicle that does not deserve a column.';

-- ---------------------------------------------------------------------------
-- debts
--
-- `current_balance` nullable is load-bearing — see the header note.
-- `venture_id` because council tax on Kathleen St belongs to that property,
-- and a debt attached to a venture should show on that venture's dashboard.
-- ---------------------------------------------------------------------------

create table if not exists public.debts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid(),
  pillar_id        uuid references public.pillars (id) on delete set null,
  venture_id       uuid references public.ventures (id) on delete set null,
  creditor         text not null,
  kind             text not null default 'other',
  reference        text,
  original_amount  numeric,
  current_balance  numeric,
  status           text not null default 'active',
  -- The agreed plan, distinct from the payments generated from it.
  plan_amount      numeric,
  plan_frequency   text,
  plan_day         integer,
  plan_start       date,
  notes            text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  meta             jsonb not null default '{}'::jsonb
);

alter table public.debts enable row level security;

drop policy if exists "own" on public.debts;
create policy "own" on public.debts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.debts drop constraint if exists debts_kind_check;
alter table public.debts add constraint debts_kind_check
  check (kind in ('council_tax','credit','utility','vehicle','benefit','other'));

alter table public.debts drop constraint if exists debts_frequency_check;
alter table public.debts add constraint debts_frequency_check
  check (plan_frequency is null
         or plan_frequency in ('weekly','fortnightly','monthly'));

alter table public.debts drop constraint if exists debts_plan_day_check;
alter table public.debts add constraint debts_plan_day_check
  check (plan_day is null or (plan_day >= 1 and plan_day <= 31));

-- Amounts may be unknown, but they may never be negative.
alter table public.debts drop constraint if exists debts_amounts_check;
alter table public.debts add constraint debts_amounts_check
  check ((current_balance is null or current_balance >= 0)
     and (original_amount is null or original_amount >= 0)
     and (plan_amount is null or plan_amount >= 0));

create index if not exists debts_user_status_idx
  on public.debts (user_id, status, sort_order);

comment on column public.debts.current_balance is
  'NULL means not yet confirmed with the creditor — NOT zero. Zero means cleared. The dashboard total is marked incomplete while any active debt is null.';

-- ---------------------------------------------------------------------------
-- debt_payments
--
-- Separate from `debts` because a plan changes over time and the record of
-- what was actually paid is the part that shows progress. Cascade on delete:
-- a payment has no meaning without its debt.
-- ---------------------------------------------------------------------------

create table if not exists public.debt_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  debt_id    uuid not null references public.debts (id) on delete cascade,
  amount     numeric not null,
  due_on     date not null,
  paid_on    date,
  status     text not null default 'scheduled',
  created_at timestamptz not null default now(),
  meta       jsonb not null default '{}'::jsonb
);

alter table public.debt_payments enable row level security;

drop policy if exists "own" on public.debt_payments;
create policy "own" on public.debt_payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.debt_payments drop constraint if exists debt_payments_status_check;
alter table public.debt_payments add constraint debt_payments_status_check
  check (status in ('scheduled','paid','missed'));

create index if not exists debt_payments_due_idx
  on public.debt_payments (user_id, status, due_on);
