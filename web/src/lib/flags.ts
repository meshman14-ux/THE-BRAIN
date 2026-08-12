/* ------------------------------------------------------------------ *
 * Feature flags
 *
 * One flag, and the bar for adding another is high: a flag is a branch
 * that has to be reasoned about on every read of the code around it, and
 * a codebase full of them is a codebase where nobody knows what is
 * actually running.
 *
 * THE COG has one because it is the first module that WRITES to a BRAIN
 * table on Jay's behalf. Everything before it surfaced and let him decide.
 * Being able to turn that off from the Vercel dashboard, without a deploy,
 * is worth one branch.
 * ------------------------------------------------------------------ */

/** Off unless explicitly switched on — an unset variable is not consent. */
export function flagOn(raw: string | undefined): boolean {
  return raw === "1" || raw?.toLowerCase() === "true";
}

export const COG_ENABLED = flagOn(process.env.NEXT_PUBLIC_COG);
