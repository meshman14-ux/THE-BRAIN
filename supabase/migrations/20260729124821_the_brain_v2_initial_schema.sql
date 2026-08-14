-- THE BRAIN v2 — initial schema: links, projects, notes, tasks, habits + RLS + realtime

create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  icon        text,
  label       text not null,
  sub         text,
  href        text,
  copy_value  text,
  is_public   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  emoji       text,
  title       text not null,
  description text,
  href        text,
  tags        text[] not null default '{}',
  is_public   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  title       text,
  body        text,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  title       text not null,
  due_date    date,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  name        text not null,
  emoji       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.habit_completions (
  habit_id     uuid not null references public.habits on delete cascade,
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  completed_on date not null,
  primary key (habit_id, completed_on)
);

alter table public.links              enable row level security;
alter table public.projects           enable row level security;
alter table public.notes              enable row level security;
alter table public.tasks              enable row level security;
alter table public.habits             enable row level security;
alter table public.habit_completions  enable row level security;

create policy "own links"    on public.links              for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects" on public.projects           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes"    on public.notes              for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks"    on public.tasks              for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own habits"   on public.habits             for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own habit_completions" on public.habit_completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "public links"    on public.links    for select using (is_public = true);
create policy "public projects" on public.projects for select using (is_public = true);

alter publication supabase_realtime add table public.links;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.habits;
alter publication supabase_realtime add table public.habit_completions;
