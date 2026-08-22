# `supabase/` — what is in here and how far it can be trusted

Project **`qttroyuajpyelfrbxzzt`** (eu-west-2, London). **Captured 2026-08-22.**
Supersedes the 2026-08-18 capture (56 tables, 33 migrations), which superseded
2026-08-13 (44 and 22).

## The two files that matter

| | |
|---|---|
| `schema.sql` | **The end state.** Every table, key, constraint, index, policy, function, trigger and view, read from `information_schema` and `pg_catalog`. This is what the database looks like right now. **69 tables, 2 views.** |
| `migrations/` | **How it got there.** One file per applied migration, named `<version>_<name>.sql` to match `supabase_migrations.schema_migrations` exactly. **37 files.** |

Neither is an instruction. **Do not run anything in this directory against the live
project.** Every migration here has already been applied, and several are destructive if
re-run — `20260730120555` opens with six `drop table … cascade`, and `20260811222457`
would duplicate all 387 ingredient rows.

To change the schema, write a *new* migration. To refresh these files, re-read the
catalogue with the queries below; do not hand-edit them, or they will start lying the way
the prose in CLAUDE.md did.

## ⚠️ This drifted once already, and it drifted quietly

Between 13 and 18 August the live project gained **eleven tables and eleven migrations**
and not one was captured. Nothing broke and nothing looked wrong, because a stale schema
file fails silently: it is only consulted when somebody rebuilds or reads it to write a
query, and both of those happen long after the drift.

The claim this directory exists to earn — *"the project can be rebuilt from this repo,
from nothing"* — was **false for five days** and nobody could have told by looking.

**And it drifted again immediately.** The 18 August capture was stale within a day:
`motivation` landed that same evening and the venture module (three tables, seven
`ventures` columns, the project's first triggers) the next afternoon, and `schema.sql`
learned about none of it until the 2026-08-22 refresh that accompanied the venture
reconcile migration. Three captures, three drifts. The rule that follows: **whenever a
migration is applied, refresh these files in the same commit.**

**More pointedly:** `body_measurements` was created by **another session at 16:36 on
2026-08-18, while this recapture was in progress**. The table count went 55 → 56 between
two queries minutes apart. This database has more than one writer. Treat these files as a
point-in-time snapshot with a date on them, never as a live mirror, and **re-read before
trusting rather than after being surprised.**

## Provenance, so you know what you are reading

**36 of the 37 migration files are byte-exact captures** of
`supabase_migrations.schema_migrations.statements`, verified on 2026-08-22 by **MD5
against the source** — a stronger check than the character count used in August, which
would not have caught a transposition. They are not reconstructions and not summaries,
including the original authors' comments, which is most of their value.
`20260811144907` explains its own column by citing Buehler, Griffin & Ross on the planning
fallacy; `20260812123125` cites Gal & McShane on why closing an account predicts payoff.
That reasoning would have been lost with the project.

**The exception is `20260811222457_meals.sql`.** The applied migration was 3,159 characters
of DDL only. The file here is ~51KB because it also carries the seed — fifty meals and 387
ingredient rows — which was applied separately, as a hand-written record rather than a
catalogue capture. It is kept as-is because it holds data no other file does.

**Three files were renamed on 2026-08-18.** `20260817_capture_attachments.sql`,
`20260817_push_subscriptions.sql` and `20260817_capture_proposal_task_vocabulary.sql`
carried a date rather than the real version string, so they sorted and matched wrongly,
and none of the three was byte-exact — one was 1,013 characters against 4,644 applied.
All three were replaced with correct, verified captures.

## How to refresh

The 13 August capture went stale partly because "re-read the catalogue" was folklore.
These are the actual queries. Run them against the live project and rewrite the matching
section of `schema.sql`.

```sql
-- tables and columns
select c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
       pg_get_expr(d.adbin, d.adrelid), a.attnotnull
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where c.relkind = 'r' order by c.relname, a.attnum;

-- every constraint: contype p = primary, u = unique, f = foreign, c = check
select cl.relname, c.conname, c.contype, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class cl on cl.oid = c.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where n.nspname = 'public' order by cl.relname, c.contype, c.conname;

-- indexes (exclude the ones constraints already own)
select indexdef from pg_indexes where schemaname = 'public'
  and indexname not like '%_pkey'
  and indexname not in (select conname from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and c.contype = 'u')
order by indexname;

-- policies, and whether RLS is actually on
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename;

-- functions: prosecdef is the SECURITY DEFINER flag, proconfig the search_path
select proname, prosecdef, proconfig from pg_proc p
join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';

-- extensions, triggers, row counts, migrations
select extname, extversion from pg_extension order by extname;
select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal;
select version, name from supabase_migrations.schema_migrations order by version;
```

**Verify rather than trust the transcription.** Two checks catch what eyes do not:

```sql
-- 1. every migration file, byte for byte
select version, md5(rtrim(array_to_string(statements, E'\n'), E'\n'))
from supabase_migrations.schema_migrations order by version;

-- 2. the whole table.column map in one checksum
select md5(string_agg(c.relname || '.' || a.attname, ',' order by c.relname, a.attname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public' and c.relkind = 'r';
```

Compare (1) against each file with its trailing newline stripped, and (2) against the same
map parsed out of `schema.sql`. At the 2026-08-22 capture that map was
`300900d793d49c41121e822b2e933d5e` across 69 tables and 750 columns (2026-08-18:
`df629322c5c449f7557d37dbd2c05c97`, 56 tables, 601 columns).

## What this does and does not buy you

It buys reproducibility: the project can be rebuilt from this repo, in order, from nothing.

It does not buy a rollback. The `rollback` column exists in `schema_migrations` and is
empty for all 37, so there is no down-migration for anything. Reversing a change means
writing the reverse by hand against `schema.sql`.

## Two warnings worth keeping

**RLS is not quite uniform, and the exception is deliberate.** All 69 tables have RLS on
and exactly one policy. Sixty-six are the same predicate — `auth.uid() = user_id` for
both `USING` and `WITH CHECK` — under two different names (`own` on 50, `own rows` on 16;
cosmetic drift between migrations, not a difference in effect). The other three —
`advisor_seats`, `drive_folders`, `smart_rules` — hold no user data, have no `user_id`
column at all, and carry `read_all`: SELECT only, `authenticated` only. No write policy
exists on them, so writes are denied and `anon` cannot read them. The two views
(`venture_portfolio`, `venture_obligations`) are `security_invoker = true`, so they add
no bypass: the caller's own RLS applies underneath.

**The `cog_` prefix is also the prefix of a different system.** Eight tables here are
prefixed `cog_` (migration `20260812172334_cog_core`) — an engine layer over THE BRAIN's
own data: an event outbox, daily state, pulses, telemetry.

The sibling repo **`meshman14-ux/the-cog` is a different system that prefixes *every*
object `cog_` as well**, and **`cog_events` exists in both schemas meaning entirely
different things** — an outbox row here, an event booking there. These are not that system;
there is no `cog_access`, `cog_units`, `cog_stock` or `cog_incidents` here. But a migration
written for one project and run against the other would find names it recognises and would
not fail loudly.

**Check the project ref before running any `cog_*` migration anywhere.**
