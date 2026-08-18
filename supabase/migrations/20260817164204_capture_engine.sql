-- THE BRAIN — Capture Engine
-- Human-in-the-loop document capture: photo in, extraction out, nothing written
-- to a real table until Jay confirms. Two tables:
--   captures         one row per photo/document
--   capture_proposals one row per suggested write, each individually confirmable

create table if not exists public.captures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  storage_path  text not null,
  mime_type     text not null default 'image/jpeg',
  source        text not null default 'upload'
                check (source in ('upload','camera','email','cowork','sheet')),
  status        text not null default 'pending'
                check (status in ('pending','processing','extracted','confirmed','rejected','failed')),
  doc_type      text,
  title         text,
  raw_text      text,
  extraction    jsonb not null default '{}'::jsonb,
  confidence    numeric,
  error         text,
  drive_file_id text,
  drive_url     text,
  captured_at   timestamptz not null default now(),
  processed_at  timestamptz,
  confirmed_at  timestamptz,
  meta          jsonb not null default '{}'::jsonb
);

comment on table public.captures is
  'One row per captured photo/document. Nothing here is truth until a proposal is applied — this table is evidence, not data.';
comment on column public.captures.extraction is
  'Full structured output from the extraction pass: entities, dates, money, people, classification.';

create table if not exists public.capture_proposals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  capture_id   uuid not null references public.captures(id) on delete cascade,
  target_table text not null,
  target_id    uuid,
  action       text not null check (action in ('insert','update')),
  payload      jsonb not null default '{}'::jsonb,
  label        text not null,
  rationale    text,
  confidence   numeric,
  status       text not null default 'proposed'
                check (status in ('proposed','accepted','rejected','applied','failed')),
  applied_at   timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

comment on table public.capture_proposals is
  'AI suggests, Jay confirms, system applies. One row per proposed write so each can be accepted or rejected on its own — never all-or-nothing.';
comment on column public.capture_proposals.label is
  'Human-readable one-liner shown on the confirm screen, e.g. "MOT due 12 Mar 2027 on the Transit".';

create index if not exists captures_user_status_idx
  on public.captures (user_id, status, captured_at desc);
create index if not exists capture_proposals_capture_idx
  on public.capture_proposals (capture_id, status);
create index if not exists capture_proposals_open_idx
  on public.capture_proposals (user_id, status) where status = 'proposed';

alter table public.captures enable row level security;
alter table public.capture_proposals enable row level security;

drop policy if exists own on public.captures;
create policy own on public.captures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own on public.capture_proposals;
create policy own on public.capture_proposals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
