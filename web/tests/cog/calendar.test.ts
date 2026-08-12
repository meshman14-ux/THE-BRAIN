/**
 * THE COG — Google free/busy, converted into the engine's frame.
 *
 * Google speaks UTC instants. The engine speaks naive local. Vercel runs
 * the server in UTC, so "just use local time" would silently shift every
 * focus block by an hour for half the year — the same class of mistake as
 * the F3 bug, which is why the zone is named explicitly and tested here
 * rather than left to the runtime.
 */
import { describe, expect, it } from "vitest";
import { busyFromGoogle, toNaiveLocal, TIMEZONE } from "../../src/lib/cogstate";
import { allocateFocus, defaultConfig } from "../../src/lib/cog";
import { baseProfile, baseState } from "./base-state";

const SUMMER = "2026-08-13"; // BST, UTC+1
const WINTER = "2026-01-14"; // GMT, UTC+0

describe("toNaiveLocal", () => {
  it("adds the British Summer Time offset", () => {
    expect(toNaiveLocal(`${SUMMER}T09:00:00Z`)).toBe(`${SUMMER}T10:00:00`);
  });

  it("adds nothing in winter", () => {
    expect(toNaiveLocal(`${WINTER}T09:00:00Z`)).toBe(`${WINTER}T09:00:00`);
  });

  it("handles the clock going forward, mid-transition", () => {
    // 2026-03-29 01:00 UTC is the moment BST begins.
    expect(toNaiveLocal("2026-03-29T00:30:00Z")).toBe("2026-03-29T00:30:00");
    expect(toNaiveLocal("2026-03-29T01:30:00Z")).toBe("2026-03-29T02:30:00");
  });

  it("renders midnight as 00, not 24", () => {
    expect(toNaiveLocal(`${WINTER}T00:00:00Z`)).toBe(`${WINTER}T00:00:00`);
  });

  it("rolls the date when the offset pushes past midnight", () => {
    expect(toNaiveLocal("2026-08-13T23:30:00Z")).toBe("2026-08-14T00:30:00");
  });

  it("says nothing about an unparseable instant", () => {
    expect(toNaiveLocal("not a date")).toBeNull();
  });

  it("names its zone rather than trusting the runtime's", () => {
    expect(TIMEZONE).toBe("Europe/London");
  });
});

describe("busyFromGoogle", () => {
  it("converts and keeps the day's blocks", () => {
    const { source, busy } = busyFromGoogle(
      [{ start: `${SUMMER}T08:00:00Z`, end: `${SUMMER}T09:00:00Z` }],
      SUMMER
    );
    expect(source).toBe("google");
    expect(busy).toEqual([{ start: `${SUMMER}T09:00:00`, end: `${SUMMER}T10:00:00` }]);
  });

  it("drops a block belonging to another day entirely", () => {
    expect(
      busyFromGoogle([{ start: "2026-08-20T08:00:00Z", end: "2026-08-20T09:00:00Z" }], SUMMER).busy
    ).toHaveLength(0);
  });

  it("clips an overnight block rather than dropping it", () => {
    // A night shift genuinely occupies the start of the day, and losing it
    // would offer him a focus block he is asleep in.
    const { busy } = busyFromGoogle(
      [{ start: "2026-08-12T21:00:00Z", end: `${SUMMER}T05:00:00Z` }],
      SUMMER
    );
    expect(busy).toHaveLength(1);
    expect(busy[0].start).toBe(`${SUMMER}T00:00:00`);
    expect(busy[0].end).toBe(`${SUMMER}T06:00:00`);
  });

  it("returns them in order", () => {
    const { busy } = busyFromGoogle(
      [
        { start: `${SUMMER}T14:00:00Z`, end: `${SUMMER}T15:00:00Z` },
        { start: `${SUMMER}T08:00:00Z`, end: `${SUMMER}T09:00:00Z` },
      ],
      SUMMER
    );
    expect(busy.map((b) => b.start)).toEqual([`${SUMMER}T09:00:00`, `${SUMMER}T15:00:00`]);
  });

  it("says google even when the day is completely free", () => {
    // "Connected, and nothing booked" is a real answer and a useful one.
    // It must not look like "no calendar at all", which is the absence of
    // an answer — the two produce different advice by design.
    const { source, busy } = busyFromGoogle([], SUMMER);
    expect(source).toBe("google");
    expect(busy).toHaveLength(0);
  });

  it("survives junk instants without dropping the good ones", () => {
    const { busy } = busyFromGoogle(
      [
        { start: "nonsense", end: "also nonsense" },
        { start: `${SUMMER}T08:00:00Z`, end: `${SUMMER}T09:00:00Z` },
      ],
      SUMMER
    );
    expect(busy).toHaveLength(1);
  });
});

describe("it reaches the focus slot correctly", () => {
  it("a real meeting shortens the block, in local time", () => {
    // 08:00-09:00 UTC is 09:00-10:00 BST, inside the 08:30-12:30 window.
    // Read as UTC it would have blocked 08:00-09:00 and produced a
    // different, wrong answer.
    const s = baseState();
    s.date = SUMMER;
    s.calendar = busyFromGoogle(
      [{ start: `${SUMMER}T08:00:00Z`, end: `${SUMMER}T09:00:00Z` }],
      SUMMER
    );
    const slot = allocateFocus(s, [], baseProfile(), defaultConfig)!;
    expect(slot.start).toBe(`${SUMMER}T10:00:00`);
    expect(slot.end).toBe(`${SUMMER}T12:30:00`);
    expect(slot.source).toBe("google");
  });

  it("a free day gives the whole deep-work window", () => {
    const s = baseState();
    s.date = SUMMER;
    s.calendar = busyFromGoogle([], SUMMER);
    const slot = allocateFocus(s, [], baseProfile(), defaultConfig)!;
    expect(slot.durationMin).toBe(240);
    expect(slot.quality).toBe("prime");
  });
});
