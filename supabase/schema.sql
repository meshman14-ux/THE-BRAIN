-- ============================================================================
-- THE BRAIN OS — live schema capture
--
-- Project: qttroyuajpyelfrbxzzt (eu-west-2, London)
-- Captured: 2026-08-18, from the live database, by reading the catalogue.
-- Supersedes the 2026-08-13 capture, which described 44 tables and 22
-- migrations. There are now 56 and 33.
--
-- WHAT THIS FILE IS
-- A faithful description of what is actually deployed. It exists because for
-- the whole life of this project the only description of the data layer was a
-- paragraph in CLAUDE.md, and that paragraph was measurably wrong: it said 28
-- tables and 13 migrations when the live project had 44 and 22, and three
-- separate queries written from it failed because columns it named did not
-- exist (`health_days.day`, `debts.balance`) and columns it omitted did.
--
-- WHAT THIS FILE IS NOT
-- It is NOT a migration and must never be run against the live project. It has
-- no `if not exists`, no ordering guarantees beyond the obvious, and applying
-- it would at best error and at worst destroy data. Migrations live in
-- `supabase/migrations/` and in Supabase's own `schema_migrations` table.
-- To change the schema, write a new migration. To refresh this file, re-read
-- the catalogue.
--
-- HOW TO REFRESH IT
-- Everything here came from `information_schema` and the `pg_catalog` views —
-- `pg_class`, `pg_attribute`, `pg_attrdef`, `pg_constraint`, `pg_indexes`,
-- `pg_policies`, `pg_proc`, `pg_trigger`, `pg_extension`. No hand-editing. The
-- exact queries are written down in supabase/README.md under "How to refresh",
-- because the reason this file went stale between 13 and 18 August is that
-- re-reading the catalogue was folklore rather than a recipe.
--
-- ⚠️  IT WENT STALE IN FIVE DAYS, AND ONCE DURING ITS OWN RECAPTURE.
-- Between the two captures, eleven tables arrived (capture engine, reflection
-- and the board, push, smart rules, the second calendar) and none was written
-- down. More pointedly: `body_measurements` was created by ANOTHER SESSION at
-- 16:36 on 2026-08-18, while this recapture was in progress — the table count
-- went 55 → 56 between two queries minutes apart. This project's database has
-- more than one writer. Treat this file as a point-in-time snapshot with a
-- date on it, never as a live mirror, and re-read before trusting it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
-- `vector` is pgvector. It is enabled and two embedding columns exist, but
-- NOTHING writes them and there is no HNSW or IVFFlat index — retrieval is
-- word matching, deliberately, while the vault holds twelve notes. See
-- RETRIEVAL_CEILING in src/lib/advisor.ts.

-- pg_stat_statements 1.11
-- pgcrypto           1.3
-- plpgsql            1.0
-- supabase_vault     0.3.1
-- uuid-ossp          1.1
-- vector             0.8.2


-- ============================================================================
-- TABLES — 56 of them
--
-- Two families share this schema and the prefix is the only thing separating
-- them:
--   * unprefixed  — THE BRAIN OS proper (command centre, LIFE_OS, EMPIRE_OS)
--   * cog_*       — the engine layer added by migration `cog_core` (2026-08-12)
--
-- ⚠️  THE `cog_` PREFIX IS ALSO THE PREFIX OF A DIFFERENT SYSTEM.
-- The sibling repo THE COG (festival operations) prefixes EVERY object `cog_`
-- as well, and its own CLAUDE.md instructs agents never to touch objects
-- outside that prefix. These eight tables are NOT that system — there is no
-- cog_access, cog_units, cog_event_units, cog_stock or cog_incidents here, and
-- cog_identity.keystone_habit_id points at THE BRAIN's own habits table. But
-- `cog_events` exists in BOTH schemas meaning entirely different things, so a
-- migration written for one project and run against the other would find a
-- name it recognises and corrupt it. Check the project ref before running any
-- cog_* migration anywhere.
--
-- THREE TABLES HOLD NO USER DATA: advisor_seats, drive_folders and smart_rules
-- are reference/configuration, arrived with the capture and board merges, and
-- are the only three with no `user_id` column at all. Their RLS is a different
-- shape for that reason — see ROW LEVEL SECURITY below.
-- ----------------------------------------------------------------------------

create table public.advisor_opinions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  session_id uuid not null,
  seat_key text not null,
  position text not null,
  argument text not null,
  created_at timestamptz default now() not null
);

create table public.advisor_seats (
  key text not null,
  name text not null,
  brief text not null,
  bias text not null,
  looks_at text[] default '{}'::text[] not null,
  active boolean default true not null
);

create table public.advisor_sessions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text default 'board'::text not null,
  question text,
  context jsonb default '{}'::jsonb not null,
  verdict text,
  recommendation text,
  dissent text,
  reflection_id uuid,
  decided text,
  decided_at timestamptz,
  created_at timestamptz default now() not null
);

create table public.assets (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  venture_id uuid,
  kind text not null,
  name text not null,
  acquired_on date,
  value numeric,
  income_monthly numeric,
  cost_monthly numeric,
  status text default 'held'::text not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.athlete_profile (
  user_id uuid default auth.uid() not null,
  bodyweight_kg numeric,
  sessions_per_week integer default 4 not null,
  equipment text[] default '{}'::text[] not null,
  focus_skills text[] default '{}'::text[] not null,
  landmarks jsonb default '{}'::jsonb not null,
  updated_at timestamptz default now() not null
);

-- Added 2026-08-18 by a concurrent session, after this file's previous capture.
create table public.body_measurements (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  on_date date not null,
  chest_cm numeric,
  waist_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  body_fat_pct numeric,
  note text,
  created_at timestamptz default now() not null
);

create table public.calendar_events (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  google_id text,
  calendar_id text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean default false not null,
  location text,
  origin text default 'google'::text not null,
  task_id uuid,
  status text default 'confirmed'::text not null,
  etag text,
  synced_at timestamptz,
  updated_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.calendar_state (
  user_id uuid not null,
  calendar_id text default 'primary'::text not null,
  sync_token text,
  last_pull timestamptz,
  last_push timestamptz,
  last_error text
);

create table public.calendar_sync (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  task_id uuid,
  google_event_id text not null,
  google_cal_id text not null,
  etag text,
  event_start timestamptz,
  event_end timestamptz,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  conflict boolean default false not null,
  conflict_note text,
  meta jsonb default '{}'::jsonb not null
);

create table public.capture_proposals (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  capture_id uuid not null,
  target_table text not null,
  target_id uuid,
  action text not null,
  payload jsonb default '{}'::jsonb not null,
  label text not null,
  rationale text,
  confidence numeric,
  status text default 'proposed'::text not null,
  applied_at timestamptz,
  error text,
  created_at timestamptz default now() not null
);

-- `user_id` has NO default here, unlike almost every other table. That is
-- deliberate and load-bearing: left to auth.uid() the row would be invisible
-- to its owner forever (the cog_config trap). The insert sets it explicitly.
create table public.captures (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  storage_path text not null,
  mime_type text default 'image/jpeg'::text not null,
  source text default 'upload'::text not null,
  status text default 'pending'::text not null,
  doc_type text,
  title text,
  raw_text text,
  extraction jsonb default '{}'::jsonb not null,
  confidence numeric,
  error text,
  drive_file_id text,
  drive_url text,
  captured_at timestamptz default now() not null,
  processed_at timestamptz,
  confirmed_at timestamptz,
  meta jsonb default '{}'::jsonb not null,
  drive_folder_key text,
  drive_filename text
);

create table public.cog_checkins (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  date date not null,
  energy_band integer not null,
  sleep_band integer,
  intent text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.cog_config (
  id text default 'default'::text not null,
  user_id uuid default auth.uid() not null,
  config jsonb not null,
  updated_at timestamptz default now() not null
);

create table public.cog_events (
  id text not null,
  user_id uuid default auth.uid() not null,
  type text not null,
  occurred_at timestamptz default now() not null,
  correlation_id text,
  causation_id text,
  actor text default 'cog-engine'::text not null,
  version integer default 1 not null,
  payload jsonb default '{}'::jsonb not null,
  delivered boolean default false not null,
  dead boolean default false not null
);

create table public.cog_feedback (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  target_kind text not null,
  target_id text not null,
  verdict text not null,
  modification jsonb,
  correlation_id text,
  created_at timestamptz default now() not null
);

create table public.cog_identity (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  keystone_habit_id uuid,
  deep_work_start time default '08:30:00'::time without time zone not null,
  deep_work_end time default '12:30:00'::time without time zone not null,
  statements jsonb default '[]'::jsonb not null,
  alignment_window_days integer default 7 not null,
  updated_at timestamptz default now() not null
);

create table public.cog_pulses (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  date date not null,
  kind text not null,
  ref_id text,
  message text not null,
  rationale text not null,
  rule_trace jsonb default '[]'::jsonb not null,
  correlation_id text not null,
  issued_at timestamptz default now() not null,
  expires_at timestamptz,
  verdict text
);

create table public.cog_states (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  date date not null,
  season text not null,
  momentum integer,
  missing_inputs text[] default '{}'::text[] not null,
  state jsonb not null,
  built_at timestamptz default now() not null
);

create table public.cog_telemetry (
  id bigint not null,
  user_id uuid default auth.uid() not null,
  metric text not null,
  label text,
  value numeric not null,
  at timestamptz default now() not null
);

create table public.debt_payments (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  debt_id uuid not null,
  amount numeric not null,
  due_on date not null,
  paid_on date,
  status text default 'scheduled'::text not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.debts (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  venture_id uuid,
  creditor text not null,
  kind text default 'other'::text not null,
  reference text,
  original_amount numeric,
  current_balance numeric,
  status text default 'active'::text not null,
  plan_amount numeric,
  plan_frequency text,
  plan_day integer,
  plan_start date,
  notes text,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null,
  apr numeric,
  recurring boolean default false not null
);

create table public.diagnostic_runs (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  subject_type text not null,
  subject_id uuid not null,
  kind text default 'triage'::text not null,
  started_at timestamptz default now() not null,
  completed_at timestamptz,
  answers jsonb default '{}'::jsonb not null,
  score integer,
  answered integer,
  of_total integer,
  meta jsonb default '{}'::jsonb not null
);

-- Reference data, no user_id: routing is data, not code.
create table public.drive_folders (
  key text not null,
  folder_id text not null,
  label text not null,
  sort_order integer default 0 not null
);

create table public.finishes (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  happened_on date default CURRENT_DATE not null,
  kind text default 'milestone'::text not null,
  note text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.goals (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  vision_id uuid,
  title text not null,
  description text,
  target_date date,
  status text default 'active'::text not null,
  progress integer default 0 not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.habit_logs (
  habit_id uuid not null,
  user_id uuid default auth.uid() not null,
  done_on date not null,
  value numeric,
  note text
);

create table public.habits (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  name text not null,
  cadence text default 'daily'::text not null,
  target_count integer default 1 not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null,
  tracked boolean default true not null,
  keystone boolean default false not null
);

create table public.health_days (
  user_id uuid default auth.uid() not null,
  on_date date not null,
  steps integer,
  active_minutes integer,
  rmssd numeric,
  resting_hr integer,
  sleep_hours numeric,
  weight_kg numeric,
  ate_well boolean,
  protein_g numeric,
  calories integer,
  source text default 'manual'::text not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.inbox (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  raw_text text not null,
  source text default 'app'::text not null,
  captured_at timestamptz default now() not null,
  triaged_at timestamptz,
  routed_type text,
  routed_id uuid,
  status text default 'open'::text not null,
  embedding vector(1536),
  meta jsonb default '{}'::jsonb not null
);

-- access_token and refresh_token are CIPHERTEXT (AES-256-GCM, keyed from
-- CALENDAR_TOKEN_SECRET, a server-only env var). RLS makes the row readable by
-- its owner, and "its owner" includes anything running in his browser — so a
-- refresh token in the clear here would be one XSS from being someone else's.
create table public.integrations (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  calendar_id text,
  calendar_name text,
  sync_token text,
  connected_at timestamptz default now() not null,
  last_sync_at timestamptz,
  last_error text,
  meta jsonb default '{}'::jsonb not null
);

create table public.investments (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  kind text not null,
  name text not null,
  platform text,
  units numeric,
  cost_basis numeric,
  current_value numeric,
  as_of date,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.journal (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  entry_date date not null,
  body text,
  mood integer,
  energy integer,
  gratitude text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.lifts (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  on_date date not null,
  movement text not null,
  weight_kg numeric not null,
  reps integer not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.links (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null,
  relation text default 'relates_to'::text not null,
  created_at timestamptz default now() not null
);

create table public.meal_ingredients (
  id uuid default gen_random_uuid() not null,
  meal_id uuid not null,
  user_id uuid default auth.uid() not null,
  item text not null,
  qty numeric,
  unit text,
  sort_order integer default 0 not null,
  optional boolean default false not null
);

create table public.meals (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  name text not null,
  slug text not null,
  category text not null,
  cuisine text,
  image_url text,
  image_source text,
  image_licence text,
  servings integer default 2 not null,
  prep_min integer,
  cook_min integer,
  protein_g integer,
  kcal integer,
  estimates boolean default true not null,
  tags text[] default '{}'::text[] not null,
  method text[] default '{}'::text[] not null,
  notes text,
  favourite boolean default false not null,
  last_cooked_on date,
  times_cooked integer default 0 not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.metric_readings (
  id uuid default gen_random_uuid() not null,
  metric_id uuid not null,
  user_id uuid default auth.uid() not null,
  taken_on date not null,
  value numeric not null
);

create table public.metrics (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  name text not null,
  unit text,
  target numeric,
  direction text default 'up'::text not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.notes (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  title text,
  body text,
  kind text default 'note'::text not null,
  tags text[] default '{}'::text[] not null,
  starred boolean default false not null,
  embedding vector(1536),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.opportunities (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  person_id uuid,
  title text not null,
  kind text,
  stage text default 'lead'::text not null,
  value_est numeric,
  next_step text,
  next_step_date date,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.people (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  name text not null,
  relationship text,
  last_contact date,
  cadence_days integer,
  birthday date,
  notes text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.people_contacts (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  person_id uuid not null,
  contacted_on date not null,
  note text,
  channel text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

-- `score` is nullable ON PURPOSE. NULL means "not yet scored"; 0 means
-- "scored, and it is that bad". The dashboard average ignores the first and
-- counts the second.
create table public.pillars (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  system text not null,
  name text not null,
  emoji text,
  standard text,
  colour text,
  sort_order integer default 0 not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null,
  purpose text,
  vision text,
  current text,
  glyph text,
  score integer,
  status_line text,
  focus_week date
);

create table public.projects (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  goal_id uuid,
  title text not null,
  description text,
  status text default 'active'::text not null,
  start_date date,
  due_date date,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null,
  venture_id uuid
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz default now() not null
);

create table public.reflections (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  on_date date not null,
  kind text not null,
  source text default 'voice'::text not null,
  transcript text,
  parsed jsonb default '{}'::jsonb not null,
  one_thing text,
  it_happened boolean,
  energy integer,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.reviews (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  kind text not null,
  period_start date not null,
  period_end date not null,
  wins text,
  friction text,
  next_focus text,
  pillar_scores jsonb default '{}'::jsonb not null,
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.seasons (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  kind text not null,
  started_on date default CURRENT_DATE not null,
  ended_on date,
  note text,
  created_at timestamptz default now() not null
);

create table public.skill_attempts (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  node_id text not null,
  on_date date not null,
  amount numeric not null,
  strict boolean default false not null,
  note text,
  created_at timestamptz default now() not null
);

-- Reference data, no user_id: a panel is a row, not a component.
create table public.smart_rules (
  key text not null,
  title text not null,
  body text not null,
  action_label text,
  action_href text,
  channel text default 'info'::text not null,
  priority integer default 50 not null,
  enabled boolean default true not null,
  builtin boolean default false not null,
  created_at timestamptz default now() not null
);

-- `do_date` is separate from `due_date` and the distinction is the whole
-- point: due is a fact about the world, do is a decision. Today/Week are
-- built from do_date, and the calendar only ever syncs do_date.
create table public.tasks (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  project_id uuid,
  pillar_id uuid,
  title text not null,
  notes text,
  due_date date,
  do_date date,
  energy text default 'medium'::text not null,
  status text default 'open'::text not null,
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null,
  priority text default 'Med'::text not null,
  duration_min integer,
  actual_min integer
);

create table public.training_sets (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  workout_id uuid not null,
  exercise_id text not null,
  amount numeric not null,
  load_kg numeric default 0 not null,
  rir integer,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.vehicles (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  name text not null,
  registration text,
  make_model text,
  tax_due date,
  mot_due date,
  insurance_due date,
  last_service date,
  next_service date,
  status text default 'active'::text not null,
  sort_order integer default 0 not null,
  notes text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.ventures (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  pillar_id uuid,
  name text not null,
  status text default 'active'::text not null,
  role text,
  stake_pct numeric,
  external_system text,
  external_url text,
  health integer,
  valuation numeric,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null,
  stage text default 'idea'::text not null,
  progress integer default 0 not null,
  one_liner text,
  sort_order integer default 0 not null,
  plan text,
  budget numeric,
  monthly_cost numeric,
  funding_route text,
  profile jsonb default '{}'::jsonb not null
);

create table public.vision (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  statement text,
  horizon_years integer,
  system text default 'both'::text not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);

create table public.workouts (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  on_date date not null,
  kind text default 'other'::text not null,
  minutes integer,
  rpe integer,
  notes text,
  created_at timestamptz default now() not null,
  meta jsonb default '{}'::jsonb not null
);


-- ============================================================================
-- PRIMARY KEYS
-- Five tables key on something other than a surrogate id, and each is a
-- deliberate idempotence guarantee rather than a saving: athlete_profile and
-- calendar_state are one row per user, habit_logs is one tick per habit per
-- day, health_days is one row per day, and the three reference tables key on
-- their own text key.
-- ============================================================================

alter table public.advisor_opinions add constraint advisor_opinions_pkey PRIMARY KEY (id);
alter table public.advisor_seats add constraint advisor_seats_pkey PRIMARY KEY (key);
alter table public.advisor_sessions add constraint advisor_sessions_pkey PRIMARY KEY (id);
alter table public.assets add constraint assets_pkey PRIMARY KEY (id);
-- One profile per user, so there is no way to end up with two.
alter table public.athlete_profile add constraint athlete_profile_pkey PRIMARY KEY (user_id);
alter table public.body_measurements add constraint body_measurements_pkey PRIMARY KEY (id);
alter table public.calendar_events add constraint calendar_events_pkey PRIMARY KEY (id);
alter table public.calendar_state add constraint calendar_state_pkey PRIMARY KEY (user_id);
alter table public.calendar_sync add constraint calendar_sync_pkey PRIMARY KEY (id);
alter table public.capture_proposals add constraint capture_proposals_pkey PRIMARY KEY (id);
alter table public.captures add constraint captures_pkey PRIMARY KEY (id);
alter table public.cog_checkins add constraint cog_checkins_pkey PRIMARY KEY (id);
alter table public.cog_config add constraint cog_config_pkey PRIMARY KEY (id);
alter table public.cog_events add constraint cog_events_pkey PRIMARY KEY (id);
alter table public.cog_feedback add constraint cog_feedback_pkey PRIMARY KEY (id);
alter table public.cog_identity add constraint cog_identity_pkey PRIMARY KEY (id);
alter table public.cog_pulses add constraint cog_pulses_pkey PRIMARY KEY (id);
alter table public.cog_states add constraint cog_states_pkey PRIMARY KEY (id);
alter table public.cog_telemetry add constraint cog_telemetry_pkey PRIMARY KEY (id);
alter table public.debt_payments add constraint debt_payments_pkey PRIMARY KEY (id);
alter table public.debts add constraint debts_pkey PRIMARY KEY (id);
alter table public.diagnostic_runs add constraint diagnostic_runs_pkey PRIMARY KEY (id);
alter table public.drive_folders add constraint drive_folders_pkey PRIMARY KEY (key);
alter table public.finishes add constraint finishes_pkey PRIMARY KEY (id);
alter table public.goals add constraint goals_pkey PRIMARY KEY (id);
-- Ticking a habit twice on the same day records one tick, not two.
alter table public.habit_logs add constraint habit_logs_pkey PRIMARY KEY (habit_id, done_on);
alter table public.habits add constraint habits_pkey PRIMARY KEY (id);
-- One health row per day, so an upsert updates rather than duplicating.
alter table public.health_days add constraint health_days_pkey PRIMARY KEY (user_id, on_date);
alter table public.inbox add constraint inbox_pkey PRIMARY KEY (id);
alter table public.integrations add constraint integrations_pkey PRIMARY KEY (id);
alter table public.investments add constraint investments_pkey PRIMARY KEY (id);
alter table public.journal add constraint journal_pkey PRIMARY KEY (id);
alter table public.lifts add constraint lifts_pkey PRIMARY KEY (id);
alter table public.links add constraint links_pkey PRIMARY KEY (id);
alter table public.meal_ingredients add constraint meal_ingredients_pkey PRIMARY KEY (id);
alter table public.meals add constraint meals_pkey PRIMARY KEY (id);
alter table public.metric_readings add constraint metric_readings_pkey PRIMARY KEY (id);
alter table public.metrics add constraint metrics_pkey PRIMARY KEY (id);
alter table public.notes add constraint notes_pkey PRIMARY KEY (id);
alter table public.opportunities add constraint opportunities_pkey PRIMARY KEY (id);
alter table public.people add constraint people_pkey PRIMARY KEY (id);
alter table public.people_contacts add constraint people_contacts_pkey PRIMARY KEY (id);
alter table public.pillars add constraint pillars_pkey PRIMARY KEY (id);
alter table public.projects add constraint projects_pkey PRIMARY KEY (id);
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
alter table public.reflections add constraint reflections_pkey PRIMARY KEY (id);
alter table public.reviews add constraint reviews_pkey PRIMARY KEY (id);
alter table public.seasons add constraint seasons_pkey PRIMARY KEY (id);
alter table public.skill_attempts add constraint skill_attempts_pkey PRIMARY KEY (id);
alter table public.smart_rules add constraint smart_rules_pkey PRIMARY KEY (key);
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.training_sets add constraint training_sets_pkey PRIMARY KEY (id);
alter table public.vehicles add constraint vehicles_pkey PRIMARY KEY (id);
alter table public.ventures add constraint ventures_pkey PRIMARY KEY (id);
alter table public.vision add constraint vision_pkey PRIMARY KEY (id);
alter table public.workouts add constraint workouts_pkey PRIMARY KEY (id);


-- ============================================================================
-- UNIQUE CONSTRAINTS
-- Every one of these exists to make a repeated action idempotent rather than
-- to save space: recording the same thing twice should update, not duplicate.
-- ============================================================================

-- One measurement set per day.
alter table public.body_measurements add constraint body_measurements_user_id_on_date_key UNIQUE (user_id, on_date);
alter table public.calendar_events add constraint calendar_events_user_id_google_id_key UNIQUE (user_id, google_id);
alter table public.calendar_sync add constraint calendar_sync_google_cal_id_google_event_id_key UNIQUE (google_cal_id, google_event_id);
alter table public.cog_checkins add constraint cog_checkins_user_id_date_key UNIQUE (user_id, date);
alter table public.cog_states add constraint cog_states_user_id_date_key UNIQUE (user_id, date);
alter table public.integrations add constraint integrations_user_id_provider_key UNIQUE (user_id, provider);
alter table public.journal add constraint journal_user_id_entry_date_key UNIQUE (user_id, entry_date);
alter table public.links add constraint links_from_type_from_id_to_type_to_id_relation_key UNIQUE (from_type, from_id, to_type, to_id, relation);
alter table public.meals add constraint meals_user_id_slug_key UNIQUE (user_id, slug);
-- The one-tap contact log: tapping twice on the same day is one conversation.
alter table public.people_contacts add constraint people_contacts_person_id_contacted_on_key UNIQUE (person_id, contacted_on);
-- Re-enabling push on the same device updates the row, never duplicates it.
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key UNIQUE (endpoint);
-- Re-recording an evening close REPLACES it rather than sitting beside it.
alter table public.reflections add constraint reflections_user_id_on_date_kind_key UNIQUE (user_id, on_date, kind);
alter table public.reviews add constraint reviews_user_id_kind_period_start_key UNIQUE (user_id, kind, period_start);
alter table public.skill_attempts add constraint skill_attempts_user_id_node_id_on_date_key UNIQUE (user_id, node_id, on_date);


-- ============================================================================
-- FOREIGN KEYS
--
-- 32 of the 56 tables carry `user_id -> auth.users`. TWENTY-FOUR DO NOT: every
-- cog_* one, plus debts, debt_payments, vehicles, meals, meal_ingredients,
-- seasons, finishes, diagnostic_runs, skill_attempts, training_sets,
-- athlete_profile, push_subscriptions and body_measurements — and the three
-- reference tables, which have no user_id column at all and so are a different
-- case entirely.
--
-- This is NOT a security hole — RLS still scopes every one of them to
-- auth.uid(). It is an INTEGRITY gap: deleting the auth user would
-- cascade-clean 32 tables and orphan the rest. With one user it is
-- theoretical. Recorded rather than fixed, because twenty-odd FKs is a
-- migration with real locking consequences and should be a decision.
-- ============================================================================

alter table public.advisor_opinions add constraint advisor_opinions_seat_key_fkey FOREIGN KEY (seat_key) REFERENCES advisor_seats(key);
alter table public.advisor_opinions add constraint advisor_opinions_session_id_fkey FOREIGN KEY (session_id) REFERENCES advisor_sessions(id) ON DELETE CASCADE;
alter table public.advisor_opinions add constraint advisor_opinions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.advisor_sessions add constraint advisor_sessions_reflection_id_fkey FOREIGN KEY (reflection_id) REFERENCES reflections(id) ON DELETE SET NULL;
alter table public.advisor_sessions add constraint advisor_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.assets add constraint assets_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.assets add constraint assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.assets add constraint assets_venture_id_fkey FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE SET NULL;
alter table public.calendar_events add constraint calendar_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
alter table public.calendar_events add constraint calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.calendar_state add constraint calendar_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.calendar_sync add constraint calendar_sync_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table public.calendar_sync add constraint calendar_sync_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.capture_proposals add constraint capture_proposals_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE;
alter table public.capture_proposals add constraint capture_proposals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.captures add constraint captures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.debt_payments add constraint debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE;
alter table public.debts add constraint debts_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.debts add constraint debts_venture_id_fkey FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE SET NULL;
alter table public.goals add constraint goals_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.goals add constraint goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.goals add constraint goals_vision_id_fkey FOREIGN KEY (vision_id) REFERENCES vision(id) ON DELETE SET NULL;
alter table public.habit_logs add constraint habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE;
alter table public.habit_logs add constraint habit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.habits add constraint habits_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.habits add constraint habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.health_days add constraint health_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.inbox add constraint inbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.integrations add constraint integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.investments add constraint investments_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.investments add constraint investments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.journal add constraint journal_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.lifts add constraint lifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.links add constraint links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.meal_ingredients add constraint meal_ingredients_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE;
alter table public.metric_readings add constraint metric_readings_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE;
alter table public.metric_readings add constraint metric_readings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.metrics add constraint metrics_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.metrics add constraint metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notes add constraint notes_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.notes add constraint notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.opportunities add constraint opportunities_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL;
alter table public.opportunities add constraint opportunities_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.opportunities add constraint opportunities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.people add constraint people_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.people add constraint people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.people_contacts add constraint people_contacts_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
alter table public.people_contacts add constraint people_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.pillars add constraint pillars_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.projects add constraint projects_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL;
alter table public.projects add constraint projects_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.projects add constraint projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.projects add constraint projects_venture_id_fkey FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE SET NULL;
alter table public.reflections add constraint reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reviews add constraint reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
alter table public.tasks add constraint tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.training_sets add constraint training_sets_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE;
alter table public.vehicles add constraint vehicles_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.ventures add constraint ventures_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES pillars(id) ON DELETE SET NULL;
alter table public.ventures add constraint ventures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.vision add constraint vision_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.workouts add constraint workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================================
-- CHECK CONSTRAINTS
--
-- Note which columns are checked and which are not. tasks.status and
-- tasks.priority ARE constrained; goals.status and projects.status are NOT —
-- they are free text defaulting to 'active', and ItemStatus is a convention
-- the app upholds rather than something the database enforces. Treat values
-- read back from those two as possibly outside the union.
--
-- Every nullable numeric check is written `x IS NULL OR ...`, so a skipped
-- answer stays skipped rather than being forced to zero.
-- ============================================================================

alter table public.advisor_opinions add constraint advisor_opinions_position_check CHECK (("position" = ANY (ARRAY['for'::text, 'against'::text, 'abstain'::text])));
alter table public.advisor_sessions add constraint advisor_sessions_kind_check CHECK ((kind = ANY (ARRAY['board'::text, 'nightly'::text, 'weekly'::text])));
alter table public.calendar_events add constraint calendar_events_origin_check CHECK ((origin = ANY (ARRAY['google'::text, 'brain'::text])));
alter table public.calendar_events add constraint calendar_events_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text])));
alter table public.capture_proposals add constraint capture_proposals_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text])));
alter table public.capture_proposals add constraint capture_proposals_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'rejected'::text, 'applied'::text, 'failed'::text])));
-- THIS ONE BIT. The capture doors speak photo|document and this column does
-- not, so every real capture failed its constraint and fell back to the plain
-- inbox until captureSource() was added as the seam between the two.
alter table public.captures add constraint captures_source_check CHECK ((source = ANY (ARRAY['upload'::text, 'camera'::text, 'email'::text, 'cowork'::text, 'sheet'::text])));
alter table public.captures add constraint captures_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'extracted'::text, 'confirmed'::text, 'rejected'::text, 'failed'::text])));
alter table public.cog_checkins add constraint cog_checkins_energy_band_check CHECK (((energy_band >= 1) AND (energy_band <= 5)));
alter table public.cog_checkins add constraint cog_checkins_intent_check CHECK ((char_length(intent) <= 140));
alter table public.cog_checkins add constraint cog_checkins_sleep_band_check CHECK (((sleep_band >= 1) AND (sleep_band <= 5)));
alter table public.cog_feedback add constraint cog_feedback_target_kind_check CHECK ((target_kind = ANY (ARRAY['pulse'::text, 'priority'::text, 'focus-slot'::text, 'micro-action'::text])));
alter table public.cog_feedback add constraint cog_feedback_verdict_check CHECK ((verdict = ANY (ARRAY['accepted'::text, 'modified'::text, 'rejected'::text])));
alter table public.cog_pulses add constraint cog_pulses_verdict_check CHECK ((verdict = ANY (ARRAY['accepted'::text, 'modified'::text, 'rejected'::text, 'expired'::text])));
alter table public.cog_states add constraint cog_states_momentum_check CHECK (((momentum >= 0) AND (momentum <= 100)));
alter table public.cog_states add constraint cog_states_season_check CHECK ((season = ANY (ARRAY['quiet'::text, 'busy'::text, 'minimum'::text])));
alter table public.debt_payments add constraint debt_payments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'paid'::text, 'missed'::text])));
alter table public.debts add constraint debts_amounts_check CHECK ((((current_balance IS NULL) OR (current_balance >= (0)::numeric)) AND ((original_amount IS NULL) OR (original_amount >= (0)::numeric)) AND ((plan_amount IS NULL) OR (plan_amount >= (0)::numeric))));
alter table public.debts add constraint debts_frequency_check CHECK (((plan_frequency IS NULL) OR (plan_frequency = ANY (ARRAY['weekly'::text, 'fortnightly'::text, 'monthly'::text]))));
alter table public.debts add constraint debts_kind_check CHECK ((kind = ANY (ARRAY['council_tax'::text, 'credit'::text, 'utility'::text, 'vehicle'::text, 'benefit'::text, 'other'::text])));
alter table public.debts add constraint debts_plan_day_check CHECK (((plan_day IS NULL) OR ((plan_day >= 1) AND (plan_day <= 31))));
alter table public.diagnostic_runs add constraint diagnostic_runs_kind_check CHECK ((kind = ANY (ARRAY['triage'::text, 'deep'::text])));
alter table public.diagnostic_runs add constraint diagnostic_runs_score_check CHECK (((score >= 0) AND (score <= 100)));
alter table public.diagnostic_runs add constraint diagnostic_runs_subject_type_check CHECK ((subject_type = ANY (ARRAY['venture'::text, 'area'::text])));
alter table public.finishes add constraint finishes_kind_check CHECK ((kind = ANY (ARRAY['milestone'::text, 'debt'::text, 'property'::text, 'sop'::text, 'venture'::text, 'other'::text])));
-- The tracker is a fixed four, not a free exercise log. A free log is a
-- second app; four movements is a strength record.
alter table public.lifts add constraint lifts_movement_check CHECK ((movement = ANY (ARRAY['squat'::text, 'bench'::text, 'deadlift'::text, 'press'::text])));
alter table public.lifts add constraint lifts_reps_check CHECK ((reps >= 1));
alter table public.pillars add constraint pillars_score_check CHECK (((score IS NULL) OR ((score >= 0) AND (score <= 10))));
alter table public.reflections add constraint reflections_energy_check CHECK (((energy >= 1) AND (energy <= 5)));
alter table public.reflections add constraint reflections_kind_check CHECK ((kind = ANY (ARRAY['morning'::text, 'evening'::text])));
alter table public.reflections add constraint reflections_source_check CHECK ((source = ANY (ARRAY['voice'::text, 'tap'::text, 'typed'::text])));
alter table public.seasons add constraint seasons_check CHECK (((ended_on IS NULL) OR (ended_on >= started_on)));
alter table public.seasons add constraint seasons_kind_check CHECK ((kind = ANY (ARRAY['quiet'::text, 'busy'::text, 'minimum'::text])));
alter table public.skill_attempts add constraint skill_attempts_amount_check CHECK ((amount > (0)::numeric));
alter table public.smart_rules add constraint smart_rules_channel_check CHECK ((channel = ANY (ARRAY['good'::text, 'warn'::text, 'bad'::text, 'info'::text])));
alter table public.tasks add constraint tasks_actual_min_check CHECK (((actual_min IS NULL) OR ((actual_min > 0) AND (actual_min <= 1440))));
alter table public.tasks add constraint tasks_duration_min_check CHECK (((duration_min IS NULL) OR ((duration_min > 0) AND (duration_min <= 1440))));
alter table public.tasks add constraint tasks_priority_check CHECK ((priority = ANY (ARRAY['High'::text, 'Med'::text, 'Low'::text])));
alter table public.tasks add constraint tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'doing'::text, 'done'::text, 'dropped'::text, 'waiting'::text])));
alter table public.training_sets add constraint training_sets_amount_check CHECK ((amount > (0)::numeric));
alter table public.training_sets add constraint training_sets_rir_check CHECK (((rir IS NULL) OR ((rir >= 0) AND (rir <= 10))));
alter table public.ventures add constraint ventures_money_check CHECK ((((budget IS NULL) OR (budget >= (0)::numeric)) AND ((monthly_cost IS NULL) OR (monthly_cost >= (0)::numeric))));
alter table public.ventures add constraint ventures_progress_check CHECK (((progress >= 0) AND (progress <= 100)));
alter table public.ventures add constraint ventures_stage_check CHECK ((stage = ANY (ARRAY['idea'::text, 'research'::text, 'stabilise'::text, 'launch'::text, 'revenue'::text])));
alter table public.workouts add constraint workouts_rpe_check CHECK (((rpe IS NULL) OR ((rpe >= 1) AND (rpe <= 10))));


-- ============================================================================
-- INDEXES
--
-- The partial unique ones are business rules wearing an index: exactly one
-- keystone habit, exactly one open season, one calendar event per task.
-- There is NO vector index on either embedding column — see the note at the
-- top about retrieval being word matching on purpose.
-- ============================================================================

CREATE INDEX advisor_opinions_session_idx ON public.advisor_opinions USING btree (session_id);
CREATE INDEX advisor_sessions_recent_idx ON public.advisor_sessions USING btree (user_id, created_at DESC);
CREATE INDEX calendar_events_day_idx ON public.calendar_events USING btree (user_id, starts_at) WHERE (status = 'confirmed'::text);
CREATE INDEX calendar_sync_conflict_idx ON public.calendar_sync USING btree (user_id) WHERE conflict;
-- One calendar event per task.
CREATE UNIQUE INDEX calendar_sync_user_task_uniq ON public.calendar_sync USING btree (user_id, task_id) WHERE (task_id IS NOT NULL);
CREATE INDEX capture_proposals_capture_idx ON public.capture_proposals USING btree (capture_id, status);
CREATE INDEX capture_proposals_open_idx ON public.capture_proposals USING btree (user_id, status) WHERE (status = 'proposed'::text);
CREATE INDEX captures_user_status_idx ON public.captures USING btree (user_id, status, captured_at DESC);
CREATE INDEX cog_events_undelivered_idx ON public.cog_events USING btree (user_id, occurred_at) WHERE (NOT delivered);
CREATE INDEX cog_feedback_created_idx ON public.cog_feedback USING btree (user_id, created_at);
CREATE INDEX cog_pulses_date_idx ON public.cog_pulses USING btree (user_id, date);
CREATE INDEX debt_payments_due_idx ON public.debt_payments USING btree (user_id, status, due_on);
CREATE UNIQUE INDEX debts_user_creditor_key ON public.debts USING btree (user_id, lower(creditor));
CREATE INDEX debts_user_status_idx ON public.debts USING btree (user_id, status, sort_order);
CREATE INDEX diagnostic_runs_subject ON public.diagnostic_runs USING btree (user_id, subject_type, subject_id, started_at DESC);
CREATE INDEX finishes_by_date ON public.finishes USING btree (user_id, happened_on DESC);
CREATE INDEX goals_user_id_status_idx ON public.goals USING btree (user_id, status);
CREATE INDEX habit_logs_user_id_done_on_idx ON public.habit_logs USING btree (user_id, done_on);
-- One keystone habit per user, enforced rather than assumed.
CREATE UNIQUE INDEX habits_one_keystone ON public.habits USING btree (user_id) WHERE keystone;
CREATE INDEX inbox_user_id_status_idx ON public.inbox USING btree (user_id, status);
CREATE INDEX lifts_user_movement_idx ON public.lifts USING btree (user_id, movement, on_date DESC);
CREATE INDEX links_user_id_from_type_from_id_idx ON public.links USING btree (user_id, from_type, from_id);
CREATE INDEX links_user_id_to_type_to_id_idx ON public.links USING btree (user_id, to_type, to_id);
CREATE INDEX meal_ingredients_by_meal ON public.meal_ingredients USING btree (meal_id, sort_order);
CREATE INDEX meals_by_protein ON public.meals USING btree (user_id, protein_g DESC);
CREATE INDEX meals_by_time ON public.meals USING btree (user_id, ((COALESCE(prep_min, 0) + COALESCE(cook_min, 0))));
-- One debt reading per day: this is the uniqueness CLAUDE.md describes, and it
-- is what makes a trend line possible without a de-duplication pass.
CREATE UNIQUE INDEX metric_readings_metric_day_uidx ON public.metric_readings USING btree (metric_id, taken_on);
CREATE INDEX notes_user_id_pillar_id_idx ON public.notes USING btree (user_id, pillar_id);
CREATE INDEX people_contacts_user_date_idx ON public.people_contacts USING btree (user_id, contacted_on DESC);
CREATE INDEX people_user_id_last_contact_idx ON public.people USING btree (user_id, last_contact);
CREATE INDEX projects_user_id_status_idx ON public.projects USING btree (user_id, status);
CREATE INDEX projects_venture_idx ON public.projects USING btree (user_id, venture_id);
CREATE INDEX reflections_recent_idx ON public.reflections USING btree (user_id, on_date DESC);
CREATE INDEX seasons_history ON public.seasons USING btree (user_id, started_on DESC);
-- One open season at a time.
CREATE UNIQUE INDEX seasons_one_open ON public.seasons USING btree (user_id) WHERE (ended_on IS NULL);
CREATE INDEX skill_attempts_by_node ON public.skill_attempts USING btree (user_id, node_id, on_date DESC);
CREATE INDEX tasks_kanban_idx ON public.tasks USING btree (user_id, status, priority);
CREATE INDEX tasks_user_id_do_date_idx ON public.tasks USING btree (user_id, do_date) WHERE (status = 'open'::text);
CREATE INDEX tasks_user_id_pillar_id_idx ON public.tasks USING btree (user_id, pillar_id);
CREATE INDEX tasks_user_id_status_idx ON public.tasks USING btree (user_id, status);
CREATE INDEX training_sets_by_exercise ON public.training_sets USING btree (user_id, exercise_id);
CREATE INDEX training_sets_by_workout ON public.training_sets USING btree (workout_id, sort_order);
CREATE UNIQUE INDEX vehicles_user_name_key ON public.vehicles USING btree (user_id, lower(name));
CREATE INDEX vehicles_user_status_idx ON public.vehicles USING btree (user_id, status, sort_order);
CREATE INDEX ventures_stage_sort_idx ON public.ventures USING btree (user_id, stage, sort_order);
CREATE UNIQUE INDEX ventures_user_name_key ON public.ventures USING btree (user_id, lower(name));
CREATE INDEX workouts_user_date_idx ON public.workouts USING btree (user_id, on_date DESC);


-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Verified 2026-08-18 by reading pg_class.relrowsecurity and pg_policies.
-- RLS is ON for all 56 tables and every table has EXACTLY ONE policy.
--
-- FIFTY-THREE ARE THE SAME SHAPE, byte-identical in predicate:
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id)
-- They carry two different NAMES — 37 are called `own` and 16 `own rows` —
-- which is cosmetic drift between migrations, not a difference in effect. It
-- is recorded rather than tidied because renaming a policy is a migration and
-- a rename that changed a predicate by accident would be far worse than two
-- names.
--
-- THREE ARE DELIBERATELY DIFFERENT: advisor_seats, drive_folders and
-- smart_rules carry `read_all` — SELECT only, granted to `authenticated`
-- only, USING (true). They hold no user data (ten advisor seats, 22 Drive
-- folder ids, six panel definitions) and have no user_id column, so the
-- uniform policy could not apply even in principle. No INSERT/UPDATE/DELETE
-- policy exists on any of them, so with RLS on, every write is denied and
-- `anon` cannot read them either.
-- ============================================================================

-- The 53 owner-scoped tables, shown once rather than repeated 53 times:
--
--   alter table public.<t> enable row level security;
--   create policy "own" on public.<t> for all
--     using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The three reference tables:
--
--   alter table public.<t> enable row level security;
--   create policy "read_all" on public.<t> for select to authenticated
--     using (true);


-- ============================================================================
-- FUNCTIONS
--
-- There are THREE project functions and ONE of them is SECURITY DEFINER.
-- This section said "exactly two and neither is SECURITY DEFINER" until
-- 2026-08-18 and had been wrong since 17 August, which is the exact class of
-- claim this file exists to stop being wrong.
--
--   seed_pillars()            INVOKER, search_path = public, pg_temp
--   cog_prune()               INVOKER, search_path NOT pinned
--   apply_capture_proposal()  DEFINER, search_path = public, pg_catalog
--
-- apply_capture_proposal is DEFINER of necessity: writing an accepted
-- proposal into a real table is the privileged step, and it is the single
-- seam every proposal crosses whatever produced it. It is hardened the way
-- such a function must be — search_path pinned, a table whitelist, ownership
-- re-checked inside, and EXECUTE revoked from public and anon.
--
-- Worth watching because the sibling COG repo has repeatedly been bitten by
-- SECURITY DEFINER functions silently re-granting EXECUTE to PUBLIC.
--
-- The remaining asymmetry: cog_prune() does not pin search_path where the
-- other two do. Being INVOKER that is a hardening note rather than a hole.
--
-- seed_pillars() is idempotent: it returns early if the caller already has
-- pillars, so calling it on every sign-in is safe.
-- ============================================================================

-- Bodies are not reproduced here; they are byte-exact in the migrations that
-- created them:
--   seed_pillars            20260730121836_harden_seed_pillars_search_path.sql
--   cog_prune               20260812172334_cog_core.sql
--   apply_capture_proposal  20260817171302_capture_proposal_task_vocabulary.sql


-- ============================================================================
-- TRIGGERS
-- There are none. Every derived value in this system is computed at read time
-- in src/lib/logic.ts, which is why the tests can cover it without a database.
-- ============================================================================


-- ============================================================================
-- MIGRATIONS APPLIED (33, in order) — from supabase_migrations.schema_migrations
--
-- ALL 33 are committed to supabase/migrations/, one file each, named
-- <version>_<name>.sql to match this list exactly. THIRTY-TWO are byte-exact
-- captures of schema_migrations.statements[1], verified on 2026-08-18 by MD5
-- against the source rather than by character count. The exception is `meals`,
-- whose file also carries the fifty-meal seed applied separately. See
-- supabase/README.md.
--
--   20260729124821  the_brain_v2_initial_schema
--   20260730120555  the_brain_os_v1_full_schema
--   20260730121836  harden_seed_pillars_search_path
--   20260730125114  planner_kanban_and_richer_areas
--   20260731140303  add_vehicles_pillar_thirteen_areas
--   20260731144403  empire_os_venture_stages
--   20260801001120  life_os_area_scores_and_debt_metric
--   20260801135728  debts_and_vehicles
--   20260805140849  venture_profiles_and_plans
--   20260806131904  calendar_integration
--   20260810141521  people_contacts_and_tiers
--   20260810142029  debt_apr_and_savings_metric
--   20260810143630  health_hub_readiness_lifts_nutrition
--   20260811132750  diagnostic_runs
--   20260811144513  task_duration_minutes
--   20260811144907  task_actual_minutes
--   20260811173717  seasons
--   20260811174800  finishes
--   20260811222457  meals
--   20260812123125  recurring_debts_and_keystone_habit
--   20260812142217  training_sets_skill_attempts_athlete_profile
--   20260812172334  cog_core
--   20260817152936  capture_attachments
--   20260817155308  push_subscriptions
--   20260817164204  capture_engine
--   20260817164217  capture_engine_storage
--   20260817164249  capture_engine_apply_fn
--   20260817164424  capture_engine_revoke_anon
--   20260817164841  capture_drive_folders
--   20260817171302  capture_proposal_task_vocabulary
--   20260817185247  command_centre_smart_rules_calendar
--   20260817190447  reflection_and_advisor
--   20260818163652  body_measurements
--
-- DO NOT RE-APPLY ANY OF THEM. Several are destructive if re-run:
-- 20260730120555 opens with six `drop table ... cascade`, and 20260811222457
-- would duplicate all 387 ingredient rows.
-- ============================================================================


-- ============================================================================
-- ROW COUNTS AT CAPTURE (2026-08-18)
--
-- Recorded because "the table exists" and "the feature is in use" are
-- different facts, and this file is the only place both are visible at once.
-- A table at 0 is a feature built and not yet fed.
--
--   advisor_opinions           0
--   advisor_seats             10
--   advisor_sessions           0
--   assets                     7
--   athlete_profile            0
--   body_measurements          0
--   calendar_events            0
--   calendar_state             0
--   calendar_sync              0
--   capture_proposals          0
--   captures                   1
--   cog_checkins               0
--   cog_config                 1
--   cog_events                 0
--   cog_feedback               0
--   cog_identity               0
--   cog_pulses                 0
--   cog_states                 0
--   cog_telemetry              0
--   debt_payments              0
--   debts                      8
--   diagnostic_runs            1
--   drive_folders             22
--   finishes                   1
--   goals                      0
--   habit_logs                 2
--   habits                     6
--   health_days                0
--   inbox                     12
--   integrations               0
--   investments                0
--   journal                    3
--   lifts                      0
--   links                      0
--   meal_ingredients         387
--   meals                     50
--   metric_readings            0
--   metrics                    7
--   notes                     12
--   opportunities              0
--   people                     3
--   people_contacts            0
--   pillars                   13
--   projects                   3
--   push_subscriptions         0
--   reflections                0
--   reviews                    0
--   seasons                    1
--   skill_attempts             0
--   smart_rules                6
--   tasks                     20
--   training_sets              0
--   vehicles                   4
--   ventures                  18
--   vision                     1
--   workouts                   0
--
-- ⚠️  metric_readings IS DELIBERATELY EMPTY FOR DEBT. DO NOT SEED IT.
-- An earlier session recorded £8,317 there and the dashboard presented it as
-- a total. Jay confirmed on 2026-08-01 that it covers only SOME of his
-- creditors. The reading was deleted and metrics.meta carries a note saying
-- why. The debt figure is summed from public.debts and is flagged incomplete
-- while any active debt has a null balance.
--
-- integrations at 0 means Google Calendar has never been connected, and
-- calendar_events / calendar_state at 0 follow from that rather than being a
-- separate fact. reflections at 0 means /reflect has been built but not yet
-- used — the ritual the whole design exists to make openable.
-- ============================================================================
