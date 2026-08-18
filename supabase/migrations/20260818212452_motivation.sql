create table if not exists public.motivation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.motivation enable row level security;

drop policy if exists "own" on public.motivation;
create policy "own" on public.motivation for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
