-- How long a task takes, in minutes.
--
-- Null is not zero: null means "not estimated yet", and the planner treats
-- it as a default-length block while showing a dash rather than inventing a
-- number. Capped at a day, because a task longer than a day is a project.
alter table tasks
  add column duration_min int
  check (duration_min is null or (duration_min > 0 and duration_min <= 1440));

comment on column tasks.duration_min is
  'Estimated minutes. Null = not estimated (never zero). Drives the day planner block height and the printed diary.';
