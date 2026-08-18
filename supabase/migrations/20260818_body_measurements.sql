-- body_measurements — waist/chest/arm/thigh/body-fat over time.
-- Added for the MARK-VII cockpit's /life/body/measurements page.
--
-- Trend-based only, per the readiness engine's own rule: a measurement is a
-- fact about a day, not a verdict, and the page that reads this table draws
-- from at least two rows before it draws a line through them — the same
-- "one reading is a value, not a trend" rule metrics.ts already holds.
--
-- Every measure is nullable. A day with only a waist figure is a valid day
-- and must never be padded with invented values for the others — the same
-- rule health_days already holds for steps/sleep/weight.
--
-- Same uniform RLS shape as every other table: owner-only, both directions.

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  on_date date not null,
  chest_cm numeric,
  waist_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  body_fat_pct numeric,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

alter table public.body_measurements enable row level security;

drop policy if exists "own" on public.body_measurements;
create policy "own" on public.body_measurements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
