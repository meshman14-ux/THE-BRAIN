alter table public.ventures
  add column if not exists stage text not null default 'idea',
  add column if not exists progress integer not null default 0,
  add column if not exists one_liner text,
  add column if not exists sort_order integer not null default 0;

alter table public.ventures drop constraint if exists ventures_stage_check;
alter table public.ventures add constraint ventures_stage_check
  check (stage in ('idea', 'research', 'stabilise', 'launch', 'revenue'));

alter table public.ventures drop constraint if exists ventures_progress_check;
alter table public.ventures add constraint ventures_progress_check
  check (progress >= 0 and progress <= 100);

comment on column public.ventures.stage is
  'Pipeline position: idea -> research -> stabilise -> launch -> revenue. Constrained because the app sorts, groups and derives percentages from it.';
comment on column public.ventures.progress is
  'Stated progress 0-100. NOT NULL default 0 so it never encodes "derive it for me".';
comment on column public.ventures.one_liner is
  'The single line under the name on the CEO dashboard, e.g. "First income engine".';
comment on column public.ventures.sort_order is
  'Display order within a stage. Ties fall back to name.';

create index if not exists ventures_stage_sort_idx
  on public.ventures (user_id, stage, sort_order);

alter table public.projects
  add column if not exists venture_id uuid
  references public.ventures (id) on delete set null;

comment on column public.projects.venture_id is
  'Optional owning venture (EMPIRE_OS). Nullable by design; on delete set null so closing a business never deletes the work.';

create index if not exists projects_venture_idx
  on public.projects (user_id, venture_id);

create unique index if not exists ventures_user_name_key
  on public.ventures (user_id, lower(name));
