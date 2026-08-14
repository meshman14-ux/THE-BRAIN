-- Stage 4 · Phase D — the calendar connection.
--
-- `calendar_sync` already maps task <-> event (it shipped with the v1 schema).
-- What was missing is somewhere to keep the Google connection itself.
--
-- Blast radius, which is the whole point of locked decision 8: the token
-- columns hold AES-256-GCM ciphertext, never plaintext. RLS makes the row
-- readable by its owner, and "its owner" includes anything running in his
-- browser — so a refresh token in the clear here would be one XSS away from
-- being someone else's. Encrypted, it is useless without CALENDAR_TOKEN_SECRET,
-- which only ever exists as a server environment variable.

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  /* 'google_calendar' today. One row per provider per user. */
  provider text not null,

  /* AES-256-GCM ciphertext, never plaintext. */
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,

  /* The dedicated calendar THE BRAIN writes to, and only ever that one. */
  calendar_id text,
  calendar_name text,

  /* Google's incremental sync cursor, so a pull asks only for what changed. */
  sync_token text,

  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  /* The last failure, kept so a broken connection says so instead of going quiet. */
  last_error text,
  meta jsonb not null default '{}'::jsonb,

  unique (user_id, provider)
);

alter table public.integrations enable row level security;

drop policy if exists "own" on public.integrations;
create policy "own" on public.integrations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A task has at most one event. Without this, a retried push could leave two
-- events for one task and no way to tell which one is real.
create unique index if not exists calendar_sync_user_task_uniq
  on public.calendar_sync (user_id, task_id)
  where task_id is not null;

-- The conflicts panel reads this every time /calendar is opened.
create index if not exists calendar_sync_conflict_idx
  on public.calendar_sync (user_id)
  where conflict;
