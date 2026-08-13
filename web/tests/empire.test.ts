/**
 * EMPIRE_OS — the filing, and the number it exists to produce.
 *
 * The fixtures are Jay's real eighteen divisions as filed on 13 Aug 2026,
 * because a test built on invented ventures proves the arithmetic and not
 * the answer.
 */
import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_LOAD,
  PASSIVE_PARENTS,
  type DivisionRow,
  divisionsFrom,
  divisionsIn,
  empireShape,
  pipelineSplit,
  provingGround,
} from "../src/lib/empire";
import { EMPIRE_PARENTS } from "../src/lib/parents";

const row = (
  name: string,
  status: string,
  meta: Record<string, unknown>
): DivisionRow => ({
  id: name,
  name,
  status,
  stage: null,
  one_liner: null,
  meta,
});

/** The real eighteen. */
const REAL: DivisionRow[] = [
  row("Kathleen St", "active", { parent: "property" }),
  row("Bedlinog House", "active", { parent: "property" }),
  row("Treharris House", "active", { parent: "property" }),
  row("A to Z Traderz", "active", { parent: "trade", proving: true }),
  row("Building + Maintenance", "active", { parent: "trade" }),
  row("Amazon FBA", "active", { parent: "product" }),
  row("AI Software", "active", { parent: "digital" }),
  row("MAINFRAME", "active", { parent: "digital", operated: true }),
  row("Storage Solutions", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Photo Booth", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Stencil Art", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Microgreens", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Find My Stash", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Stump Pump", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Festivals", "backlog", { parent: "pipeline", pipeline: "queue" }),
  row("Coffee Shop", "backlog", { parent: "pipeline", pipeline: "menu" }),
  row("Resin & Epoxy", "backlog", { parent: "pipeline", pipeline: "menu" }),
  row("Charity (India)", "backlog", { parent: "pipeline", pipeline: "menu" }),
];

const divisions = divisionsFrom(REAL);

/* ================================================================== *
 * The filing
 * ================================================================== */

describe("divisionsFrom", () => {
  it("files all eighteen", () => {
    expect(divisions).toHaveLength(18);
  });

  it("puts every division under a parent that exists", () => {
    const ids = new Set(EMPIRE_PARENTS.map((p) => p.id));
    for (const d of divisions) expect(ids.has(d.parent), d.name).toBe(true);
  });

  it("drops an unfiled division into Pipeline rather than losing it", () => {
    // Better to see a venture in the wrong drawer than not at all.
    expect(divisionsFrom([row("New Thing", "active", {})])[0].parent).toBe("pipeline");
  });

  it("survives junk in meta", () => {
    for (const meta of [null, "nonsense", 42, { parent: 7 }, { parent: "nowhere" }]) {
      const out = divisionsFrom([{ ...row("X", "active", {}), meta }]);
      expect(out[0].parent).toBe("pipeline");
    }
  });

  it("treats an unlabelled pipeline division as MENU, never as a promise", () => {
    // Queue is a commitment. Defaulting to it would manufacture seven
    // obligations out of a missing field.
    expect(divisionsFrom([row("X", "backlog", { parent: "pipeline" })])[0].pipeline).toBe("menu");
  });

  it("carries the pipeline tag only inside Pipeline", () => {
    expect(divisionsIn(divisions, "trade").every((d) => d.pipeline === null)).toBe(true);
  });
});

describe("the confirmed placements", () => {
  it("has three properties, two trades, one product, two digital, ten pipeline", () => {
    expect(divisionsIn(divisions, "property")).toHaveLength(3);
    expect(divisionsIn(divisions, "trade")).toHaveLength(2);
    expect(divisionsIn(divisions, "product")).toHaveLength(1);
    expect(divisionsIn(divisions, "digital")).toHaveLength(2);
    expect(divisionsIn(divisions, "pipeline")).toHaveLength(10);
  });

  it("names A to Z Traderz as the one being proved", () => {
    expect(provingGround(divisions)?.name).toBe("A to Z Traderz");
  });

  it("nominates exactly one proving ground", () => {
    // Two things being proved end to end is nothing being proved.
    expect(divisions.filter((d) => d.proving)).toHaveLength(1);
  });
});

/* ================================================================== *
 * The number the old structure could not produce
 * ================================================================== */

describe("empireShape", () => {
  const shape = empireShape(divisions);

  it("counts divisions, not parents", () => {
    // "Two parents are low maintenance" says nothing. It is how many actual
    // ventures sit in each column that decides where the hours go.
    expect(shape.earningWithoutYou).toBe(5); // 3 property + 2 digital
    expect(shape.hoursForMoney).toBe(2); // 2 trade
  });

  it("counts only what is LIVE — an intention is not an asset", () => {
    // Ten pipeline ideas would one day earn without him. None of them earns
    // anything today, and counting intentions is how a portfolio flatters
    // itself.
    const allBacklog = divisionsFrom(REAL.map((r) => ({ ...r, status: "backlog" })));
    expect(empireShape(allBacklog).earningWithoutYou).toBe(0);
  });

  it("names the operated platform instead of quietly discounting it", () => {
    // A number with a caveat beside it is more honest than a fudged number
    // with none: the reader can weigh a caveat and cannot weigh an
    // adjustment they never see.
    expect(shape.operated).toBe(1);
    expect(shape.line).toContain("MAINFRAME");
    expect(shape.line).toContain("though you operate it");
  });

  it("says so plainly when the weight sits against the vision", () => {
    const heavy = divisionsFrom([
      row("P", "active", { parent: "property" }),
      row("T1", "active", { parent: "trade" }),
      row("T2", "active", { parent: "trade" }),
    ]);
    expect(empireShape(heavy).line).toContain("the weight sits the other");
  });

  it("does not say it when the weight sits with the vision", () => {
    // Jay's actual position: 5 passive against 2 trade. The warning would
    // be false, and a warning that fires when things are fine is a warning
    // you stop reading.
    expect(shape.line).not.toContain("the weight sits the other");
  });

  it("refuses to weigh an empty empire", () => {
    expect(empireShape([]).line).toContain("nothing to weigh");
  });
});

describe("maintenance load", () => {
  it("has a line for every parent", () => {
    for (const p of EMPIRE_PARENTS) {
      expect(MAINTENANCE_LOAD[p.id], p.id).toBeTruthy();
    }
  });

  it("counts property and digital as the passive ones", () => {
    expect([...PASSIVE_PARENTS]).toEqual(["property", "digital"]);
    for (const id of PASSIVE_PARENTS) expect(MAINTENANCE_LOAD[id].load).toBe("low");
    expect(MAINTENANCE_LOAD.trade.load).toBe("high");
  });
});

/* ================================================================== *
 * Queue and menu are different promises
 * ================================================================== */

describe("pipelineSplit", () => {
  const split = pipelineSplit(divisions);

  it("splits seven you will start from three you might", () => {
    expect(split.queue).toHaveLength(7);
    expect(split.menu).toHaveLength(3);
  });

  it("says which half is the promise", () => {
    // Collapsing the two would either turn ten ideas into ten obligations
    // or turn seven real intentions into wallpaper.
    expect(split.line).toContain("7 you have said you will start");
    expect(split.line).toContain("Only the first");
  });

  it("says nothing is waiting rather than printing two zeroes", () => {
    expect(pipelineSplit([]).line).toBe("Nothing waiting.");
  });
});
