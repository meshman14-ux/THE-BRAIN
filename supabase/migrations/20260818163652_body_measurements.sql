create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  on_date date not null,
  chest_cm numeric,
  waist_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  body_fat_pct numeric,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

alter table public.body_measurements enable row level security;

drop policy if exists "own" on public.body_measurements;
create policy "own" on public.body_measurements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
