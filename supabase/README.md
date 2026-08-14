# `supabase/` — what is in here and how far it can be trusted

Project **`qttroyuajpyelfrbxzzt`** (eu-west-2, London). Captured 2026-08-13.

## The two files that matter

| | |
|---|---|
| `schema.sql` | **The end state.** Every table, key, constraint, index, policy and function, read from `information_schema` and `pg_catalog`. This is what the database looks like right now. |
| `migrations/` | **How it got there.** One file per applied migration, named `<version>_<name>.sql` to match `supabase_migrations.schema_migrations` exactly. |

Neither is an instruction. **Do not run anything in this directory against the live
project.** Every migration here has already been applied, and several are destructive if
re-run — `20260730120555` opens with six `drop table … cascade`, and `20260811222457`
would duplicate all 387 ingredient rows.

To change the schema, write a *new* migration. To refresh these files, re-read the
catalogue; do not hand-edit them, or they will start lying the way the prose in CLAUDE.md
did.

## Provenance, so you know what you are reading

**21 of the 22 migration files are byte-exact captures** of
`supabase_migrations.schema_migrations.statements[1]`, verified by character count against
the source after writing. They are not reconstructions and not summaries — including the
original authors' comments, which is most of their value. `20260811144907` explains its own
column by citing Buehler, Griffin & Ross on the planning fallacy; `20260812123125` cites
Gal & McShane on why closing an account predicts payoff. That reasoning would have been
lost with the project.

**The exception is `20260811222457_meals.sql`.** The applied migration was 3,159 characters
of DDL only. The file here is ~51KB because it also carries the seed — fifty meals and 387
ingredient rows — which was applied separately, as a hand-written record rather than a
catalogue capture. It is kept as-is because it holds data no other file does.

## What this does and does not buy you

It buys reproducibility: the project can now be rebuilt from this repo, in order, from
nothing.

It does not buy a rollback. The `rollback` column exists in `schema_migrations` and is
empty for all 22, so there is no down-migration for anything. Reversing a change means
writing the reverse by hand against `schema.sql`.

## The prefix warning, because it is the one that could actually bite

Eight tables are prefixed `cog_` (migration `20260812172334_cog_core`). They are an engine
layer over THE BRAIN's own data — an event outbox, daily state, pulses, telemetry.

The sibling repo **`meshman14-ux/the-cog` is a different system that prefixes *every*
object `cog_` as well**, and **`cog_events` exists in both schemas meaning entirely
different things** — an outbox row here, an event booking there. These are not that system;
there is no `cog_access`, `cog_units`, `cog_stock` or `cog_incidents` here. But a migration
written for one project and run against the other would find names it recognises and would
not fail loudly.

**Check the project ref before running any `cog_*` migration anywhere.**
