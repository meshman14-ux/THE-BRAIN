-- The season THE BRAIN is currently in.
--
-- Jay's work is seasonal, not weekly: busy months and quiet months. Every
-- system built on "this week" is therefore right for part of the year and
-- wrong for the rest — which is very likely what the empty logs were
-- recording rather than any failure of will.
--
-- A season is a period, not a flag, so switching closes the old row and
-- opens a new one. That gives history for free: in six months the system
-- can say "that was a busy month" rather than judging it against a quiet
-- month's expectations.
--
-- Three kinds, one control:
--   quiet   — the building window. Peak hours are free; full system runs.
--   busy    — paid work owns the peak hours. One active venture, reduced
--             expectations, and unworked ventures are NOT failures.
--   minimum — the declared reset. Two obligations, everything else stops
--             counting. A deliberate state, never a collapse.

create table seasons (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  kind       text not null check (kind in ('quiet','busy','minimum')),
  started_on date not null default current_date,
  -- Null means "this is the season we are in". Exactly one such row.
  ended_on   date,
  note       text,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);

alter table seasons enable row level security;

create policy "own rows" on seasons for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One open season per user, enforced rather than hoped for.
create unique index seasons_one_open
  on seasons (user_id) where ended_on is null;

create index seasons_history on seasons (user_id, started_on desc);
