-- Contact history for the cadence watchtower.
--
-- `people.last_contact` answers "when did we last speak" and is what the
-- cadence is measured against. It cannot answer "how often, over the year"
-- or hold what was said, and a log is genuinely a log — so it gets a table
-- rather than an unbounded array inside meta.
--
-- The unique key on (person_id, contacted_on) makes the one-tap button
-- idempotent: tapping twice on the same day records one conversation, not
-- two, so a double tap cannot inflate a frequency later.
create table if not exists public.people_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  contacted_on date not null,
  -- The depth note: optional ceiling on the zero-obligation floor. NULL is
  -- "logged, said nothing about it", which is different from an empty note.
  note text,
  channel text,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  unique (person_id, contacted_on)
);

create index if not exists people_contacts_user_date_idx
  on public.people_contacts (user_id, contacted_on desc);

alter table public.people_contacts enable row level security;

drop policy if exists "own" on public.people_contacts;
create policy "own" on public.people_contacts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.people_contacts is
  'One row per person per day of contact. Unique on (person_id, contacted_on) so the one-tap log is idempotent.';
comment on column public.people.cadence_days is
  'How often you intend to be in touch, in days. Defaults follow Dunbar layers: inner 5 ~7, close 15 ~30, band 50 ~90, wider ~365. NULL means no intention has been set, which is not the same as never.';
