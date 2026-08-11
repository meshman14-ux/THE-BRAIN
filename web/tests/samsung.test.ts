import { describe, expect, it } from "vitest";
import {
  importPlan,
  localDate,
  offsetMinutes,
  parseCsv,
  parseInstant,
  planSummary,
  sniffKind,
  toUpsertRows,
} from "../src/lib/samsung";

/* ------------------------------------------------------------------ *
 * Fixtures — shaped like the real export: metadata line first, headers
 * second, prefixed column names, time_offset, trailing commas.
 * ------------------------------------------------------------------ */

const STEPS_CSV = [
  "com.samsung.shealth.tracker.pedometer_day_summary,201,count",
  "day_time,step_count,active_time,time_offset,deviceuuid,",
  // 2026-08-01 00:00 UTC · offset +0100 → local date 2026-08-01
  "1785542400000,8231,3600000,UTC+0100,phone,",
  // Same day from the watch, larger count — the larger row must win.
  "1785542400000,8410,3720000,UTC+0100,watch,",
  // 23:30 UTC on the 1st, offset +0100 → local 2nd — the offset applied.
  "1785627000000,512,300000,UTC+0100,phone,",
].join("\n");

const SLEEP_CSV = [
  "com.samsung.shealth.sleep,20,count",
  "com.samsung.health.sleep.start_time,com.samsung.health.sleep.end_time,com.samsung.health.sleep.time_offset,extra,",
  // 23:30 → 06:30 UTC, +0100: wakes 07:30 local on the 2nd. 7h.
  "2026-08-01 23:30:00.000,2026-08-02 06:30:00.000,UTC+0100,x,",
  // A second fragment the same morning: 07:00→08:00 UTC → sums to 8h.
  "2026-08-02 07:00:00.000,2026-08-02 08:00:00.000,UTC+0100,x,",
  // Backwards row — refused, not "negative sleep".
  "2026-08-03 08:00:00.000,2026-08-03 07:00:00.000,UTC+0100,x,",
].join("\n");

const WEIGHT_CSV = [
  "com.samsung.health.weight,6,count",
  "weight,start_time,time_offset,comment,",
  "86.4,2026-08-01 07:10:00.000,UTC+0100,,",
  // Later reading the same day wins.
  "86.1,2026-08-01 19:40:00.000,UTC+0100,,",
].join("\n");

const NUTRITION_CSV = [
  "com.samsung.shealth.food_intake,5,count",
  "calorie,protein,start_time,time_offset,meal_type,",
  "520,32.5,2026-08-01 08:00:00.000,UTC+0100,breakfast,",
  "740,41.2,2026-08-01 13:00:00.000,UTC+0100,lunch,",
].join("\n");

/* ------------------------------------------------------------------ */

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,"b,c","say ""hi""",d\r\n1,2,3,4');
    expect(rows).toEqual([
      ["a", "b,c", 'say "hi"', "d"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("keeps trailing empty fields — the export ends rows with a comma", () => {
    expect(parseCsv("a,b,\n1,2,")).toEqual([
      ["a", "b", ""],
      ["1", "2", ""],
    ]);
  });
});

describe("time", () => {
  it("reads the export's offsets and refuses what it cannot read", () => {
    expect(offsetMinutes("UTC+0100")).toBe(60);
    expect(offsetMinutes("UTC-0530")).toBe(-330);
    expect(offsetMinutes("")).toBe(0);
    expect(offsetMinutes("GMT+1")).toBe(0);
  });

  it("accepts both instant spellings", () => {
    expect(parseInstant("1785542400000")).toBe(1785542400000);
    expect(parseInstant("2026-08-01 23:30:00.000")).toBe(
      Date.UTC(2026, 7, 1, 23, 30, 0)
    );
    expect(parseInstant("")).toBeNull();
    expect(parseInstant("yesterday")).toBeNull();
  });

  it("puts a late-evening step on the LOCAL day, not the UTC one", () => {
    // 23:30 UTC on the 1st is 00:30 on the 2nd in Cardiff summer time.
    expect(localDate(Date.UTC(2026, 7, 1, 23, 30), "UTC+0100")).toBe("2026-08-02");
    expect(localDate(Date.UTC(2026, 7, 1, 23, 30), undefined)).toBe("2026-08-01");
  });
});

describe("sniffKind", () => {
  it("recognises by filename first, then by columns", () => {
    expect(sniffKind("com.samsung.shealth.tracker.pedometer_day_summary.csv", [])).toBe("steps");
    expect(sniffKind("mystery.csv", ["day_time", "step_count"])).toBe("steps");
    expect(sniffKind("com.samsung.health.weight.202608.csv", [])).toBe("weight");
    expect(sniffKind("com.samsung.shealth.food_intake.csv", [])).toBe("nutrition");
    expect(sniffKind("com.samsung.shealth.exercise.csv", ["exercise_type", "start_time"])).toBeNull();
  });
});

describe("importPlan", () => {
  const plan = importPlan([
    { name: "com.samsung.shealth.tracker.pedometer_day_summary.csv", text: STEPS_CSV },
    { name: "com.samsung.shealth.sleep.csv", text: SLEEP_CSV },
    { name: "com.samsung.health.weight.csv", text: WEIGHT_CSV },
    { name: "com.samsung.shealth.food_intake.csv", text: NUTRITION_CSV },
    { name: "com.samsung.shealth.exercise.csv", text: "com.samsung.shealth.exercise,1,\nexercise_type,start_time,\n1001,2026-08-01 10:00:00.000," },
  ]);

  it("two devices counting the same day: the larger row wins, never the sum", () => {
    expect(plan.days["2026-08-01"].steps).toBe(8410);
    expect(plan.days["2026-08-01"].active_minutes).toBe(62);
  });

  it("applies the offset before taking the date", () => {
    expect(plan.days["2026-08-02"].steps).toBe(512);
  });

  it("a night belongs to its wake date, fragments sum, backwards rows refused", () => {
    expect(plan.days["2026-08-02"].sleep_hours).toBe(8);
    expect(plan.days["2026-08-03"]?.sleep_hours).toBeUndefined();
  });

  it("the last weight of the day wins", () => {
    expect(plan.days["2026-08-01"].weight_kg).toBe(86.1);
  });

  it("meals sum into the day", () => {
    expect(plan.days["2026-08-01"].calories).toBe(1260);
    expect(plan.days["2026-08-01"].protein_g).toBe(73.7);
  });

  it("names what it did not recognise, with the columns it saw", () => {
    expect(plan.unrecognised).toHaveLength(1);
    expect(plan.unrecognised[0].file).toContain("exercise");
    expect(plan.unrecognised[0].headers).toContain("exercise_type");
  });

  it("reports what it found, with row counts", () => {
    const kinds = plan.found.map((f) => f.kind).sort();
    expect(kinds).toEqual(["nutrition", "sleep", "steps", "weight"]);
  });
});

describe("toUpsertRows — the no-clobber guarantee", () => {
  it("a row carries ONLY the fields the export held", () => {
    const plan = importPlan([
      { name: "com.samsung.health.weight.csv", text: WEIGHT_CSV },
    ]);
    const rows = toUpsertRows(plan);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      on_date: "2026-08-01",
      source: "samsung",
      weight_kg: 86.1,
    });
    // The absence is the guarantee: no steps key, no sleep key, no null
    // riding along to erase a hand-typed value.
    expect("steps" in rows[0]).toBe(false);
    expect("sleep_hours" in rows[0]).toBe(false);
  });

  it("rows come out date-ordered", () => {
    const plan = importPlan([
      { name: "com.samsung.shealth.tracker.pedometer_day_summary.csv", text: STEPS_CSV },
    ]);
    expect(toUpsertRows(plan).map((r) => r.on_date)).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("planSummary", () => {
  it("counts days per field and stays quiet about absent fields", () => {
    const plan = importPlan([
      { name: "com.samsung.health.weight.csv", text: WEIGHT_CSV },
    ]);
    expect(planSummary(plan)).toEqual([{ field: "weight", days: 1 }]);
  });
});
