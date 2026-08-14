-- THE COG — core tables. Same conventions as the rest of THE BRAIN:
-- uuid pks, user_id + single-owner RLS, meta jsonb.
--
-- COG owns these eight tables and NOTHING else. Every BRAIN table is read
-- only, with one narrow exception documented in the integration doc: on an
-- ACCEPTED verdict it may set tasks.do_date / priority / meta.cog. A human
-- edit always wins and is recorded as feedback rather than a conflict.

-- The optional sharper read. Jay's check-in is NIGHTLY (LIFE_OS v2), so the
-- morning bands are normally DERIVED from last night's journal + health_days.
-- This table exists for the day he wants to override that with a live answer;
-- the adapter prefers a row here when one exists and derives when it does not.
create table if not exists cog_checkins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  date         date not null,
  energy_band  int  not null check (energy_band between 1 and 5),
  sleep_band   int  check (sleep_band between 1 and 5),
  intent       text check (char_length(intent) <= 140),
  created_at   timestamptz not null default now(),
  meta         jsonb not null default '{}',
  unique (user_id, date)
);

-- One row per day: the normalized state the engine ran on, plus its score.
-- Persisting the STATE (not just the advice) is what makes every past
-- recommendation reproducible — the determinism claim is auditable.
create table if not exists cog_states (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  date           date not null,
  season         text not null check (season in ('quiet','busy','minimum')),
  momentum       int  check (momentum between 0 and 100),
  missing_inputs text[] not null default '{}',
  state          jsonb not null,
  built_at       timestamptz not null default now(),
  unique (user_id, date)
);

-- Every pulse issued, awaiting or holding a verdict.
create table if not exists cog_pulses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  date           date not null,
  kind           text not null,
  ref_id         text,
  message        text not null,
  rationale      text not null,
  rule_trace     jsonb not null default '[]',
  correlation_id text not null,
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz,
  verdict        text check (verdict in ('accepted','modified','rejected','expired'))
);
create index if not exists cog_pulses_date_idx on cog_pulses (user_id, date);

-- Verdicts. The pilot's acceptance metric, and the training data any future
-- learned weights would need. Nothing depends on it in v1.
create table if not exists cog_feedback (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  target_kind    text not null check (target_kind in ('pulse','priority','focus-slot','micro-action')),
  target_id      text not null,
  verdict        text not null check (verdict in ('accepted','modified','rejected')),
  modification   jsonb,
  correlation_id text,
  created_at     timestamptz not null default now()
);
create index if not exists cog_feedback_created_idx on cog_feedback (user_id, created_at);

-- Weights and thresholds, editable without a redeploy.
create table if not exists cog_config (
  id         text primary key default 'default',
  user_id    uuid not null default auth.uid(),
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

-- Identity statements per pillar. pillars.standard stays the source of the
-- standard itself; this is the weighting Jay puts on each.
create table if not exists cog_identity (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid(),
  keystone_habit_id     uuid,
  deep_work_start       time not null default '08:30',
  deep_work_end         time not null default '12:30',
  statements            jsonb not null default '[]',
  alignment_window_days int not null default 7,
  updated_at            timestamptz not null default now()
);

-- Outbox for two-way sync. Immutable.
create table if not exists cog_events (
  id             text primary key,
  user_id        uuid not null default auth.uid(),
  type           text not null,
  occurred_at    timestamptz not null default now(),
  correlation_id text,
  causation_id   text,
  actor          text not null default 'cog-engine',
  version        int  not null default 1,
  payload        jsonb not null default '{}',
  delivered      boolean not null default false,
  dead           boolean not null default false
);
create index if not exists cog_events_undelivered_idx on cog_events (user_id, occurred_at) where not delivered;

-- Counts and latencies only. Never content.
create table if not exists cog_telemetry (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  metric  text not null,
  label   text,
  value   numeric not null,
  at      timestamptz not null default now()
);

-- Single-owner RLS on every table, as everywhere else in THE BRAIN.
do $$
declare t text;
begin
  foreach t in array array['cog_checkins','cog_states','cog_pulses','cog_feedback',
                           'cog_config','cog_identity','cog_events','cog_telemetry'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'own rows') then
      execute format(
        'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;

-- Retention. Run nightly.
create or replace function cog_prune() returns void language sql as $$
  delete from cog_pulses    where issued_at  < now() - interval '180 days';
  delete from cog_feedback  where created_at < now() - interval '180 days';
  delete from cog_telemetry where at         < now() - interval '90 days';
$$;
