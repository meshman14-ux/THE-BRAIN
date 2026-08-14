-- HYBRID's persistence layer. Additive only: workouts, lifts and
-- health_days are untouched.
--
-- `workouts` already carries the session (on_date, kind, minutes, rpe) and
-- its `kind` is free text, so it holds HYBRID's SessionKind as-is. What it
-- cannot hold is the sets, so training_sets hangs off it.
--
-- `lifts` stays what it is: the Big 4 tracker, its movement column
-- constrained to squat/bench/deadlift/press. It is deliberately NOT reused
-- as the set log — a free exercise log is a different feature needing a
-- different shape, exactly as CLAUDE.md says.

create table training_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  workout_id  uuid not null references workouts on delete cascade,
  -- An id from the hybrid library (ex.pull_up). Text rather than a foreign
  -- key because the library ships in the repo, not the database: the engine
  -- owns the movement vocabulary and the database records what was done.
  exercise_id text not null,
  -- Reps, seconds, metres — whatever the exercise's own unit says.
  amount      numeric not null check (amount > 0),
  -- Added load. 0 is pure bodyweight; negative is assistance (a band).
  load_kg     numeric not null default 0,
  -- Reps in reserve. NULL means not logged, and that is NOT zero: an
  -- unlogged RIR still counts as a hard set, because punishing incomplete
  -- logging just stops the logging.
  rir         int check (rir is null or (rir >= 0 and rir <= 10)),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'
);

create table skill_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  -- A node id from the shipped trees (fl.tuck). Same reasoning as above.
  node_id    text not null,
  on_date    date not null,
  amount     numeric not null check (amount > 0),
  -- Every form criterion met, judged by the athlete. Honest or useless.
  strict     boolean not null default false,
  note       text,
  created_at timestamptz not null default now(),
  -- One attempt per node per day. hasPassed() counts DISTINCT DAYS, so
  -- three good sets in one session is one good session — enforcing it here
  -- means the rule cannot be defeated by logging the same day twice.
  unique (user_id, node_id, on_date)
);

create table athlete_profile (
  user_id           uuid primary key default auth.uid(),
  bodyweight_kg     numeric,
  sessions_per_week int not null default 4,
  equipment         text[] not null default '{}',
  focus_skills      text[] not null default '{}',
  -- Israetel landmark overrides, per muscle group. Sparse: defaults fill
  -- the rest, because a shipped default presented as a fact is the system
  -- asserting something about this body it cannot know.
  landmarks         jsonb not null default '{}',
  updated_at        timestamptz not null default now()
);

alter table training_sets enable row level security;
alter table skill_attempts enable row level security;
alter table athlete_profile enable row level security;

create policy "own rows" on training_sets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on skill_attempts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on athlete_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index training_sets_by_workout on training_sets (workout_id, sort_order);
create index training_sets_by_exercise on training_sets (user_id, exercise_id);
create index skill_attempts_by_node on skill_attempts (user_id, node_id, on_date desc);

comment on column training_sets.rir is
  'Reps in reserve. NULL is not logged, which is NOT zero - an unlogged RIR still counts as a hard set.';
comment on column skill_attempts.strict is
  'Every form criterion met. A standard passed on sloppy form is not passed.';
