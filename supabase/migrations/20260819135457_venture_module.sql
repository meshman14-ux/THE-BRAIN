-- Venture module v1 — the five areas per venture, additive only.
--
-- ventures.stage is left alone (/empire reads it). Depth is a new `tier`;
-- null means "derive from stage/status and say so". legal_structure gates
-- which checklist rules apply — null means "not set", never sole_trader.

alter table public.ventures
  add column if not exists tier text
    check (tier is null or tier in ('idea','validating','active','dormant')),
  add column if not exists legal_structure text
    check (legal_structure is null or legal_structure in ('sole_trader','ltd','partnership','none_yet')),
  add column if not exists venture_group text,
  add column if not exists irl integer
    check (irl is null or irl between 1 and 9),
  add column if not exists last_touched_at timestamptz;

-- Area 1 · Document File ------------------------------------------------
create table if not exists public.venture_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  url text,
  doc_path text,
  note text,
  created_at timestamptz not null default now()
);
alter table public.venture_documents enable row level security;
drop policy if exists "own" on public.venture_documents;
create policy "own" on public.venture_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Area 2 · Business Plan (8 sections, one row each) ---------------------
create table if not exists public.venture_plan_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  section text not null,
  body text,
  updated_at timestamptz not null default now(),
  unique (venture_id, section)
);
alter table public.venture_plan_sections enable row level security;
drop policy if exists "own" on public.venture_plan_sections;
create policy "own" on public.venture_plan_sections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Area 5 · Checklist ----------------------------------------------------
-- rule_key non-null = generated from a compliance rule (dedup key, so
-- regenerating never duplicates and never un-ticks); null = hand-added.
create table if not exists public.venture_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  venture_id uuid not null references public.ventures(id) on delete cascade,
  rule_key text,
  title text not null,
  due_on date,
  done_at timestamptz,
  guidance_url text,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists venture_checklist_rule_once
  on public.venture_checklist_items (venture_id, rule_key)
  where rule_key is not null;
alter table public.venture_checklist_items enable row level security;
drop policy if exists "own" on public.venture_checklist_items;
create policy "own" on public.venture_checklist_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- last_touched_at: bumped by any write to a child table, so stage-aware
-- RAG needs no nightly job. SECURITY INVOKER — RLS applies; the owner is
-- the only one who can write the child row, so the parent update passes.
create or replace function public.venture_touch()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  update public.ventures
     set last_touched_at = now()
   where id = coalesce(new.venture_id, old.venture_id);
  return coalesce(new, old);
end
$$;

drop trigger if exists venture_documents_touch on public.venture_documents;
create trigger venture_documents_touch
  after insert or update or delete on public.venture_documents
  for each row execute function public.venture_touch();

drop trigger if exists venture_plan_sections_touch on public.venture_plan_sections;
create trigger venture_plan_sections_touch
  after insert or update or delete on public.venture_plan_sections
  for each row execute function public.venture_touch();

drop trigger if exists venture_checklist_items_touch on public.venture_checklist_items;
create trigger venture_checklist_items_touch
  after insert or update or delete on public.venture_checklist_items
  for each row execute function public.venture_touch();
