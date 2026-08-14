-- JAY_OS — what the personal dashboard needs the schema to be able to say.
--
-- Three columns on `pillars` and one index. Nothing is dropped, nothing is
-- renamed, and every existing row stays valid: the new columns are nullable
-- and every existing read path ignores them.
--
-- Deliberately NOT added: a `debts` table. Debt is a number that moves over
-- time, which is exactly what metrics/metric_readings already model, and
-- EMPIRE_OS already reads that pair. A bespoke table would give one figure
-- and no trend; a metric gives the trend for free. Same reasoning sends the
-- training streak to habits/habit_logs rather than a `streak` column — a
-- stored streak is a derived value that goes stale the first day it is not
-- written to.

/* ------------------------------------------------------------------ *
 * pillars — how an area is actually doing
 * ------------------------------------------------------------------ */

alter table public.pillars
  add column if not exists score       integer,
  add column if not exists status_line text,
  add column if not exists focus_week   date;

-- Nullable on purpose. "Not scored yet" and "scored zero" are different
-- facts: a 0 is a judgement Jay made, a null is a question he has not
-- answered. The dashboard average must ignore the second and count the
-- first, which it cannot do if the column defaults to 0.
comment on column public.pillars.score is
  'How this area is doing, 0-10. Null means not yet scored — excluded from the average, which is not the same as scoring it 0.';

comment on column public.pillars.status_line is
  'One line of plain English beside the bar: "Debt-heavy - plan in motion".';

-- Which week this area is the focus for. Stored rather than inferred,
-- because "the area I have decided to work on" and "the area scoring worst"
-- are not always the same thing, and the dashboard should show the decision.
-- Holds the Monday of the week it applies to, so a stale focus is visibly
-- stale rather than silently permanent.
comment on column public.pillars.focus_week is
  'Monday of the week this area is the declared focus for. Null means not the focus.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pillars'::regclass and conname = 'pillars_score_check'
  ) then
    alter table public.pillars
      add constraint pillars_score_check
      check (score is null or (score >= 0 and score <= 10));
  end if;
end $$;

/* ------------------------------------------------------------------ *
 * metric_readings — one reading per metric per day
 * ------------------------------------------------------------------ */

-- A metric has one value on a given date. Without this, logging today's debt
-- twice silently produces two rows and "the latest reading" becomes a
-- coin toss between them. With it, a second log is an upsert.
create unique index if not exists metric_readings_metric_day_uidx
  on public.metric_readings (metric_id, taken_on);
