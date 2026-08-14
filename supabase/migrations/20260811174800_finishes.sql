-- Finishes — the things that visibly completed.
--
-- Jay's reward system pays out on completion: asked what makes a day
-- good, the answer was "something visibly finished". He has then built a
-- life composed almost entirely of things that never complete — 18
-- ventures, 8 areas, 6 habits, 8 rolling debts, a 20-year vision. Not one
-- has a finish line, which is why the defining always gets done and the
-- maintaining never does.
--
-- This table is the finish line for everything the system cannot already
-- see. Completed tasks and completed diagnostic runs are DERIVED at read
-- time and never written here — a ledger that needs feeding is a ledger
-- that ends up empty. This holds only what has no timestamp anywhere
-- else: a property let, an SOP written, a debt cleared, a milestone hit.
--
-- `happened_on` is a date rather than a timestamp because a finish
-- belongs to a day, and because it is often recorded after the fact.

create table finishes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  title       text not null,
  happened_on date not null default current_date,
  kind        text not null default 'milestone'
              check (kind in ('milestone','debt','property','sop','venture','other')),
  note        text,
  created_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'
);

alter table finishes enable row level security;

create policy "own rows" on finishes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index finishes_by_date on finishes (user_id, happened_on desc);
