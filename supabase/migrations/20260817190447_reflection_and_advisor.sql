-- ===========================================================================
-- DAILY REFLECTION
-- Voice first, two taps as the fallback that keeps a bad day from breaking the
-- run. The law this obeys: TRUTH MUST BE FREE. A reflection that costs five
-- minutes of typing survives until the first hard week — which is the week the
-- record would have been worth most.
-- ===========================================================================
create table if not exists public.reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  on_date     date not null,
  kind        text not null check (kind in ('morning','evening')),
  source      text not null default 'voice' check (source in ('voice','tap','typed')),

  transcript  text,                       -- what was said, verbatim
  parsed      jsonb not null default '{}'::jsonb,  -- intentions, moved, blocked, mood, mentions
  one_thing   text,                       -- morning: the single thing that matters today
  it_happened boolean,                    -- evening: did it
  energy      integer check (energy between 1 and 5),

  created_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb,
  unique (user_id, on_date, kind)
);

comment on table public.reflections is
  'One row per day per half. The unique constraint makes re-recording an update, not a duplicate — a second attempt at the evening close should replace the first, not sit beside it.';
comment on column public.reflections.parsed is
  'Structured read of the transcript: intentions[], moved[], blocked[], mood, mentions{people,ventures,money}. Never overwrites transcript — the words stay verbatim.';

create index if not exists reflections_recent_idx
  on public.reflections (user_id, on_date desc);

alter table public.reflections enable row level security;
drop policy if exists own on public.reflections;
create policy own on public.reflections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===========================================================================
-- THE BOARD
-- Dynamically CAST, from a STABLE REGISTRY. The board that turns up suits the
-- question; the Sceptic is always the same Sceptic when it appears. Relevance
-- without the room being strangers.
-- ===========================================================================
create table if not exists public.advisor_seats (
  key       text primary key,
  name      text not null,
  brief     text not null,          -- the perspective's standing instruction
  bias      text not null,          -- what it over-weights, stated honestly
  looks_at  text[] not null default '{}',
  active    boolean not null default true
);

comment on table public.advisor_seats is
  'The cast. Seats are selected per question, but each seat keeps one voice across every appearance — which is what makes "the Sceptic usually hates this and did not" a readable signal.';

alter table public.advisor_seats enable row level security;
drop policy if exists read_all on public.advisor_seats;
create policy read_all on public.advisor_seats for select to authenticated using (true);

insert into public.advisor_seats (key, name, brief, bias, looks_at) values
  ('operator', 'The Operator',
   'Judge everything by whether it fits in a real week alongside the work that already exists. Talk in hours, not intentions.',
   'Over-weights capacity; will under-value things that are worth doing badly.',
   array['tasks','calendar','day_blocks','season']),

  ('financial', 'The Financial Planner',
   'Judge by income, debt trajectory and cost. Name the number. Never give a recommendation to buy, sell or borrow — lay out the arithmetic and let Jay decide.',
   'Over-weights the measurable; blind to things that pay off in ways money does not show.',
   array['debts','income','ventures','assets']),

  ('behavioural', 'The Behavioural Scientist',
   'Ask whether Jay will actually do this, given how he has behaved before. Cite the record, not the intention.',
   'Over-weights past behaviour; can talk him out of a genuine change of mind.',
   array['habits','reflections','finishes','checkins']),

  ('sceptic', 'The Sceptic',
   'Argue against whatever the room is converging on. If the board agrees, that is the signal to push hardest. Default to refuted when uncertain.',
   'Contrarian by construction. Discount it when it has nothing specific.',
   array['*']),

  ('systems', 'The Systems Designer',
   'Judge the structure: what breaks, what needs maintaining, what quietly becomes a second job.',
   'Over-weights elegance; will build a system where a note would do.',
   array['ventures','processes','brain_build']),

  ('property', 'The Property Professional',
   'Judge lettings, condition, compliance and what a house needs before it earns. Dates that expire come first.',
   'Assumes property is the answer.',
   array['property','assets','documents']),

  ('health', 'The Health Coach',
   'Judge by capacity to work: training, sleep, recovery. Training is the keystone and the maintenance schedule on the only production asset.',
   'Will prescribe rest at moments money is genuinely urgent.',
   array['health','habits','training']),

  ('knowledge', 'The Knowledge Manager',
   'Judge whether the information exists, is findable, and is trusted. An unrecorded decision is a decision that will be made again.',
   'Over-weights documentation.',
   array['notes','documents','captures']),

  ('strategist', 'The Business Strategist',
   'Judge against the stated vision — assets that keep earning without him. Ask what this does to the earning-without-me column.',
   'Over-weights the long game; impatient with survival work.',
   array['ventures','income','goals']),

  ('coach', 'The Life Coach',
   'Judge by whether the life being built is one worth having. Ask about people, and about the cost of the pace.',
   'Softest seat; will let a hard number slide.',
   array['people','reflections','areas'])
on conflict (key) do update
  set name = excluded.name, brief = excluded.brief,
      bias = excluded.bias, looks_at = excluded.looks_at;

-- One row per time the board convenes: a question, who sat, what they said,
-- and what was decided. The dissent is recorded on purpose — in December the
-- useful question is "who was against this, and were they right?"
create table if not exists public.advisor_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null default 'board'
                check (kind in ('board','nightly','weekly')),
  question      text,
  context       jsonb not null default '{}'::jsonb,
  verdict       text,
  recommendation text,
  dissent       text,
  reflection_id uuid references public.reflections(id) on delete set null,
  decided       text,                       -- what Jay actually did, filled later
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists advisor_sessions_recent_idx
  on public.advisor_sessions (user_id, created_at desc);

alter table public.advisor_sessions enable row level security;
drop policy if exists own on public.advisor_sessions;
create policy own on public.advisor_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.advisor_opinions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.advisor_sessions(id) on delete cascade,
  seat_key   text not null references public.advisor_seats(key),
  position   text not null check (position in ('for','against','abstain')),
  argument   text not null,
  created_at timestamptz not null default now()
);

create index if not exists advisor_opinions_session_idx
  on public.advisor_opinions (session_id);

alter table public.advisor_opinions enable row level security;
drop policy if exists own on public.advisor_opinions;
create policy own on public.advisor_opinions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
