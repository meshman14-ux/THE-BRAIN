import { describe, it, expect } from "vitest";
import {
  CLOSED_STAGES,
  STAGES,
  WIN_RATE_FLOOR,
  isOpen,
  pipelineLine,
  pipelineTotals,
  rankDeals,
  stageLabel,
  toDeal,
  winRate,
} from "../src/lib/pipeline";
import type { Opportunity } from "../src/lib/types";

const TODAY = "2026-08-14";

function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "o1",
    title: "Fencing job",
    kind: null,
    stage: "lead",
    pillar_id: null,
    person_id: null,
    value_est: null,
    next_step: null,
    next_step_date: null,
    ...over,
  };
}

const deal = (over: Partial<Opportunity> = {}) => toDeal(opp(over), TODAY);

/* ------------------------------------------------------------------ */

describe("stages", () => {
  it("knows its five", () => {
    expect(STAGES).toEqual(["lead", "talking", "quoted", "won", "lost"]);
    expect(CLOSED_STAGES).toEqual(["won", "lost"]);
  });

  it("labels them", () => {
    expect(stageLabel("quoted")).toBe("Quoted");
  });

  it("shows an unknown stage as itself rather than hiding it", () => {
    expect(stageLabel("negotiating")).toBe("negotiating");
  });

  it("closes on won and lost only", () => {
    expect(isOpen("lead")).toBe(true);
    expect(isOpen("quoted")).toBe(true);
    expect(isOpen("won")).toBe(false);
    expect(isOpen("lost")).toBe(false);
  });

  // Fails toward VISIBLE. Treating an unknown stage as closed would drop a
  // real deal off the board, and a board is not obviously missing a row.
  it("treats an unrecognised stage as open", () => {
    expect(isOpen("negotiating")).toBe(true);
    expect(isOpen("")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("toDeal — whose move is it", () => {
  it("flags a next step past its date", () => {
    const d = deal({ next_step: "Send quote", next_step_date: "2026-08-01" });
    expect(d.attention).toBe("overdue");
    expect(d.daysToStep).toBe(-13);
  });

  it("separates today from overdue", () => {
    expect(deal({ next_step_date: TODAY }).attention).toBe("today");
  });

  it("is clear when the step is still ahead", () => {
    expect(deal({ next_step: "Call", next_step_date: "2026-09-01" }).attention).toBe("clear");
  });

  // The state this table is worth having for.
  it("flags an open deal with no next step at all", () => {
    expect(deal({ value_est: 5000 }).attention).toBe("unowned");
  });

  it("counts a written step with no date as owned", () => {
    expect(deal({ next_step: "Chase Dave" }).attention).toBe("clear");
  });

  it("does not count whitespace as a step", () => {
    expect(deal({ next_step: "   " }).attention).toBe("unowned");
  });

  // A won deal is a record, not a thing to do.
  it("never asks for attention on a closed deal", () => {
    expect(deal({ stage: "won", next_step_date: "2020-01-01" }).attention).toBe("clear");
    expect(deal({ stage: "lost" }).attention).toBe("clear");
  });

  it("reads an unestimated value as null, never zero", () => {
    expect(deal().value).toBeNull();
    expect(deal({ value_est: 0 }).value).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe("rankDeals", () => {
  it("puts overdue first, then today, then unowned, then clear", () => {
    const deals = [
      deal({ id: "d", title: "Clear", next_step: "x", next_step_date: "2026-09-01" }),
      deal({ id: "c", title: "Unowned" }),
      deal({ id: "b", title: "Today", next_step_date: TODAY }),
      deal({ id: "a", title: "Overdue", next_step_date: "2026-08-01" }),
    ];
    expect(rankDeals(deals).map((d) => d.opportunity.title)).toEqual([
      "Overdue",
      "Today",
      "Unowned",
      "Clear",
    ]);
  });

  it("puts the most overdue first inside the overdue band", () => {
    const deals = [
      deal({ id: "a", title: "Recent", next_step_date: "2026-08-10" }),
      deal({ id: "b", title: "Ancient", next_step_date: "2026-01-01" }),
    ];
    expect(rankDeals(deals).map((d) => d.opportunity.title)).toEqual(["Ancient", "Recent"]);
  });

  it("puts closed deals last however valuable", () => {
    const deals = [
      deal({ id: "a", title: "Won", stage: "won", value_est: 99_999 }),
      deal({ id: "b", title: "Open", value_est: 1, next_step: "x" }),
    ];
    expect(rankDeals(deals).map((d) => d.opportunity.title)).toEqual(["Open", "Won"]);
  });

  // An undated step is unscheduled, not urgent.
  it("sorts an undated step after every dated one", () => {
    const deals = [
      deal({ id: "a", title: "Undated", next_step: "x" }),
      deal({ id: "b", title: "Dated", next_step: "x", next_step_date: "2026-12-01" }),
    ];
    expect(rankDeals(deals).map((d) => d.opportunity.title)).toEqual(["Dated", "Undated"]);
  });

  it("breaks a tie on the title", () => {
    const deals = [
      deal({ id: "a", title: "Zebra", next_step: "x" }),
      deal({ id: "b", title: "Apple", next_step: "x" }),
    ];
    expect(rankDeals(deals).map((d) => d.opportunity.title)).toEqual(["Apple", "Zebra"]);
  });
});

/* ------------------------------------------------------------------ */

describe("pipelineTotals", () => {
  it("is empty on an empty board", () => {
    const t = pipelineTotals([]);
    expect(t.openCount).toBe(0);
    expect(t.openValue).toBeNull();
    expect(t.complete).toBe(false);
  });

  it("sums the estimates that exist", () => {
    const t = pipelineTotals([
      deal({ id: "a", value_est: 1000 }),
      deal({ id: "b", value_est: 2500 }),
    ]);
    expect(t.openValue).toBe(3500);
    expect(t.complete).toBe(true);
    expect(t.unestimated).toBe(0);
  });

  // The refusal this module is built on: no probability weighting, and an
  // unestimated deal makes the total a floor rather than being guessed at.
  it("counts unestimated deals rather than valuing them", () => {
    const t = pipelineTotals([deal({ id: "a", value_est: 1000 }), deal({ id: "b" })]);
    expect(t.openValue).toBe(1000);
    expect(t.unestimated).toBe(1);
    expect(t.complete).toBe(false);
  });

  it("keeps closed deals out of the open figures", () => {
    const t = pipelineTotals([
      deal({ id: "a", value_est: 1000 }),
      deal({ id: "b", value_est: 5000, stage: "won" }),
      deal({ id: "c", value_est: 800, stage: "lost" }),
    ]);
    expect(t.openCount).toBe(1);
    expect(t.openValue).toBe(1000);
    expect(t.wonCount).toBe(1);
    expect(t.wonValue).toBe(5000);
    expect(t.lostCount).toBe(1);
  });

  it("counts what needs attention", () => {
    const t = pipelineTotals([
      deal({ id: "a", next_step_date: "2026-01-01" }),
      deal({ id: "b" }),
      deal({ id: "c", next_step: "x", next_step_date: "2026-12-01" }),
    ]);
    expect(t.needingAttention).toBe(2);
  });
});

/* ------------------------------------------------------------------ */

describe("winRate — silent on noise", () => {
  const closed = (won: number, lost: number) => [
    ...Array.from({ length: won }, (_, i) => deal({ id: `w${i}`, stage: "won" })),
    ...Array.from({ length: lost }, (_, i) => deal({ id: `l${i}`, stage: "lost" })),
  ];

  it("stays silent below the floor", () => {
    expect(WIN_RATE_FLOOR).toBe(5);
    const r = winRate(closed(1, 1));
    expect(r.pct).toBeNull();
    expect(r.closed).toBe(2);
  });

  it("is still silent one short of it", () => {
    expect(winRate(closed(2, 2)).pct).toBeNull();
  });

  it("speaks at the floor", () => {
    const r = winRate(closed(3, 2));
    expect(r.pct).toBe(60);
    expect(r.closed).toBe(5);
  });

  it("ignores open deals in the denominator", () => {
    const r = winRate([...closed(3, 2), deal({ id: "x" }), deal({ id: "y" })]);
    expect(r.closed).toBe(5);
    expect(r.pct).toBe(60);
  });
});

/* ------------------------------------------------------------------ */

describe("pipelineLine", () => {
  it("says nothing on an empty board", () => {
    expect(pipelineLine([])).toBeNull();
  });

  it("names the single overdue deal and how late it is", () => {
    expect(pipelineLine([deal({ next_step_date: "2026-08-01" })])).toBe(
      "Fencing job — next step was 13 days ago."
    );
  });

  it("counts them once there is more than one", () => {
    expect(
      pipelineLine([
        deal({ id: "a", next_step_date: "2026-08-01" }),
        deal({ id: "b", next_step_date: "2026-08-05" }),
      ])
    ).toBe("2 next steps are past their date.");
  });

  it("falls back to today's steps", () => {
    expect(pipelineLine([deal({ next_step_date: TODAY })])).toBe("1 next step is due today.");
  });

  it("then to the deals nobody has a move on", () => {
    expect(pipelineLine([deal({ value_est: 900 })])).toBe(
      "1 open deal has no next step, which is how they go quiet."
    );
  });

  it("pluralises that", () => {
    expect(pipelineLine([deal({ id: "a" }), deal({ id: "b" })])).toBe(
      "2 open deals have no next step, which is how they go quiet."
    );
  });

  it("is silent when every open deal has a step still ahead", () => {
    expect(pipelineLine([deal({ next_step: "Call", next_step_date: "2026-12-01" })])).toBeNull();
  });

  // Closed deals are never anybody's homework.
  it("ignores a closed deal with an ancient step", () => {
    expect(pipelineLine([deal({ stage: "won", next_step_date: "2020-01-01" })])).toBeNull();
  });
});
