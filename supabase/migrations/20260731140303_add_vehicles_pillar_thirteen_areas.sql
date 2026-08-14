-- Adds Vehicles as a 13th area (8 LIFE / 5 EMPIRE), amending locked decision 3
-- from 12 to 13 with Jay's explicit sign-off. His blueprint tracks three
-- vehicles with tax and MOT dates; those have hard deadlines and no home in
-- the original twelve, where they would fall into Home & Admin and get lost.
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
    ('life',   'Vehicles',              '🚗', 'Never miss tax, MOT or insurance. Every renewal seen coming.', 7),
    ('life',   'Money & Security',      '💷', 'Know the numbers. Spend deliberately. Keep a buffer.',      8),
    ('empire', 'Ventures',              '🚀', 'Every venture is either growing or being decided about.',   9),
    ('empire', 'Property & Assets',     '🏗️', 'Every asset earns, appreciates, or gets sold.',           10),
    ('empire', 'Capital & Investments', '📈', 'Money works, or it is idle by choice.',                    11),
    ('empire', 'Brand & Network',       '📡', 'Reputation compounds. Feed it weekly.',                    12),
    ('empire', 'Systems & Tools',       '⚙️', 'The system that runs the empire is maintained, not hoped for.', 13);
end;
$$;
