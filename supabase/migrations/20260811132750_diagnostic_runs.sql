-- Diagnostic runs: one row per triage or deep-dive pass over a venture or
-- a life area. Answers land in jsonb one at a time (writes-on-tap, the
-- venture-onboarder discipline); a skipped question simply never gets a
-- key, so absence stays distinct from zero. Score is computed arithmetic
-- over the answers — never invented — and carries its own basis
-- (answered/of_total) so a thin score can say so.

create table diagnostic_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  subject_type text not null check (subject_type in ('venture','area')),
  subject_id   uuid not null,
  kind         text not null default 'triage' check (kind in ('triage','deep')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  answers      jsonb not null default '{}',
  score        int check (score between 0 and 100),
  answered     int,
  of_total     int,
  meta         jsonb not null default '{}'
);

alter table diagnostic_runs enable row level security;

create policy "own rows" on diagnostic_runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index diagnostic_runs_subject
  on diagnostic_runs (user_id, subject_type, subject_id, started_at desc);
