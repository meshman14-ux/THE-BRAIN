-- THE COG — core tables.  APPLIED 12 Aug 2026 (migration name: cog_core).
--
-- Same conventions as the rest of THE BRAIN: uuid pks, user_id + single-owner
-- RLS, meta jsonb.  COG owns these eight tables and NOTHING else.  Every BRAIN
-- table is READ ONLY to it, with one narrow exception: on an ACCEPTED verdict
-- it may set tasks.do_date / tasks.priority / tasks.meta.cog.  A human edit
-- always wins and is recorded as feedback rather than treated as a conflict.
--
-- Two departures from the blueprint's 0001_cog_core.sql, both deliberate:
--
--   · `if not exists` throughout, and the RLS policy loop checks pg_policies
--     first, so re-applying this file is safe.
--   · cog_config is seeded separately rather than inline, because
--     `default auth.uid()` evaluates to NULL under a migration connection and
--     an unowned config row is invisible to RLS forever after.

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
comment on table cog_checkins is
  'The OPTIONAL sharper read. Jay''s check-in is nightly (LIFE_OS v2), so the '
  'morning bands are normally derived from last night''s journal + health_days. '
  'A row here overrides that derivation for its date.';

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
comment on table cog_states is
  'The normalized state the engine ran on, not just its output. Persisting the '
  'INPUT is what makes the determinism claim auditable: any past day can be '
  'replayed through the engine and must produce byte-identical advice.';

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
comment on table cog_feedback is
  'The pilot acceptance metric, and the training data any future learned '
  'weights would need. Nothing in v1 depends on it — that is the point.';

create table if not exists cog_config (
  id         text primary key default 'default',
  user_id    uuid not null default auth.uid(),
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

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
create index if not exists cog_events_undelivered_idx
  on cog_events (user_id, occurred_at) where not delivered;

create table if not exists cog_telemetry (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  metric  text not null,
  label   text,
  value   numeric not null,
  at      timestamptz not null default now()
);
comment on table cog_telemetry is 'Counts and latencies only. Never content.';

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

create or replace function cog_prune() returns void language sql as $$
  delete from cog_pulses    where issued_at  < now() - interval '180 days';
  delete from cog_feedback  where created_at < now() - interval '180 days';
  delete from cog_telemetry where at         < now() - interval '90 days';
$$;

-- Seeded after the fact, owned by the real user (see the note at the top).
--   insert into cog_config (id, user_id, config)
--   select 'default', (select id from auth.users limit 1), '{ …defaults… }'::jsonb
--   where not exists (select 1 from cog_config where id = 'default');
