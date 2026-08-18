-- push_subscriptions — one row per device that asked to be buzzed.
-- The endpoint is the device's push address (unique — re-enabling on the same
-- device updates, never duplicates). p256dh/auth are the browser's public
-- encryption keys for this subscription: not secrets, but scoped to the owner
-- like everything else. Same uniform RLS shape as all 44 existing tables.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own" on public.push_subscriptions;
create policy "own" on public.push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
