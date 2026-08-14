create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  pillar_id uuid references public.pillars (id) on delete set null,
  name text not null, registration text, make_model text,
  tax_due date, mot_due date, insurance_due date,
  last_service date, next_service date,
  status text not null default 'active',
  sort_order integer not null default 0, notes text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
alter table public.vehicles enable row level security;
drop policy if exists "own" on public.vehicles;
create policy "own" on public.vehicles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists vehicles_user_status_idx on public.vehicles (user_id, status, sort_order);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  pillar_id uuid references public.pillars (id) on delete set null,
  venture_id uuid references public.ventures (id) on delete set null,
  creditor text not null, kind text not null default 'other', reference text,
  original_amount numeric, current_balance numeric,
  status text not null default 'active',
  plan_amount numeric, plan_frequency text, plan_day integer, plan_start date,
  notes text, sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
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
  check (plan_frequency is null or plan_frequency in ('weekly','fortnightly','monthly'));
alter table public.debts drop constraint if exists debts_plan_day_check;
alter table public.debts add constraint debts_plan_day_check
  check (plan_day is null or (plan_day >= 1 and plan_day <= 31));
alter table public.debts drop constraint if exists debts_amounts_check;
alter table public.debts add constraint debts_amounts_check
  check ((current_balance is null or current_balance >= 0)
     and (original_amount is null or original_amount >= 0)
     and (plan_amount is null or plan_amount >= 0));
create index if not exists debts_user_status_idx on public.debts (user_id, status, sort_order);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  debt_id uuid not null references public.debts (id) on delete cascade,
  amount numeric not null, due_on date not null, paid_on date,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
alter table public.debt_payments enable row level security;
drop policy if exists "own" on public.debt_payments;
create policy "own" on public.debt_payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.debt_payments drop constraint if exists debt_payments_status_check;
alter table public.debt_payments add constraint debt_payments_status_check
  check (status in ('scheduled','paid','missed'));
create index if not exists debt_payments_due_idx on public.debt_payments (user_id, status, due_on);

create unique index if not exists vehicles_user_name_key on public.vehicles (user_id, lower(name));
create unique index if not exists debts_user_creditor_key on public.debts (user_id, lower(creditor));
