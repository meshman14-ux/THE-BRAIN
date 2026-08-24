-- do_date is what makes a venture task appear in Today.
-- ONE ROW, TWO VIEWS: the task is never copied into public.tasks, so there
-- is no second copy to edit and nothing to keep in sync. Null = it lives on
-- the venture only and the day screen never sees it.
--
-- ALREADY APPLIED to the live database on 23 Aug 2026 (as migration
-- `venture_tasks_do_date`, via the Supabase connector) — the reconcile
-- migration had been applied from an earlier draft that predated this
-- column, and the Area 4 task-list code queries do_date, so /day and the
-- venture page would 400 without it. This file exists so the repo
-- describes the database again; it is idempotent and safe to re-run.

alter table public.venture_tasks
  add column if not exists do_date date;

create index if not exists venture_tasks_day
  on public.venture_tasks (do_date)
  where status in ('open','doing');

-- promoted_task_id is left in place but is now unused. It pointed at a COPY
-- of the task in public.tasks; there is no copy any more. Dropping it is a
-- separate decision, since dropping a column is the one thing here that
-- cannot be undone by re-running a migration.
comment on column public.venture_tasks.promoted_task_id is
  'DEPRECATED — unused. Superseded by do_date; venture tasks are read by the
   day screen, never copied into public.tasks.';
