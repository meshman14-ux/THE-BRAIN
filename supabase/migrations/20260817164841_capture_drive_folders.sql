-- Where captured documents get filed in Drive.
-- Data, not code: adding a folder is an insert, not a deploy.
create table if not exists public.drive_folders (
  key        text primary key,
  folder_id  text not null,
  label      text not null,
  sort_order integer not null default 0
);

comment on table public.drive_folders is
  'Maps a capture route key to a Google Drive folder id. Seeded 17 Aug 2026 from the four-folder tree agreed at onboarding Step 7.';

alter table public.drive_folders enable row level security;

drop policy if exists read_all on public.drive_folders;
create policy read_all on public.drive_folders
  for select to authenticated using (true);

insert into public.drive_folders (key, folder_id, label, sort_order) values
  ('root',            '1en6RJTnoXn7-rsodsECxcTZoDWR695Jc', 'THE BRAIN — DOCUMENTS',  0),
  ('inbox',           '1dztfzA-DTKgeGwE5Uzif9PdjGViYJgr8', '_INBOX',                 1),
  ('property',        '1e4Ttq56EvauUeNd_PIoUJa4S2fAj4_GJ', 'PROPERTY',              10),
  ('property.kathleen_st',  '15oDU5PlDhC1JjRSSbhGpu_vUvccYdN1X', 'Kathleen St',     11),
  ('property.bedlinog',     '1m3KlzlGw4sYCuxqWRekuMNf6-C6ASfKZ', 'Bedlinog House',  12),
  ('property.treharris',    '11TTt_BJaKWnUracfo8PtP_1Wr2VM7C9j', 'Treharris House', 13),
  ('money',           '1YxiwFt2YPBeM3bqgkHYHvMB9BwPth8El', 'MONEY',                 20),
  ('money.debts',     '15yD6YYSMo7CDMeo_29pM0UXxU9no48bD', 'Debts',                 21),
  ('money.bills',     '1HueVGRs9c9Db4PFfZAXve3O3rvS7_0UT', 'Bills',                 22),
  ('money.bank',      '1yf5fF1kRQ6KDVSrQWAZj7TNbheh_GHpd', 'Bank',                  23),
  ('money.tax',       '137TmNz8Cp_6r402kdgKpxK3oXNPgT96q', 'Tax',                   24),
  ('money.vehicles',  '1kKfj7Zw2A1FNGpCKP7NMjkoobe5L1hbx', 'Vehicles',              25),
  ('work',            '18LYWp4-hzl4fQgovnS-Pu7jHWw0MWiak', 'WORK',                  30),
  ('work.building_maintenance', '1dzKfzA0c4Tc14SQPeKBgA9XDYku-F2vS', 'Building Maintenance', 31),
  ('work.traderz',    '1WVyWU3KWbaVRjxzAIexx8FqdlBVVoSN0', 'A to Z Traderz',        32),
  ('work.invoices',   '1egwdFLwKf20MHeuqJn9VpBut7e4ZFqJu', 'Invoices',              33),
  ('work.receipts',   '1Ekgcr3VcCywWgepAhNKu0-w_HCPzzOUn', 'Receipts',              34),
  ('life',            '1qxpCGIqRtB6pxF5vidmaNS1iYqPsywCa', 'LIFE',                  40),
  ('life.id',         '10yQKbAT-Lg_nFMlte8jZfhJ7X6YdoMip', 'ID',                    41),
  ('life.medical',    '1MLA9IpguiTt9Qdvul-WSRM5WwaGNHFNJ', 'Medical',               42),
  ('life.insurance',  '1lrhIrNkmkrhwhCUoCnfY9lIk1rKesbpQ', 'Insurance',             43),
  ('life.qualifications', '1a3anH6c5F52k8-1S1NB_siY7osbClug8', 'Qualifications',    44)
on conflict (key) do update
  set folder_id = excluded.folder_id, label = excluded.label, sort_order = excluded.sort_order;

-- Where the file went, and under what name.
alter table public.captures add column if not exists drive_folder_key text;
alter table public.captures add column if not exists drive_filename text;
