import { describe, it, expect } from "vitest";
import {
  FLOOR_PER_WEEK,
  FLOOR_VISIBLE_AT,
  SESSION_KINDS,
  WINDOW_DAYS,
  keystoneEarned,
  kindLabel,
  leadWithLogger,
  logLabel,
  restart,
  restartLine,
} from "../src/lib/restart";

const TODAY = "2026-08-14";

/** n days before today, as an ISO date. */
function ago(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const on = (...days: number[]) => days.map((n) => ({ on_date: ago(n) }));

/* ------------------------------------------------------------------ */

describe("what counts as a session", () => {
  it("offers four kinds, including one that refuses to categorise", () => {
    expect(SESSION_KINDS).toEqual(["walk", "home", "gym", "other"]);
  });

  it("labels them in his words", () => {
    expect(kindLabel("walk")).toBe("Walk");
    expect(kindLabel("other")).toBe("Something");
  });

  it("shows an unrecognised kind rather than hiding it", () => {
    expect(kindLabel("swim")).toBe("swim");
  });
});

/* ------------------------------------------------------------------ */

describe("stages", () => {
  it("is cold with nothing at all", () => {
    const r = restart([], TODAY);
    expect(r.stage).toBe("cold");
    expect(r.total).toBe(0);
    expect(r.recent).toBe(0);
    expect(r.daysSince).toBeNull();
  });

  it("calls exactly one session ever the first, however long ago", () => {
    expect(restart(on(0), TODAY).stage).toBe("first");
    expect(restart(on(200), TODAY).stage).toBe("first");
  });

  it("is going once something is happening but the floor is not in view", () => {
    const r = restart(on(1, 4), TODAY);
    expect(r.stage).toBe("going");
    expect(r.recent).toBe(2);
  });

  it("is holding once the fortnight carries enough to see the floor", () => {
    const r = restart(on(1, 3, 6, 9), TODAY);
    expect(r.stage).toBe("holding");
    expect(r.recent).toBe(4);
  });

  it("counts only the fortnight as recent, but everything as total", () => {
    const r = restart(on(1, 3, 40, 90), TODAY);
    expect(r.recent).toBe(2);
    expect(r.total).toBe(4);
    expect(WINDOW_DAYS).toBe(14);
  });

  it("puts the boundary at 14 days exclusive, matching TRAINING_WINDOW_DAYS", () => {
    expect(restart(on(13), TODAY).recent).toBe(1);
    expect(restart(on(14), TODAY).recent).toBe(0);
  });

  it("ignores a session dated in the future rather than counting it", () => {
    const r = restart([{ on_date: "2026-12-01" }, ...on(2)], TODAY);
    expect(r.total).toBe(1);
    expect(r.daysSince).toBe(2);
  });

  it("reads days since from the most recent, whatever order they arrive in", () => {
    expect(restart(on(9, 1, 5), TODAY).daysSince).toBe(1);
  });
});

/* ------------------------------------------------------------------ */

describe("the floor stays hidden until it is nearly in reach", () => {
  // The rule most likely to be softened by someone adding "just a small
  // progress hint", which is why each half has its own test.
  it("does not show the floor at zero", () => {
    const r = restart([], TODAY);
    expect(r.showFloor).toBe(false);
    expect(r.perWeek).toBeNull();
  });

  it("does not show it after one", () => {
    expect(restart(on(0), TODAY).showFloor).toBe(false);
  });

  it("still does not show it at three in the fortnight", () => {
    const r = restart(on(1, 4, 8), TODAY);
    expect(r.showFloor).toBe(false);
    expect(r.perWeek).toBeNull();
  });

  it("shows it at four", () => {
    const r = restart(on(1, 4, 8, 11), TODAY);
    expect(FLOOR_VISIBLE_AT).toBe(4);
    expect(r.showFloor).toBe(true);
    expect(r.perWeek).toBe(2);
  });

  // A true number and a discouraging one, with nothing to do about it.
  it("computes no per-week figure while the floor is hidden", () => {
    expect(restart(on(1), TODAY).perWeek).toBeNull();
    expect(restart(on(1, 2, 3), TODAY).perWeek).toBeNull();
  });

  it("keeps Jay's own standard rather than inventing a gentler one", () => {
    expect(FLOOR_PER_WEEK).toBe(4);
  });
});

/* ------------------------------------------------------------------ */

describe("coming back is never a broken streak", () => {
  it("marks a return after a full window", () => {
    const r = restart(on(20, 30, 40), TODAY);
    expect(r.returning).toBe(true);
    expect(r.stage).toBe("going");
  });

  it("does not call one session ever a return — it was never a run", () => {
    expect(restart(on(60), TODAY).returning).toBe(false);
    expect(restart(on(60), TODAY).stage).toBe("first");
  });

  it("is not returning while sessions are still inside the window", () => {
    expect(restart(on(2, 30), TODAY).returning).toBe(false);
  });

  // Nothing in this module may render a fall.
  it("never reports a smaller number than it did before, on any history", () => {
    const histories = [on(), on(0), on(0, 3), on(0, 3, 6), on(0, 3, 6, 9)];
    for (const h of histories) {
      const r = restart(h, TODAY);
      expect(r.recent).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeGreaterThanOrEqual(r.recent);
    }
  });
});

/* ------------------------------------------------------------------ */

describe("restartLine", () => {
  it("at zero, names what one session unlocks and no frequency at all", () => {
    const line = restartLine(restart([], TODAY));
    expect(line).toContain("One session is the whole target");
    expect(line).not.toContain("4");
    expect(line).not.toContain("week");
  });

  it("marks the first one as the hardest", () => {
    expect(restartLine(restart(on(0), TODAY))).toBe(
      "One logged today. That is the hardest one done."
    );
  });

  it("asks for a second without asking for four", () => {
    const line = restartLine(restart(on(3), TODAY));
    expect(line).toContain("A second is what makes it a pattern");
    expect(line).not.toContain("floor");
  });

  it("calls a return a restart rather than a repair", () => {
    const line = restartLine(restart(on(20, 40), TODAY));
    expect(line).toContain("restart, not a repair");
  });

  it("says it is happening without scoring it", () => {
    expect(restartLine(restart(on(1, 5), TODAY))).toBe(
      "2 in the last fortnight. It is happening."
    );
  });

  it("names the floor only once it is visible", () => {
    const line = restartLine(restart(on(1, 4, 8, 11), TODAY));
    expect(line).toContain("floor of 4");
  });

  // No line at any stage may scold.
  it("never says missed, behind, failed or should", () => {
    const stages = [on(), on(0), on(3), on(1, 5), on(20, 40), on(1, 3, 6, 9)];
    for (const h of stages) {
      const line = restartLine(restart(h, TODAY)).toLowerCase();
      for (const word of ["missed", "behind", "failed", "should", "only", "just"]) {
        expect(line, `"${word}" in: ${line}`).not.toContain(word);
      }
    }
  });
});

/* ------------------------------------------------------------------ */

describe("what the page leads with", () => {
  it("invites at zero and instructs afterwards", () => {
    expect(logLabel(restart([], TODAY))).toBe("Log the first one");
    expect(logLabel(restart(on(1, 4), TODAY))).toBe("Log a session");
  });

  // Readiness needs 14 wearable readings and there are none. A large
  // well-built box saying "not yet" is why nobody opened this page.
  it("leads with the logger while there is nothing to be ready for", () => {
    expect(leadWithLogger(restart([], TODAY))).toBe(true);
    expect(leadWithLogger(restart(on(2), TODAY))).toBe(true);
    expect(leadWithLogger(restart(on(20, 40), TODAY))).toBe(true);
  });

  it("steps back once training is actually running", () => {
    expect(leadWithLogger(restart(on(1, 3, 6, 9), TODAY))).toBe(false);
  });
});

describe("the keystone claim is shown as a claim while it is one", () => {
  // habits.keystone marks Training as the habit the dashboard leads with.
  // Jay's own answer on 2026-08-14: aspirational, not true.
  it("is unearned on an empty fortnight", () => {
    expect(keystoneEarned(restart([], TODAY))).toBe(false);
    expect(keystoneEarned(restart(on(30), TODAY))).toBe(false);
  });

  it("is earned by a single session inside the window", () => {
    expect(keystoneEarned(restart(on(5), TODAY))).toBe(true);
  });
});
