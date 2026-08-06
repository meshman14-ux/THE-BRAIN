-- Applied to the live project on 2026-08-06 as migration `calendar_integration`.
-- Captured here so the schema stops being tribal knowledge (§A8 item 1).
-- DO NOT RE-APPLY.

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,

  -- AES-256-GCM ciphertext, never plaintext. RLS makes this row readable by
  -- its owner, and "its owner" includes anything running in his browser.
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,

  -- The dedicated calendar THE BRAIN writes to, and only ever that one.
  calendar_id text,
  calendar_name text,

  sync_token text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  meta jsonb not null default '{}'::jsonb,

  unique (user_id, provider)
);

alter table public.integrations enable row level security;

drop policy if exists "own" on public.integrations;
create policy "own" on public.integrations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A task has at most one event. Without this a retried push could leave two
-- events for one task and no way to tell which one is real.
create unique index if not exists calendar_sync_user_task_uniq
  on public.calendar_sync (user_id, task_id)
  where task_id is not null;

create index if not exists calendar_sync_conflict_idx
  on public.calendar_sync (user_id)
  where conflict;
