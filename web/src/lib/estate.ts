/**
 * The estate view — every venture grouped by what it is DOING, not by its
 * stage label.
 *
 * `/empire` already lists divisions and their stages. This asks the different
 * question: which of these is earning, which is being built, and which is
 * parked? Three answers, and the honest one is usually "more parked than you
 * thought" — which is the point of showing it.
 */

export type EstateState = "earning" | "building" | "parked";

export type VentureLike = {
  id: string;
  name: string;
  stage: string;
  status: string;
  progress: number;
  external_system?: string | null;
};

/**
 * A venture is PARKED if it is not active — that is a decision already taken,
 * so it outranks whatever the stage says. EARNING means it has reached
 * revenue. Everything else active is BUILDING, including `idea`: a division
 * you have not started is still one you intend to.
 */
export function estateState(v: VentureLike): EstateState {
  if (v.status !== "active") return "parked";
  if (v.stage === "revenue") return "earning";
  return "building";
}

export const ESTATE_ORDER: EstateState[] = ["earning", "building", "parked"];

export const ESTATE_WORD: Record<EstateState, string> = {
  earning: "Earning",
  building: "Being built",
  parked: "Parked",
};

export const ESTATE_LINE: Record<EstateState, string> = {
  earning: "Money is coming in.",
  building: "Work is going in. Nothing is coming out yet.",
  parked: "Deliberately not being worked on.",
};

/**
 * MAINFRAME is a pointer row, never a subject (§A1) — it is a separate live
 * system and this repo must never present it as something to work on.
 */
export function isSubject(v: VentureLike): boolean {
  return !v.external_system;
}

export type EstateGroup = { state: EstateState; ventures: VentureLike[] };

/**
 * Grouped, biggest-progress first within each group. Every group is returned
 * even when empty: "nothing is earning" is the most useful sentence this page
 * can say, and dropping the group would hide it.
 */
export function groupEstate(ventures: VentureLike[]): EstateGroup[] {
  const subjects = ventures.filter(isSubject);
  return ESTATE_ORDER.map((state) => ({
    state,
    ventures: subjects
      .filter((v) => estateState(v) === state)
      .sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name)),
  }));
}

/**
 * One line over the whole estate. It counts rather than judges — but it does
 * say plainly when nothing is earning, because that is the fact the page
 * exists to surface.
 */
export function estateLine(ventures: VentureLike[]): string {
  const groups = groupEstate(ventures);
  const n = (s: EstateState) => groups.find((g) => g.state === s)?.ventures.length ?? 0;
  const total = groups.reduce((sum, g) => sum + g.ventures.length, 0);
  if (total === 0) return "No divisions yet.";
  if (n("earning") === 0) {
    return `${total} divisions. None earning yet — ${n("building")} being built, ${n("parked")} parked.`;
  }
  return `${total} divisions · ${n("earning")} earning, ${n("building")} being built, ${n("parked")} parked.`;
}
