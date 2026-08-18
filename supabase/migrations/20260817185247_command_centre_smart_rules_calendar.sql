-- ===========================================================================
-- SMART RULES
-- Panels that appear only when they have something to say. A permanent panel
-- reading "nothing to report" teaches the eye to skip that region — and then
-- it skips it on the day it matters.
--
-- Rules are DATA, not components. Adding a seventh panel is an insert.
-- ===========================================================================
create table if not exists public.smart_rules (
  key         text primary key,
  title       text not null,
  body        text not null,          -- may contain {placeholders} filled at read time
  action_label text,
  action_href text,
  channel     text not null default 'info'
              check (channel in ('good','warn','bad','info')),
  priority    integer not null default 50,   -- lower shows first
  enabled     boolean not null default true,
  builtin     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.smart_rules is
  'One row per Smart Panel. The condition lives in lib/smart-panels.ts keyed by `key` for builtins; user-added rules render from title/body alone. Never more than two panels on screen — priority decides.';

alter table public.smart_rules enable row level security;
drop policy if exists read_all on public.smart_rules;
create policy read_all on public.smart_rules for select to authenticated using (true);

insert into public.smart_rules (key, title, body, action_label, action_href, channel, priority, builtin) values
  ('nearly_closed',  'An account is nearly closed',
   '{creditor} is £{remaining} from zero. Closing an account predicts payoff better than paying down a big one.',
   'Open Money', '/life/money', 'good', 10, true),

  ('month_quiet',    'This month has not moved yet',
   'Day {day} and nothing once-only has finished. The floor may be met; the month has not counted.',
   'What could still close?', '/life/horizon', 'warn', 20, true),

  ('nothing_earning','No income logged in {days} days',
   'Income is the constraint. Two weeks of silence is worth a look before it is a month.',
   'Open Income', '/life/income', 'bad', 15, true),

  ('cap_breach',     'Build hours over the cap, second week running',
   '{hours} hrs on THE BRAIN against a 10 hr cap. Those hours come out of the work that earns.',
   'See the week', '/week', 'warn', 30, true),

  ('stale_capture',  '{count} captures waiting {days}+ days',
   'A capture nobody confirms is a photograph, not data. This is the engine''s failure mode.',
   'Confirm them', '/capture', 'warn', 40, true),

  ('person_slipping','{name} is well past cadence',
   '{days} days, against a cadence of {cadence}. Not a nag at day one — a flag now it has drifted.',
   'Open People', '/life/people', 'warn', 25, true)
on conflict (key) do update
  set title = excluded.title, body = excluded.body,
      action_label = excluded.action_label, action_href = excluded.action_href,
      channel = excluded.channel, priority = excluded.priority;

-- ===========================================================================
-- CALENDAR
-- Two-way. External events are IMMOVABLE OBJECTS the day plan fits around —
-- one plan with two kinds of block, never two rival views of the same day.
-- `origin` is what keeps the sync honest about who owns a row.
-- ===========================================================================
create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  google_id    text,
  calendar_id  text,
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  location     text,
  origin       text not null default 'google'
               check (origin in ('google','brain')),
  task_id      uuid references public.tasks(id) on delete set null,
  status       text not null default 'confirmed'
               check (status in ('confirmed','cancelled')),
  etag         text,
  synced_at    timestamptz,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  meta         jsonb not null default '{}'::jsonb,
  unique (user_id, google_id)
);

comment on column public.calendar_events.origin is
  'google = came from the calendar, immovable, the day plan fits around it. brain = a day-plan block pushed out to Google; THE BRAIN owns it and may move it.';

create index if not exists calendar_events_day_idx
  on public.calendar_events (user_id, starts_at)
  where status = 'confirmed';

alter table public.calendar_events enable row level security;
drop policy if exists own on public.calendar_events;
create policy own on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sync bookkeeping: one row per user. syncToken makes the pull incremental
-- rather than re-reading the whole calendar every time.
create table if not exists public.calendar_state (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  calendar_id  text not null default 'primary',
  sync_token   text,
  last_pull    timestamptz,
  last_push    timestamptz,
  last_error   text
);

alter table public.calendar_state enable row level security;
drop policy if exists own on public.calendar_state;
create policy own on public.calendar_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
