-- =====================================================================
-- Venture module — reconcile to venture-module-subsystem-v1.md
--
-- Builds on 20260819135457_venture_module and 20260819152738_venture_
-- compliance_facts, keeping their conventions throughout:
--   · venture_ prefix on every table
--   · everything nullable — NULL means "not answered", never a guess
--   · RLS policy named "own", user_id default auth.uid()
--   · venture_touch() trigger so last_touched_at needs no nightly job
--   · SECURITY INVOKER, never DEFINER
--
-- Closes the gap to the v1 spec: Area 4 (Task List) had a card in AREAS
-- but no table; KPIs, score, gates, milestones, risks and the propose-
-- then-accept queue did not exist.
--
-- EXPAND/CONTRACT on venture_group — see section 1. Safe to apply to a
-- live database with the current app deployed. Nothing breaks.
-- =====================================================================
--
-- HISTORY NOTE (23 Aug 2026): the live database received an EARLIER DRAFT
-- of this migration, applied out-of-band as version 20260822013414 — this
-- file now carries that version so `supabase db push` treats it as
-- applied and never re-runs it there. The draft lacked venture_tasks.
-- do_date; the follow-up migration 20260823214534_venture_tasks_do_date
-- (also already applied) covers the gap. A FRESH environment built from
-- these files gets the complete, corrected schema. Everything here is
-- idempotent, so accidental re-application is a no-op either way.

begin;

-- ---------------------------------------------------------------------
-- 1 · venture_group carries INDUSTRY, but the spec wants two independent
--     fields: type = industry (drives KPI templates + compliance rules),
--     group = maintenance load (drives how often you look at it).
--
--     The deployed app reads venture_group in 4 files, so this is an
--     EXPAND step only:
--       · venture_type is added and backfilled from venture_group
--       · a trigger keeps the two in sync in BOTH directions
--       · maintenance_load is added fresh — no name is reused
--     Old code and new code both work. The CONTRACT migration that drops
--     venture_group ships only after the app reads venture_type.
-- ---------------------------------------------------------------------

alter table public.ventures
  add column if not exists venture_type text
    check (venture_type is null or venture_type in
      ('property','trade','retail','digital','service','charity','other')),
  add column if not exists maintenance_load text
    check (maintenance_load is null or maintenance_load in
      ('engine','build','hold','watch')),
  add column if not exists score smallint
    check (score is null or score between 0 and 100),
  add column if not exists one_metric text,
  add column if not exists next_gate_at date,
  add column if not exists last_review_at timestamptz,
  add column if not exists drive_folder_id text;

comment on column public.ventures.venture_type is
  'Industry. Drives KPI templates and which compliance rules fire.';
comment on column public.ventures.maintenance_load is
  'engine = pays now · build = active work · hold = capital parked · watch = idea shelf.';
comment on column public.ventures.venture_group is
  'DEPRECATED — held in sync with venture_type by ventures_sync_type_group. '
  'Dropped once the app reads venture_type. Do not add new readers.';

-- No rag_status column on purpose. RAG is derived in ragFor() from tier,
-- last_touched_at and the obligation dates. A stored copy would drift the
-- moment a due date passes with nothing writing to the row.

update public.ventures
   set venture_type = venture_group
 where venture_type is null and venture_group is not null;

create or replace function public.ventures_sync_type_group()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  -- INSERT must be covered too: until the CONTRACT step ships, the
  -- deployed app still creates ventures writing venture_group alone.
  -- Without this branch those rows would carry a NULL venture_type and
  -- generate no type-specific compliance rules — silently.
  if tg_op = 'INSERT' then
    if new.venture_type is null then
      new.venture_type := new.venture_group;
    elsif new.venture_group is null then
      new.venture_group := new.venture_type;
    end if;
    return new;
  end if;

  -- Whichever side was written this statement wins; the other follows.
  if new.venture_type is distinct from old.venture_type then
    new.venture_group := new.venture_type;
  elsif new.venture_group is distinct from old.venture_group then
    new.venture_type := new.venture_group;
  end if;
  return new;
end
$$;

drop trigger if exists ventures_sync_type_group on public.ventures;
create trigger ventures_sync_type_group
  before insert or update on public.ventures
  for each row execute function public.ventures_sync_type_group();

-- ---------------------------------------------------------------------
-- 2 · Area 4 · Task List
--     Separate from public.tasks. The system PROPOSES; nothing lands in
--     the day plan unless Jay pulls it across, which sets promoted_task_id.
--     Ordered by sort_order, never blocking.
-- ---------------------------------------------------------------------

create table if not exists public.venture_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  note text,
  status text not null default 'open'
    check (status in ('open','doing','done','dropped')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high')),
  effort_min integer,
  due_on date,
  -- do_date is what makes a venture task appear in Today. ONE ROW, TWO
  -- VIEWS: the task is never copied into public.tasks, so there is no
  -- second copy to edit and nothing to keep in sync. Null = it lives on
  -- the venture only and the day screen never sees it.
  do_date date,
  sort_order integer not null default 0,
  source text not null default 'manual'
    check (source in ('manual','proposal','template','capture')),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists venture_tasks_open
  on public.venture_tasks (venture_id, sort_order)
  where status in ('open','doing');
create index if not exists venture_tasks_day
  on public.venture_tasks (do_date)
  where status in ('open','doing');

-- ---------------------------------------------------------------------
-- 3 · KPIs — 5 per venture, weekly, Active tier only
-- ---------------------------------------------------------------------

create table if not exists public.venture_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  key text not null,
  title text not null,
  unit text not null default 'number'
    check (unit in ('gbp','percent','number','days','hours','ratio')),
  direction text not null default 'up' check (direction in ('up','down')),
  target numeric,
  headline boolean not null default false,
  derived boolean not null default false,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venture_id, key)
);

create table if not exists public.venture_kpi_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kpi_id uuid not null references public.venture_kpis(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  period_start date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  unique (kpi_id, period_start)
);
create index if not exists venture_kpi_readings_recent
  on public.venture_kpi_readings (venture_id, period_start desc);

-- Five is the decision, not a suggestion. Enforced here so no UI can drift.
create or replace function public.venture_kpi_limit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare n integer;
begin
  if not new.active then return new; end if;
  select count(*) into n
    from public.venture_kpis
   where venture_id = new.venture_id and active and id <> new.id;
  if n >= 5 then
    raise exception 'Venture % already has 5 active KPIs. Retire one first.',
      new.venture_id;
  end if;
  return new;
end
$$;

drop trigger if exists venture_kpis_limit on public.venture_kpis;
create trigger venture_kpis_limit
  before insert or update on public.venture_kpis
  for each row execute function public.venture_kpi_limit();

-- ---------------------------------------------------------------------
-- 4 · Score — 8 weighted dimensions to 100
--     Weighted toward evidence and time (35 combined): the two things
--     that decide outcomes for a solo operator with 23 ventures.
-- ---------------------------------------------------------------------

create table if not exists public.venture_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  dimension text not null check (dimension in (
    'problem_evidence','founder_fit','unit_economics','market_size',
    'capital_to_gate','speed_to_first_pound','strategic_fit','risk_load')),
  rating smallint not null check (rating between 1 and 5),
  rationale text,
  rated_at timestamptz not null default now(),
  unique (venture_id, dimension)
);

create or replace function public.venture_score(v uuid)
returns smallint
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select round(sum(
    case dimension
      when 'problem_evidence'     then 20
      when 'founder_fit'          then 15
      when 'unit_economics'       then 15
      when 'market_size'          then 10
      when 'capital_to_gate'      then 10
      when 'speed_to_first_pound' then 10
      when 'strategic_fit'        then 10
      when 'risk_load'            then 10
    end * (rating - 1) / 4.0
  ))::smallint
  from public.venture_scores where venture_id = v;
$$;

-- ---------------------------------------------------------------------
-- 5 · Gates, kill criteria, milestones, risks
-- ---------------------------------------------------------------------

create table if not exists public.venture_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  from_tier text, to_tier text,
  scheduled_for date,
  held_on date,
  outcome text check (outcome is null or outcome in ('go','kill','hold','recycle')),
  capital_released numeric,   -- released to the NEXT gate only, never annually
  reasoning text,
  advisor_session_id uuid references public.advisor_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Optional, prompted at Idea -> Validating. A breach PROPOSES a gate
-- review. It never kills anything by itself.
create table if not exists public.venture_kill_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  statement text not null,
  by_date date,
  breached_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.venture_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  target_on date,
  achieved_on date,
  irl_target smallint check (irl_target is null or irl_target between 1 and 9),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

-- venture_id NULL = portfolio-level. Per-venture registers earn their
-- place at Active tier only.
create table if not exists public.venture_risks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid references public.ventures(id) on delete cascade,
  title text not null,
  detail text,
  category text not null default 'other' check (category in
    ('financial','legal','operational','market','key_person',
     'regulatory','reputational','other')),
  likelihood smallint not null default 3 check (likelihood between 1 and 5),
  impact smallint not null default 3 check (impact between 1 and 5),
  severity smallint generated always as (likelihood * impact) stored,
  mitigation text,
  status text not null default 'open'
    check (status in ('open','mitigating','accepted','closed')),
  review_on date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6 · The propose-then-accept queue
--     EVERY automated trigger writes here. Nothing reaches a task list,
--     and no tier changes, without an explicit accept.
-- ---------------------------------------------------------------------

create table if not exists public.venture_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid references public.ventures(id) on delete cascade,
  kind text not null check (kind in (
    'task','checklist_item','dormancy','gate_review','tier_change',
    'kpi_missing','document_expiry','kill_breach','merge_ventures')),
  title text not null,
  body text,
  rationale text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','expired')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.venture_proposals.rationale is
  'Descriptive and comparative, never directive. "3 of 4 property ventures '
  'have an EICR date; this one does not." Not "you should book an EICR."';

create index if not exists venture_proposals_pending
  on public.venture_proposals (created_at desc) where status = 'pending';

-- ---------------------------------------------------------------------
-- 7 · Widen the two Area tables that already exist. Additive only —
--     every existing column and row is untouched.
-- ---------------------------------------------------------------------

alter table public.venture_documents
  add column if not exists folder text
    check (folder is null or folder in (
      '00_Inbox','01_Plan','02_Legal','03_Finance','04_Tax','05_Insurance',
      '06_Contracts','07_Suppliers','08_Marketing','09_Operations',
      '10_Compliance','99_Archive')),
  add column if not exists doctype text,
  add column if not exists version text,
  add column if not exists supersedes_id uuid
    references public.venture_documents(id) on delete set null,
  add column if not exists drive_file_id text,
  add column if not exists expires_on date,
  add column if not exists retention_until date,
  add column if not exists is_final boolean not null default false;

create index if not exists venture_documents_expiry
  on public.venture_documents (expires_on) where expires_on is not null;

alter table public.venture_checklist_items
  add column if not exists category text
    check (category is null or category in
      ('tax','licence','insurance','property','data',
       'employment','banking','other')),
  add column if not exists authority text,
  add column if not exists expires_on date,
  add column if not exists obligation boolean not null default false,
  add column if not exists evidence_document_id uuid
    references public.venture_documents(id) on delete set null;

comment on column public.venture_checklist_items.obligation is
  'Statutory. Red the moment it is overdue, at every tier — the lesson of '
  'the 18 Aug penalties.';

create index if not exists venture_checklist_due
  on public.venture_checklist_items (due_on) where done_at is null;

-- ---------------------------------------------------------------------
-- 8 · RLS + touch triggers on everything new, matching the house pattern
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'venture_tasks','venture_kpis','venture_kpi_readings','venture_scores',
    'venture_gates','venture_kill_criteria','venture_milestones',
    'venture_risks','venture_proposals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format(
      'create policy "own" on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;

  -- venture_risks and venture_proposals allow a NULL venture_id
  -- (portfolio-level), so venture_touch() is not safe for them.
  foreach t in array array[
    'venture_tasks','venture_kpis','venture_kpi_readings','venture_scores',
    'venture_gates','venture_kill_criteria','venture_milestones'
  ] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch after insert or update or delete on public.%I
         for each row execute function public.venture_touch()', t, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 9 · Portfolio view — all 23 ventures, one query
--     RAG is deliberately NOT computed here. ragFor() in lib/venture.ts
--     owns that, and duplicating the rule in SQL guarantees the two drift.
--     This view supplies the inputs it needs and nothing more.
-- ---------------------------------------------------------------------

create or replace view public.venture_portfolio
with (security_invoker = true) as
select
  v.id, v.user_id, v.name, v.one_liner, v.status, v.stage,
  v.tier, v.venture_type, v.maintenance_load, v.irl,
  v.legal_structure, v.employs_people, v.vat_registered,
  v.one_metric, v.next_gate_at, v.last_review_at, v.last_touched_at,
  v.budget, v.monthly_cost, v.sort_order, v.created_at,
  public.venture_score(v.id) as score,

  (select count(*) from public.venture_documents d
     where d.venture_id = v.id
       and coalesce(d.folder,'') <> '99_Archive')            as doc_count,
  (select count(*) from public.venture_documents d
     where d.venture_id = v.id and d.expires_on is not null
       and d.expires_on <= current_date + 60)                 as docs_expiring,

  (select count(*) from public.venture_plan_sections p
     where p.venture_id = v.id
       and coalesce(p.body,'') <> '')                         as plan_sections_done,

  (select count(*) from public.venture_tasks t
     where t.venture_id = v.id
       and t.status in ('open','doing'))                      as tasks_open,
  (select count(*) from public.venture_tasks t
     where t.venture_id = v.id and t.status in ('open','doing')
       and t.due_on < current_date)                           as tasks_overdue,

  (select count(*) from public.venture_checklist_items c
     where c.venture_id = v.id)                               as checklist_total,
  (select count(*) from public.venture_checklist_items c
     where c.venture_id = v.id and c.done_at is not null)     as checklist_done,
  (select min(least(c.due_on, c.expires_on))
     from public.venture_checklist_items c
    where c.venture_id = v.id and c.done_at is null)          as checklist_next_on,
  (select count(*) from public.venture_checklist_items c
     where c.venture_id = v.id and c.done_at is null
       and least(c.due_on, c.expires_on) < current_date)      as checklist_overdue,

  (select max(k.period_start) from public.venture_kpi_readings k
     where k.venture_id = v.id)                               as last_kpi_on,

  (select count(*) from public.venture_risks r
     where r.venture_id = v.id and r.status = 'open'
       and r.severity >= 12)                                  as risks_high,
  (select count(*) from public.venture_proposals pr
     where pr.venture_id = v.id and pr.status = 'pending')    as proposals_pending
from public.ventures v;

-- ---------------------------------------------------------------------
-- 10 · Obligations calendar — checklist dates and document expiries,
--      unified. Every penalty on 18 Aug 2026 was a row this view would
--      have shown: four DVLA notices, two liability orders, Dwr Cymru
--      £185 -> £681, a return running at £10/day. None needed judgement.
-- ---------------------------------------------------------------------

create or replace view public.venture_obligations
with (security_invoker = true) as
select c.user_id, c.venture_id, v.name as venture_name,
       'checklist' as source, c.id as source_id, c.title as label,
       c.category, coalesce(c.due_on, c.expires_on) as due_on,
       c.obligation, c.guidance_url
  from public.venture_checklist_items c
  join public.ventures v on v.id = c.venture_id
 where c.done_at is null
   and coalesce(c.due_on, c.expires_on) is not null
union all
select d.user_id, d.venture_id, v.name,
       'document', d.id, d.title || ' expires',
       'other', d.expires_on, false, null
  from public.venture_documents d
  join public.ventures v on v.id = d.venture_id
 where d.expires_on is not null;

commit;

-- =====================================================================
-- NOT DONE HERE, on purpose:
--
-- · maintenance_load is NULL on all 23. Only Jay can sort them, and a
--   guessed engine/build/hold/watch is worse than an honest blank.
-- · irl is NULL on all 23. Same reason. The portfolio reads "not set"
--   rather than pretending.
-- · The CONTRACT step (drop venture_group, drop ventures_sync_type_group)
--   ships as its own migration once the app reads venture_type.
-- =====================================================================
