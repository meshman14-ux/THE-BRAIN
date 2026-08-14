-- Align with Jay's Blueprint v2: Kanban planner + richer Life Area schema.

-- Priority as High/Med/Low (his vocabulary) rather than an opaque integer.
alter table public.tasks drop column if exists priority;
alter table public.tasks add column priority text not null default 'Med'
  check (priority in ('High', 'Med', 'Low'));

-- Kanban lane. open -> doing -> done, matching To Do / In Progress / Done.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'doing', 'done', 'dropped', 'waiting'));

-- Richer per-area fields from the blueprint's `system` object.
alter table public.pillars add column if not exists purpose text;
alter table public.pillars add column if not exists vision  text;
alter table public.pillars add column if not exists current text;
alter table public.pillars add column if not exists glyph   text;

create index if not exists tasks_kanban_idx on public.tasks (user_id, status, priority);
