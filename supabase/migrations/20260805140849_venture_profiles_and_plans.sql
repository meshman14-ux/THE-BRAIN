alter table public.ventures
  add column if not exists plan text,
  add column if not exists budget numeric,
  add column if not exists monthly_cost numeric,
  add column if not exists funding_route text,
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column public.ventures.plan is
  'The business plan area Jay asked for — free text, his words, not researched content.';
comment on column public.ventures.profile is
  'Researched profile: market, licensing, startup cost, first steps, sources. Advisory only (CLAUDE.md decision 6) — it is reference material, never a claim about what Jay has decided.';
comment on column public.ventures.budget is
  'Planned startup spend. Nullable — unknown is not zero.';

alter table public.ventures drop constraint if exists ventures_money_check;
alter table public.ventures add constraint ventures_money_check
  check ((budget is null or budget >= 0)
     and (monthly_cost is null or monthly_cost >= 0));
