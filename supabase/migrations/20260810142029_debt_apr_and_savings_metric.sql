-- Avalanche ordering IS "highest interest first". Without a rate the word
-- means nothing, so the column has to exist before the strategy can be
-- offered honestly.
--
-- Nullable, and null means "not recorded" rather than 0%. A missing rate
-- treated as zero would sort a credit card to the BOTTOM of the avalanche
-- and cost him real money, so the app refuses to rank on rates it does not
-- have and says so on screen instead.
alter table public.debts
  add column if not exists apr numeric;

comment on column public.debts.apr is
  'Annual interest rate, percent. NULL means not recorded — never treat it as 0, which would sort an unrecorded credit card to the bottom of an avalanche.';

-- The buffer tab measures months of cover, which needs a savings figure.
-- It is a metric rather than a column for the same reason debt was: a
-- metric gives a trend for free and the reading carries its own date.
insert into public.metrics (user_id, name, unit, direction, meta)
select
  p.user_id,
  'Savings buffer',
  '£',
  'up',
  jsonb_build_object(
    'why',
    'Months of cover on the Buffer tab. No readings yet — an empty buffer figure renders as a dash, never as £0.'
  )
from (select distinct user_id from public.pillars) p
where not exists (
  select 1 from public.metrics m
  where m.user_id = p.user_id and m.name = 'Savings buffer'
);

-- Monthly outgoings, so "months of cover" has a denominator that is his
-- rather than a guess. Also readings-free on purpose.
insert into public.metrics (user_id, name, unit, direction, meta)
select
  p.user_id,
  'Monthly outgoings',
  '£',
  'down',
  jsonb_build_object(
    'why',
    'The denominator for months of cover. Without it the Buffer tab says so rather than inventing a number.'
  )
from (select distinct user_id from public.pillars) p
where not exists (
  select 1 from public.metrics m
  where m.user_id = p.user_id and m.name = 'Monthly outgoings'
);
