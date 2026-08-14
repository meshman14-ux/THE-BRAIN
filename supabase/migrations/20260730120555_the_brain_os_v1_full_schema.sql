-- ============================================================
-- THE BRAIN — Personal OS v1
-- Command centre + LIFE_OS + EMPIRE_OS
-- Replaces the earlier throwaway prototype tables (all empty).
-- ============================================================

drop table if exists public.habit_completions cascade;
drop table if exists public.habits  cascade;
drop table if exists public.tasks   cascade;
drop table if exists public.notes   cascade;
drop table if exists public.projects cascade;
drop table if exists public.links   cascade;

create extension if not exists vector;

-- ---------- COMMAND CENTRE ----------

create table public.vision (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  title         text not null,
  statement     text,
  horizon_years int,
  system        text not null default 'both',   -- life | empire | both
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  meta          jsonb not null default '{}'
);

create table public.pillars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  system     text not null,                 -- life | empire
  name       text not null,
  emoji      text,
  standard   text,                          -- the standard you hold
  colour     text,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  meta       jsonb not null default '{}'
);

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id   uuid references public.pillars on delete set null,
  vision_id   uuid references public.vision  on delete set null,
  title       text not null,
  description text,
  target_date date,
  status      text not null default 'active',   -- active|achieved|dropped|someday
  progress    int  not null default 0,
  created_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id   uuid references public.pillars on delete set null,
  goal_id     uuid references public.goals   on delete set null,
  title       text not null,
  description text,
  status      text not null default 'active',   -- active|paused|done|dropped
  start_date  date,
  due_date    date,
  created_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  project_id   uuid references public.projects on delete set null,
  pillar_id    uuid references public.pillars  on delete set null,
  title        text not null,
  notes        text,
  due_date     date,
  do_date      date,
  priority     int  not null default 0,
  energy       text not null default 'medium',   -- low | medium | deep
  status       text not null default 'open',     -- open|done|dropped|waiting
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  meta         jsonb not null default '{}'
);

create table public.inbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  raw_text    text not null,
  source      text not null default 'app',
  captured_at timestamptz not null default now(),
  triaged_at  timestamptz,
  routed_type text,
  routed_id   uuid,
  status      text not null default 'open',      -- open|routed|discarded
  embedding   vector(1536),
  meta        jsonb not null default '{}'
);

create table public.links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  from_type  text not null,
  from_id    uuid not null,
  to_type    text not null,
  to_id      uuid not null,
  relation   text not null default 'relates_to',
  created_at timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id, relation)
);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  kind          text not null,                  -- daily|weekly|quarterly
  period_start  date not null,
  period_end    date not null,
  wins          text,
  friction      text,
  next_focus    text,
  pillar_scores jsonb not null default '{}',
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  meta          jsonb not null default '{}',
  unique (user_id, kind, period_start)
);

-- ---------- KNOWLEDGE (the Vault) ----------

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id  uuid references public.pillars on delete set null,
  title      text,
  body       text,
  kind       text not null default 'note',   -- note|idea|reference|literature|moc|sop
  tags       text[] not null default '{}',
  starred    boolean not null default false,
  embedding  vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta       jsonb not null default '{}'
);

-- ---------- LIFE_OS MODULES ----------

create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id    uuid references public.pillars on delete set null,
  name         text not null,
  cadence      text not null default 'daily',   -- daily|weekly|x_per_week
  target_count int  not null default 1,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  meta         jsonb not null default '{}'
);

create table public.habit_logs (
  habit_id uuid not null references public.habits on delete cascade,
  user_id  uuid not null references auth.users on delete cascade default auth.uid(),
  done_on  date not null,
  value    numeric,
  note     text,
  primary key (habit_id, done_on)
);

create table public.journal (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  entry_date date not null,
  body       text,
  mood       int,
  energy     int,
  gratitude  text,
  created_at timestamptz not null default now(),
  meta       jsonb not null default '{}',
  unique (user_id, entry_date)
);

create table public.people (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id    uuid references public.pillars on delete set null,
  name         text not null,
  relationship text,
  last_contact date,
  cadence_days int,
  birthday     date,
  notes        text,
  created_at   timestamptz not null default now(),
  meta         jsonb not null default '{}'
);

create table public.metrics (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id uuid references public.pillars on delete set null,
  name      text not null,
  unit      text,
  target    numeric,
  direction text not null default 'up',
  created_at timestamptz not null default now(),
  meta      jsonb not null default '{}'
);

create table public.metric_readings (
  id        uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.metrics on delete cascade,
  user_id   uuid not null references auth.users on delete cascade default auth.uid(),
  taken_on  date not null,
  value     numeric not null
);

-- ---------- EMPIRE_OS MODULES ----------

create table public.ventures (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id       uuid references public.pillars on delete set null,
  name            text not null,
  status          text not null default 'active',  -- idea|building|active|paused|exited
  role            text,
  stake_pct       numeric,
  external_system text,
  external_url    text,
  health          int,
  valuation       numeric,
  created_at      timestamptz not null default now(),
  meta            jsonb not null default '{}'
);

create table public.assets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id      uuid references public.pillars  on delete set null,
  venture_id     uuid references public.ventures on delete set null,
  kind           text not null,
  name           text not null,
  acquired_on    date,
  value          numeric,
  income_monthly numeric,
  cost_monthly   numeric,
  status         text not null default 'held',
  created_at     timestamptz not null default now(),
  meta           jsonb not null default '{}'
);

create table public.investments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id     uuid references public.pillars on delete set null,
  kind          text not null,
  name          text not null,
  platform      text,
  units         numeric,
  cost_basis    numeric,
  current_value numeric,
  as_of         date,
  created_at    timestamptz not null default now(),
  meta          jsonb not null default '{}'
);

create table public.opportunities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  pillar_id      uuid references public.pillars on delete set null,
  person_id      uuid references public.people  on delete set null,
  title          text not null,
  kind           text,
  stage          text not null default 'lead',   -- lead|talking|proposal|won|lost
  value_est      numeric,
  next_step      text,
  next_step_date date,
  created_at     timestamptz not null default now(),
  meta           jsonb not null default '{}'
);

-- ---------- CALENDAR TWO-WAY SYNC (contained blast radius) ----------

create table public.calendar_sync (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  task_id         uuid references public.tasks on delete cascade,
  google_event_id text not null,
  google_cal_id   text not null,          -- always THE BRAIN's own calendar
  etag            text,
  event_start     timestamptz,
  event_end       timestamptz,
  last_pushed_at  timestamptz,
  last_pulled_at  timestamptz,
  conflict        boolean not null default false,
  conflict_note   text,
  meta            jsonb not null default '{}',
  unique (google_cal_id, google_event_id)
);

-- ---------- INDEXES ----------

create index on public.tasks   (user_id, do_date)  where status = 'open';
create index on public.tasks   (user_id, status);
create index on public.tasks   (user_id, pillar_id);
create index on public.inbox   (user_id, status);
create index on public.notes   (user_id, pillar_id);
create index on public.links   (user_id, to_type, to_id);
create index on public.links   (user_id, from_type, from_id);
create index on public.habit_logs (user_id, done_on);
create index on public.people  (user_id, last_contact);
create index on public.projects (user_id, status);
create index on public.goals   (user_id, status);

-- ---------- ROW LEVEL SECURITY ----------

alter table public.vision          enable row level security;
alter table public.pillars         enable row level security;
alter table public.goals           enable row level security;
alter table public.projects        enable row level security;
alter table public.tasks           enable row level security;
alter table public.inbox           enable row level security;
alter table public.links           enable row level security;
alter table public.reviews         enable row level security;
alter table public.notes           enable row level security;
alter table public.habits          enable row level security;
alter table public.habit_logs      enable row level security;
alter table public.journal         enable row level security;
alter table public.people          enable row level security;
alter table public.metrics         enable row level security;
alter table public.metric_readings enable row level security;
alter table public.ventures        enable row level security;
alter table public.assets          enable row level security;
alter table public.investments     enable row level security;
alter table public.opportunities   enable row level security;
alter table public.calendar_sync   enable row level security;

create policy "own" on public.vision          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.pillars         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.goals           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.projects        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.tasks           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.inbox           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.links           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.reviews         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.notes           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.habits          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.habit_logs      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.journal         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.people          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.metrics         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.metric_readings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.ventures        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.assets          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.investments     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.opportunities   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.calendar_sync   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- SEED THE 12 PILLARS FOR A NEW USER ----------
-- Called by the app on first sign-in (runs as the authenticated user).

create or replace function public.seed_pillars()
returns void language plpgsql security invoker as $$
begin
  if exists (select 1 from public.pillars where user_id = auth.uid()) then
    return;
  end if;

  insert into public.pillars (system, name, emoji, standard, sort_order) values
    ('life',   'Training & Fitness',    '🏋️', 'Move with intent at least 4 days a week.',                 1),
    ('life',   'Nutrition & Recovery',  '🥗', 'Eat and sleep like someone with plans.',                    2),
    ('life',   'Mind & Growth',         '📚', 'Learn something deliberately every week.',                  3),
    ('life',   'Family',                '🏡', 'Be present for the people who were there first.',           4),
    ('life',   'Friends & Network',     '🤝', 'Stay in touch on purpose, not by accident.',                5),
    ('life',   'Home & Admin',          '🧾', 'Nothing important rots in a drawer.',                       6),
    ('life',   'Money & Security',      '💷', 'Know the numbers. Spend deliberately. Keep a buffer.',      7),
    ('empire', 'Ventures',              '🚀', 'Every venture is either growing or being decided about.',   8),
    ('empire', 'Property & Assets',     '🏗️', 'Every asset earns, appreciates, or gets sold.',            9),
    ('empire', 'Capital & Investments', '📈', 'Money works, or it is idle by choice.',                    10),
    ('empire', 'Brand & Network',       '📡', 'Reputation compounds. Feed it weekly.',                    11),
    ('empire', 'Systems & Tools',       '⚙️', 'The system that runs the empire is maintained, not hoped for.', 12);
end;
$$;

grant execute on function public.seed_pillars() to authenticated;
