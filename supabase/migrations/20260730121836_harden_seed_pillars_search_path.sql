create or replace function public.seed_pillars()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.pillars where user_id = auth.uid()) then
    return;
  end if;

  insert into public.pillars (system, name, emoji, standard, sort_order) values
    ('life',   'Training & Fitness',    '🏋️', 'Move with intent at least 4 days a week.',                 1),
    ('life',   'Nutrition & Recovery',  '🥗', 'Eat and sleep like someone with plans.',                    2),
    ('life',   'Mind & Growth',         '📚', 'Learn something deliberately every week.',                  3),
    ('life',   'Family',                '🏡', 'Be present for the people who were there first.',           4),
    ('life',   'Friends & Network',     '🤝', 'Stay in touch on purpose, not by accident.',                5),
    ('life',   'Home & Admin',          '🧾', 'Nothing important rots in a drawer.',                       6),
    ('life',   'Money & Security',      '💷', 'Know the numbers. Spend deliberately. Keep a buffer.',      7),
    ('empire', 'Ventures',              '🚀', 'Every venture is either growing or being decided about.',   8),
    ('empire', 'Property & Assets',     '🏗️', 'Every asset earns, appreciates, or gets sold.',            9),
    ('empire', 'Capital & Investments', '📈', 'Money works, or it is idle by choice.',                    10),
    ('empire', 'Brand & Network',       '📡', 'Reputation compounds. Feed it weekly.',                    11),
    ('empire', 'Systems & Tools',       '⚙️', 'The system that runs the empire is maintained, not hoped for.', 12);
end;
$$;

grant execute on function public.seed_pillars() to authenticated;
