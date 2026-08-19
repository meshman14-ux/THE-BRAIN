-- The checklist's facts (harvested from the parallel venture-module branch):
-- the rulebook is keyed off structure, type, employment and VAT, so the
-- ventures row has to be able to hold those answers. All nullable — NULL is
-- "not answered", and an unanswered fact generates no structure-specific
-- rules rather than guessing.

alter table public.ventures
  drop constraint if exists ventures_legal_structure_check;
alter table public.ventures
  add constraint ventures_legal_structure_check
  check (legal_structure is null or legal_structure in
    ('sole_trader','ltd','partnership','llp','cic','charity','none_yet'));

alter table public.ventures
  add column if not exists employs_people boolean,
  add column if not exists vat_registered boolean;
