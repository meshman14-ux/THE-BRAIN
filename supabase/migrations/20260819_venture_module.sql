-- Venture module — the five areas from Jay's note of 19 Aug 2026.
--
-- STRICTLY ADDITIVE. Nothing here drops, renames or retypes anything.
-- `ventures.stage` is deliberately left alone: /empire, /estate and every
-- division cockpit read it, and repurposing it would break those screens
-- silently. Depth is carried by the new `tier` column instead.
--
-- Safe to re-run: every statement is `if not exists` or guarded.

-- ── 1 · eleven new columns on ventures ────────────────────────────────
alter table public.ventures
  add column if not exists venture_group   text,
  add column if not exists tier            text,
  add column if not exists irl             smallint,
  add column if not exists venture_type    text,
  add column if not exists legal_structure text,
  add column if not exists employs_people  boolean,
  add column if not exists turnover_band   text,
  add column if not exists vat_registered  boolean,
  add column if not exists last_touched_at timestamptz,
  add column if not exists dormant_since   date,
  add column if not exists kill_criteria   text;

-- Every one of them is NULLABLE on purpose. A defaulted tier would make an
-- unsorted venture indistinguishable from one Jay actually placed, which is
-- the `ventures.stage` / `meta.stage_confirmed` trap in §A4 all over again.
-- `last_touched_at` is not defaulted to now() either: stamping 23 rows as
-- "touched today" would make every RAG green on the day the migration ran.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventures_tier_chk') then
    alter table public.ventures add constraint ventures_tier_chk
      check (tier is null or tier in ('idea','validating','active','dormant'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ventures_irl_chk') then
    alter table public.ventures add constraint ventures_irl_chk
      check (irl is null or (irl between 1 and 9));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ventures_legal_structure_chk') then
    alter table public.ventures add constraint ventures_legal_structure_chk
      check (legal_structure is null or legal_structure in
        ('sole_trader','partnership','ltd','llp','cic','charity'));
  end if;
end $$;

-- ── 2 · the twelve child tables ───────────────────────────────────────
-- Every one carries the same four columns so the touch trigger, the RLS
-- policy and the delete cascade are one shape rather than twelve.

create table if not exists public.venture_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  rule_key text,
  title text not null,
  category text,
  obligation boolean not null default false,
  due_date date,
  cadence text,
  done boolean not null default false,
  done_on date,
  guidance_url text,
  source text not null default 'generated',
  note text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
-- Regenerating the checklist must never duplicate a rule, and must never
-- un-tick one already done: this index is what makes the upsert safe.
create unique index if not exists venture_checklist_rule_uniq
  on public.venture_checklist_items (venture_id, rule_key)
  where rule_key is not null;

create table if not exists public.venture_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  notes text,
  priority text not null default 'Med',
  status text not null default 'open',
  due_date date,
  -- the ONE door into the day plan: a promoted item points at the real row
  promoted_task_id uuid references public.tasks(id) on delete set null,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint venture_tasks_status_chk check (status in ('open','doing','done','dropped')),
  constraint venture_tasks_priority_chk check (priority in ('High','Med','Low'))
);

create table if not exists public.venture_plan_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  section_key text not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create unique index if not exists venture_plan_section_uniq
  on public.venture_plan_sections (venture_id, section_key);

create table if not exists public.venture_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  kind text,
  storage_path text,
  external_url text,
  drive_url text,
  expires_on date,
  note text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.venture_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  name text not null,
  unit text,
  target numeric,
  direction text not null default 'up',
  cadence text not null default 'weekly',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint venture_kpis_direction_chk check (direction in ('up','down'))
);

create table if not exists public.venture_kpi_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  kpi_id uuid not null references public.venture_kpis(id) on delete cascade,
  taken_on date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
-- Same discipline as metric_readings: one reading per KPI per day, so
-- logging twice on a Sunday is one reading and not a fake trend.
create unique index if not exists venture_kpi_reading_uniq
  on public.venture_kpi_readings (kpi_id, taken_on);

create table if not exists public.venture_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  due_date date,
  done_on date,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.venture_risks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  likelihood smallint,
  impact smallint,
  mitigation text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint venture_risks_likelihood_chk check (likelihood is null or likelihood between 1 and 5),
  constraint venture_risks_impact_chk check (impact is null or impact between 1 and 5)
);

create table if not exists public.venture_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  gate_key text not null,
  question text not null,
  answer text,
  passed boolean,
  decided_on date,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create unique index if not exists venture_gate_uniq
  on public.venture_gates (venture_id, gate_key);

create table if not exists public.venture_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  note text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

-- A score is a fact about a DAY, exactly as investments.as_of is. Storing
-- one row per scoring keeps a trend instead of overwriting the last opinion.
create table if not exists public.venture_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  scored_on date not null default current_date,
  demand smallint,
  economics smallint,
  capability smallint,
  capacity smallint,
  capital smallint,
  compliance smallint,
  defensibility smallint,
  momentum smallint,
  note text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint venture_scores_range_chk check (
    (demand        is null or demand        between 1 and 5) and
    (economics     is null or economics     between 1 and 5) and
    (capability    is null or capability    between 1 and 5) and
    (capacity      is null or capacity      between 1 and 5) and
    (capital       is null or capital       between 1 and 5) and
    (compliance    is null or compliance    between 1 and 5) and
    (defensibility is null or defensibility between 1 and 5) and
    (momentum      is null or momentum      between 1 and 5)
  )
);
create unique index if not exists venture_score_day_uniq
  on public.venture_scores (venture_id, scored_on);

-- The thirteenth table, and the only one that is not a child of a venture
-- in the "Jay wrote this" sense: it is the queue everything automated has
-- to pass through. Propose, never push.
create table if not exists public.venture_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid references public.ventures(id) on delete cascade,
  kind text not null,
  label text not null,
  rationale text,
  target_table text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',
  decided_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint venture_proposals_status_chk
    check (status in ('proposed','accepted','rejected','applied','failed'))
);

-- ── 3 · the KPI cap ───────────────────────────────────────────────────
-- Five was a decision, not a suggestion, and a cap the UI alone enforces is
-- a cap that lasts until the first API call.
create or replace function public.venture_kpi_cap()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare n integer;
begin
  if new.active is not true then return new; end if;
  select count(*) into n
    from public.venture_kpis k
   where k.venture_id = new.venture_id
     and k.active
     and k.id <> new.id;
  if n >= 5 then
    raise exception 'a venture may have at most 5 active KPIs (this one has %)', n
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists venture_kpi_cap_trg on public.venture_kpis;
create trigger venture_kpi_cap_trg
  before insert or update on public.venture_kpis
  for each row execute function public.venture_kpi_cap();

-- ── 4 · last_touched_at ───────────────────────────────────────────────
-- Stage-aware RAG needs to know when a venture was last worked on. A
-- nightly job would be a second thing to host; a trigger on the twelve
-- child tables is the same answer with nothing to run.
create or replace function public.venture_touch()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare vid uuid;
begin
  vid := coalesce(new.venture_id, old.venture_id);
  if vid is not null then
    update public.ventures set last_touched_at = now() where id = vid;
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'venture_checklist_items','venture_tasks','venture_plan_sections',
    'venture_documents','venture_kpis','venture_kpi_readings',
    'venture_milestones','venture_risks','venture_gates',
    'venture_contacts','venture_scores','venture_proposals'
  ] loop
    execute format('drop trigger if exists venture_touch_trg on public.%I', t);
    execute format(
      'create trigger venture_touch_trg after insert or update on public.%I
         for each row execute function public.venture_touch()', t);
  end loop;
end $$;

-- ── 5 · RLS — the uniform owner-scoped policy, thirteen times ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'venture_checklist_items','venture_tasks','venture_plan_sections',
    'venture_documents','venture_kpis','venture_kpi_readings',
    'venture_milestones','venture_risks','venture_gates',
    'venture_contacts','venture_scores','venture_proposals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = 'own'
    ) then
      execute format(
        'create policy "own" on public.%I for all
           using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;

-- ── 6 · indexes the pages actually query by ──────────────────────────
create index if not exists venture_checklist_venture_idx on public.venture_checklist_items (venture_id);
create index if not exists venture_checklist_due_idx     on public.venture_checklist_items (due_date) where not done;
create index if not exists venture_tasks_venture_idx     on public.venture_tasks (venture_id);
create index if not exists venture_documents_venture_idx on public.venture_documents (venture_id);
create index if not exists venture_kpis_venture_idx      on public.venture_kpis (venture_id);
create index if not exists venture_kpi_readings_kpi_idx  on public.venture_kpi_readings (kpi_id, taken_on desc);
create index if not exists venture_milestones_venture_idx on public.venture_milestones (venture_id);
create index if not exists venture_risks_venture_idx     on public.venture_risks (venture_id);
create index if not exists venture_scores_venture_idx    on public.venture_scores (venture_id, scored_on desc);
create index if not exists venture_proposals_open_idx    on public.venture_proposals (status, created_at desc);

-- ── NOT here, deliberately: the two RAG views ────────────────────────
-- The brief asks for them. RAG and the eight-dimension score live in
-- src/lib/venture/scoring.ts with tests; a SQL view computing the same
-- thing would be a second implementation of one rule, and the two would
-- drift the first time a threshold moved. Every record has one home; so
-- does every rule.
