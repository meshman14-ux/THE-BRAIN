-- What it actually took.
--
-- Buehler, Griffin & Ross (1994): people underestimate their own task times
-- even when they know they have been wrong before — awareness of past
-- overruns does not fix the bias, because each new task feels atypical. The
-- only correction with a track record is statistical: compare the estimate
-- against the distribution of your own completed work (reference class
-- forecasting) and apply the observed multiplier.
--
-- That is impossible without this column, so it goes in at the same time as
-- duration_min rather than later. Null means "not recorded" — never zero.
alter table tasks
  add column actual_min int
  check (actual_min is null or (actual_min > 0 and actual_min <= 1440));

comment on column tasks.actual_min is
  'Minutes actually taken. Null = not recorded (never zero). Paired with duration_min it yields a personal estimate multiplier per area.';
