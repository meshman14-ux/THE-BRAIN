/* ------------------------------------------------------------------ *
 * THE COG — the public surface
 *
 * A daily momentum engine: it reads the day and returns a momentum score,
 * three priorities, one focus block, one "do this next" pulse, an identity
 * check and a handful of micro-actions — every output carrying both a
 * human rationale and a machine rule trace.
 *
 * Nothing in `cog/` imports from outside `cog/`: no Supabase, no React, no
 * THE BRAIN tables, no clock, no randomness. The adapter that turns BRAIN
 * rows into a MomentumState lives OUTSIDE this boundary, in
 * `src/lib/cogstate.ts` — the same arrangement HYBRID uses, and for the
 * same reason: every rule in here is testable without a database, and
 * `advise(state, profile, config)` called twice with the same arguments
 * returns byte-identical advice. That determinism is a tested property,
 * not an aspiration, and it is what makes a past day auditable.
 *
 *   types.ts     the domain — state, priorities, slots, pulses, advice
 *   config.ts    weights and thresholds, resolved from cog_config
 *   score.ts     the momentum indicator and the priority score
 *   rules.ts     the rulebook, executable — P (priority), F (focus),
 *                N (pulse), I (identity), M (micro-actions)
 *   explain.ts   every rationale template, so tone lives in one file
 *   advisor.ts   composition — the one pure entry point
 *
 * THE TWO CONTRACTS, from the blueprint, both tested:
 *
 *   1. EXPLAINABILITY — no recommendation without a rationale and a
 *      ruleTrace. An advisor that cannot show its working is an oracle,
 *      and this system has never been willing to be one.
 *   2. WRITE OWNERSHIP — the engine writes nothing at all. The
 *      orchestrator writes only cog_* tables, plus tasks.do_date /
 *      priority / meta.cog on an ACCEPTED verdict. A human edit always
 *      wins and is recorded as feedback, never resolved as a conflict.
 * ------------------------------------------------------------------ */

export * from "./types";
export * from "./config";
export * from "./score";
export * from "./rules";
export * from "./explain";
export * from "./advisor";
