-- Two distinctions the schema was missing.
--
-- 1 · DEBTS THAT CLOSE vs BILLS THAT RECUR.
--
-- Eight rows sit in `debts`, but four of them look like recurring
-- liabilities rather than arrears: car tax, car insurance, and two council
-- taxes. A recurring bill never reaches zero, so it can never leave a
-- thermometer and can never be a finish — and the whole reason the payoff
-- view works for Jay is that closing an account is a visible completion
-- (Gal & McShane, JMR 2012: accounts closed predicts payoff, independent
-- of amount).
--
-- Mixing the two means "clear the debt" — clause one of a twenty-year
-- vision — can never be true.
--
-- The flag defaults FALSE, so nothing is reclassified behind his back.
-- Council tax ARREARS do close; council tax as an ongoing liability does
-- not, and only Jay knows which his are. The system offers the switch and
-- says why. Surface, never decide.

alter table debts
  add column recurring boolean not null default false;

comment on column debts.recurring is
  'True for a bill that never reaches zero. Excluded from the debt-free total and from payoff order, because a thing that cannot close cannot be a finish. Default false: nothing is reclassified without Jay saying so.';

-- 2 · THE KEYSTONE HABIT.
--
-- Six daily habits, zero logs ever. Six permanently-open checkboxes is six
-- chances to fail before breakfast, and — given that Jay is motivated
-- almost entirely by visible completion — a habit board is the purest
-- possible expression of a thing that never finishes.
--
-- Training is the keystone by his own choice: it carries sleep, mood and
-- food behind it, his own standard sets it at 4 a week rather than 7, and
-- it is the only one that leaves a trace on his watch, so it can be logged
-- with zero taps once Health Connect is feeding.
--
-- `tracked` is the important column. Untracked habits are not deleted and
-- not deactivated — keep doing them, stop counting them. Nothing here
-- removes a habit; it removes the obligation to record it.

alter table habits
  add column tracked  boolean not null default true,
  add column keystone boolean not null default false;

comment on column habits.tracked is
  'Whether the habit counts, streaks, and appears on the board. Untracked is not inactive: keep doing it, stop counting it.';
comment on column habits.keystone is
  'The one habit the system leads with. At most one should be true.';

-- Training becomes the keystone; the rest stay active but stop counting.
update habits set keystone = true,  tracked = true  where name = 'Training';
update habits set keystone = false, tracked = false where name <> 'Training';

-- At most one keystone, enforced rather than hoped for.
create unique index habits_one_keystone
  on habits (user_id) where keystone;
