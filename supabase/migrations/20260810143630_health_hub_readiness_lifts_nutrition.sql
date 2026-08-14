-- The health hub.
--
-- Three tables, one per depth on the zero-obligation ladder.
--
-- `health_days` is the FLOOR: one row per day of whatever a wearable or a
-- single tap supplies. Every column is nullable because the floor has to be
-- reachable on a day he measured nothing — a day with only a weight is a
-- valid day, and must not read as a zero-step day.
create table if not exists public.health_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  on_date date not null,
  steps integer,
  active_minutes integer,
  -- Root mean square of successive differences, milliseconds. The readiness
  -- band is computed against Jay's OWN rolling baseline of this, never
  -- against an absolute scale — see readinessBand() in logic.ts.
  rmssd numeric,
  resting_hr integer,
  sleep_hours numeric,
  weight_kg numeric,
  -- The nutrition ladder, all optional and independently so. Weight plus a
  -- one-tap "ate well" is the default rung; protein and calories are the
  -- next; macros are synced, never typed.
  ate_well boolean,
  protein_g numeric,
  calories integer,
  -- Where the row came from, so a synced figure and a typed one stay
  -- distinguishable. 'manual' | 'samsung' | anything a later import adds.
  source text not null default 'manual',
  meta jsonb not null default '{}'::jsonb,
  primary key (user_id, on_date)
);

alter table public.health_days enable row level security;
drop policy if exists "own" on public.health_days;
create policy "own" on public.health_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.health_days is
  'One row per day. Every measure is nullable — a day with only a weight is a valid day and must never read as zero steps.';

-- `workouts` is what the load-spike warning is computed from. Volume is
-- deliberately stored, not derived, because "how hard was that" is a
-- judgement he makes at the time and cannot be reconstructed later.
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  on_date date not null,
  kind text not null default 'other',
  minutes integer,
  -- Session RPE 1-10. minutes x rpe is the session load, which is the
  -- standard way to make a run and a lifting session comparable.
  rpe integer check (rpe is null or (rpe >= 1 and rpe <= 10)),
  notes text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists workouts_user_date_idx
  on public.workouts (user_id, on_date desc);

alter table public.workouts enable row level security;
drop policy if exists "own" on public.workouts;
create policy "own" on public.workouts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- `lifts` is the ceiling: the Big 4 tracker. Zero-obligation means the rest
-- of the hub works perfectly with this table empty forever.
create table if not exists public.lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  on_date date not null,
  movement text not null check (
    movement = any (array['squat', 'bench', 'deadlift', 'press'])
  ),
  weight_kg numeric not null,
  reps integer not null check (reps >= 1),
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists lifts_user_movement_idx
  on public.lifts (user_id, movement, on_date desc);

alter table public.lifts enable row level security;
drop policy if exists "own" on public.lifts;
create policy "own" on public.lifts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.lifts is
  'The Big 4. Constrained to squat/bench/deadlift/press because the tracker is a fixed four, not a free exercise log — a free log is a different feature and would need a different UI.';
