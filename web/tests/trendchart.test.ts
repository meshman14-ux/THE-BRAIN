import { describe, it, expect } from "vitest";
import { linePoints } from "../src/components/hud/TrendChart";

describe("linePoints — one reading is a value, not a trend", () => {
  it("refuses to draw a line through fewer than two points", () => {
    expect(linePoints([])).toBeNull();
    expect(linePoints([42])).toBeNull();
  });

  it("draws a line once there are two or more", () => {
    expect(linePoints([1, 2])).not.toBeNull();
    expect(linePoints([1, 2, 3])?.split(" ")).toHaveLength(3);
  });

  it("spans the full chart width from first to last point", () => {
    const p = linePoints([1, 2, 3])!;
    const first = p.split(" ")[0].split(",")[0];
    const last = p.split(" ")[2].split(",")[0];
    expect(Number(first)).toBe(0);
    expect(Number(last)).toBe(300);
  });
});
