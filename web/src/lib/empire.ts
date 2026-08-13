/* ------------------------------------------------------------------ *
 * EMPIRE_OS — reading the filing, and the one number it exists to produce
 *
 * The divisions are grouped by HOW EACH ONE EARNS rather than by
 * category. Filed by category the empire cannot score itself against the
 * sentence it exists to satisfy; filed by maintenance load it can, and
 * the answer falls straight out of the grouping.
 *
 * FOUR QUESTIONS, ONE FILING. Jay wanted all four answered, and they are
 * — but only one of them comes from the grouping itself. The others come
 * from facts each division carries:
 *
 *   how much earns without me   → the grouping (Property + Digital vs Trade)
 *   where my hours go next      → `nextStep`, per division
 *   which to kill               → the Menu half of Pipeline, and dormancy
 *   income replacement          → revenue per parent, once there is any
 *
 * Pure. Rows in, readings out — no database, no clock.
 * ------------------------------------------------------------------ */

import { EMPIRE_PARENTS } from "./parents";

/** How much of you a parent costs to keep earning. */
export const MAINTENANCE_LOAD: Record<
  string,
  { load: "none" | "low" | "medium" | "high"; line: string }
> = {
  property: { load: "low", line: "Earns while you sleep, once it is let." },
  digital: { load: "low", line: "Built once, then mostly left alone." },
  product: { load: "medium", line: "Needs making, listing and posting." },
  trade: { load: "high", line: "Hours for money. Stops when you stop." },
  pipeline: { load: "none", line: "Not started, so it costs nothing yet." },
};

/** The parents whose whole point is that they keep earning without him. */
export const PASSIVE_PARENTS = ["property", "digital"] as const;

export type DivisionRow = {
  id: string;
  name: string;
  status: string;
  stage: string | null;
  one_liner: string | null;
  created_at?: string | null;
  meta?: unknown;
};

export type Division = {
  id: string;
  name: string;
  parent: string;
  /** Running, as opposed to backlog or parked. */
  live: boolean;
  stage: string | null;
  oneLiner: string | null;
  /** Pipeline only: will start, or might. */
  pipeline: "queue" | "menu" | null;
  /** The single division being proved end to end. */
  proving: boolean;
  /** A platform he also OPERATES, so it is not honestly passive. */
  operated: boolean;
};

/**
 * `ventures.meta` is jsonb — validate, never trust.
 *
 * An unfiled division falls to Pipeline rather than vanishing or crashing
 * a page. Better to see a venture in the wrong drawer than not at all.
 */
export function divisionsFrom(rows: DivisionRow[]): Division[] {
  const ids = new Set(EMPIRE_PARENTS.map((p) => p.id));
  return rows.map((r) => {
    const m =
      typeof r.meta === "object" && r.meta !== null && !Array.isArray(r.meta)
        ? (r.meta as Record<string, unknown>)
        : {};
    const parent = typeof m.parent === "string" && ids.has(m.parent) ? m.parent : "pipeline";
    const pipeline =
      m.pipeline === "queue" || m.pipeline === "menu" ? (m.pipeline as "queue" | "menu") : null;
    return {
      id: r.id,
      name: r.name,
      parent,
      live: r.status === "active",
      stage: r.stage,
      oneLiner: r.one_liner,
      // Only meaningful inside Pipeline. A queued division that has since
      // gone live keeps the tag harmlessly; nothing reads it outside.
      pipeline: parent === "pipeline" ? (pipeline ?? "menu") : null,
      proving: m.proving === true,
      operated: m.operated === true,
    };
  });
}

export function divisionsIn(divisions: Division[], parentId: string): Division[] {
  return divisions.filter((d) => d.parent === parentId);
}

/** The one being proved end to end, or null when none is nominated. */
export function provingGround(divisions: Division[]): Division | null {
  return divisions.find((d) => d.proving) ?? null;
}

/* ------------------------------------------------------------------ *
 * The shape — the number the old structure could not produce
 * ------------------------------------------------------------------ */

export type EmpireShape = {
  earningWithoutYou: number;
  hoursForMoney: number;
  /** Divisions filed as passive that he actually operates. */
  operated: number;
  /** The sentence the grouping exists to produce. */
  line: string;
};

/**
 * Counts DIVISIONS, not parents.
 *
 * "Two parents are low maintenance" says nothing — it is how many actual
 * ventures sit in each column that decides where the hours go.
 *
 * Only LIVE divisions count. A pipeline idea that would one day earn
 * without him is not currently earning anything, and counting intentions
 * as assets is how a portfolio flatters itself.
 *
 * An OPERATED platform is counted as passive but NAMED, rather than
 * discounted to a fraction. A number with a caveat beside it is more
 * honest than a fudged number with none — the reader can weigh the
 * caveat, and cannot weigh an adjustment they never see.
 */
export function empireShape(divisions: Division[]): EmpireShape {
  const live = divisions.filter((d) => d.live);
  const passive = live.filter((d) =>
    (PASSIVE_PARENTS as readonly string[]).includes(d.parent)
  );
  const trade = live.filter((d) => d.parent === "trade");
  const operated = passive.filter((d) => d.operated);

  if (live.length === 0) {
    return {
      earningWithoutYou: 0,
      hoursForMoney: 0,
      operated: 0,
      line: "Nothing is running, so there is nothing to weigh.",
    };
  }

  const caveat =
    operated.length > 0
      ? ` ${operated.map((d) => d.name).join(" and ")} is counted with the first, though you operate it.`
      : "";

  return {
    earningWithoutYou: passive.length,
    hoursForMoney: trade.length,
    operated: operated.length,
    line:
      trade.length > passive.length
        ? `${passive.length} built to earn without you, ${trade.length} that stop when you stop. The vision points one way and the weight sits the other.${caveat}`
        : `${passive.length} built to earn without you, ${trade.length} that stop when you stop.${caveat}`,
  };
}

/* ------------------------------------------------------------------ *
 * Pipeline — a queue and a menu, which are different promises
 * ------------------------------------------------------------------ */

export type PipelineSplit = { queue: Division[]; menu: Division[]; line: string };

/**
 * The distinction Jay asked for, and it is a real one.
 *
 * A QUEUE is a promise: these get started, in order. A MENU is not: they
 * stay visible, cost nothing, and are never nagged about. Collapsing the
 * two would either turn ten ideas into ten obligations, or turn seven
 * genuine intentions into wallpaper — and a backlog that means nothing is
 * a backlog you stop reading.
 */
export function pipelineSplit(divisions: Division[]): PipelineSplit {
  const inPipeline = divisionsIn(divisions, "pipeline");
  const queue = inPipeline.filter((d) => d.pipeline === "queue");
  const menu = inPipeline.filter((d) => d.pipeline === "menu");
  return {
    queue,
    menu,
    line:
      queue.length === 0 && menu.length === 0
        ? "Nothing waiting."
        : `${queue.length} you have said you will start, ${menu.length} you might. Only the first ${queue.length === 1 ? "is" : "are"} a promise.`,
  };
}
