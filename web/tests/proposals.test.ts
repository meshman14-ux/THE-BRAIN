import { describe, it, expect } from "vitest";
import {
  actionWord,
  captureLine,
  confidenceWord,
  confirmLine,
  isConfirmable,
  isOpen,
  rankProposals,
  readSheetCode,
  readUnclear,
  tally,
  targetWord,
  type CaptureRow,
  type ProposalRow,
} from "../src/lib/proposals";

const cap = (over: Partial<CaptureRow> = {}): CaptureRow => ({
  id: "c1",
  storage_path: "u/1.jpg",
  mime_type: "image/jpeg",
  status: "extracted",
  doc_type: "mot_certificate",
  title: "MOT — WF57 XWD",
  confidence: 0.94,
  error: null,
  captured_at: "2026-08-17T10:00:00Z",
  ...over,
});

const prop = (over: Partial<ProposalRow> = {}): ProposalRow => ({
  id: "p1",
  target_table: "vehicles",
  target_id: "v1",
  action: "update",
  label: "MOT due 14 Mar 2027 on Zafira",
  rationale: null,
  confidence: 0.9,
  status: "proposed",
  error: null,
  ...over,
});

describe("captureLine speaks in words, not column values", () => {
  it("covers every state", () => {
    expect(captureLine(cap({ status: "pending" }))).toBe("Waiting to be read");
    expect(captureLine(cap({ status: "processing" }))).toBe("Reading it now…");
    expect(captureLine(cap({ status: "extracted" }))).toBe("MOT — WF57 XWD");
    expect(captureLine(cap({ status: "failed", error: "too blurry" }))).toContain("too blurry");
  });

  it("falls back when a title never arrived", () => {
    expect(captureLine(cap({ status: "extracted", title: null }))).toBe("Read, waiting on you");
    expect(captureLine(cap({ status: "failed", error: null }))).toBe("Could not read it");
  });
});

describe("isConfirmable", () => {
  it("is true only once something has been read", () => {
    expect(isConfirmable(cap({ status: "extracted" }))).toBe(true);
    for (const s of ["pending", "processing", "failed"]) {
      expect(isConfirmable(cap({ status: s }))).toBe(false);
    }
  });
});

describe("confidenceWord — null is not zero", () => {
  it("bands the score", () => {
    expect(confidenceWord(0.95)).toBe("clear");
    expect(confidenceWord(0.7)).toBe("readable");
    expect(confidenceWord(0.4)).toContain("check it");
  });
  it("returns null when unscored rather than inventing a band", () => {
    expect(confidenceWord(null)).toBeNull();
    expect(confidenceWord(undefined)).toBeNull();
    expect(confidenceWord(NaN)).toBeNull();
  });
  it("scores zero as the worst band, not as unscored", () => {
    expect(confidenceWord(0)).toContain("check it");
  });
});

describe("readUnclear / readSheetCode — jsonb is never trusted", () => {
  it("reads a good list", () => {
    expect(readUnclear({ unclear: ["the expiry day", "the garage name"] })).toHaveLength(2);
  });
  it("discards anything malformed", () => {
    expect(readUnclear(null)).toEqual([]);
    expect(readUnclear({})).toEqual([]);
    expect(readUnclear({ unclear: "one thing" })).toEqual([]);
    expect(readUnclear({ unclear: [1, "", "  ", "real"] })).toEqual(["real"]);
  });
  it("normalises a sheet code and rejects rubbish", () => {
    expect(readSheetCode({ sheet_code: " brn-veh-1 " })).toBe("BRN-VEH-1");
    expect(readSheetCode({ sheet_code: "" })).toBeNull();
    expect(readSheetCode({})).toBeNull();
    expect(readSheetCode("BRN-VEH-1")).toBeNull();
  });
});

describe("targetWord / actionWord", () => {
  it("names the module, not the table", () => {
    expect(targetWord("debts")).toBe("Money");
    expect(targetWord("notes")).toBe("The vault");
    expect(targetWord("people_contacts")).toBe("People");
  });
  it("falls back to the raw name rather than hiding an unknown target", () => {
    expect(targetWord("widgets")).toBe("widgets");
  });
  it("distinguishes a new row from a change", () => {
    expect(actionWord("insert")).toBe("new");
    expect(actionWord("update")).toBe("update");
  });
});

describe("tally", () => {
  it("counts each state and reports settled only when nothing is open", () => {
    const t = tally([
      prop({ id: "a", status: "proposed" }),
      prop({ id: "b", status: "applied" }),
      prop({ id: "c", status: "rejected" }),
      prop({ id: "d", status: "failed" }),
    ]);
    expect(t).toMatchObject({ open: 1, applied: 1, rejected: 1, failed: 1, settled: false });
  });

  it("an empty capture is not 'settled' — there was nothing to settle", () => {
    expect(tally([]).settled).toBe(false);
  });

  it("settles when every proposal is decided", () => {
    expect(tally([prop({ status: "applied" }), prop({ id: "z", status: "rejected" })]).settled).toBe(true);
  });
});

describe("rankProposals — the undecided is the work", () => {
  it("puts open first, then failed, then settled", () => {
    const order = rankProposals([
      prop({ id: "applied", status: "applied", label: "a" }),
      prop({ id: "rejected", status: "rejected", label: "b" }),
      prop({ id: "failed", status: "failed", label: "c" }),
      prop({ id: "open", status: "proposed", label: "d" }),
    ]).map((p) => p.id);
    expect(order).toEqual(["open", "failed", "applied", "rejected"]);
  });

  it("within a group, updating something you track outranks creating something new", () => {
    const order = rankProposals([
      prop({ id: "new", action: "insert", label: "New vehicle" }),
      prop({ id: "chg", action: "update", label: "MOT due" }),
    ]).map((p) => p.id);
    expect(order).toEqual(["chg", "new"]);
  });
});

describe("isOpen / confirmLine", () => {
  it("only a proposed row is open", () => {
    expect(isOpen(prop({ status: "proposed" }))).toBe(true);
    expect(isOpen(prop({ status: "applied" }))).toBe(false);
  });

  it("says what is being asked, and stops asking once nothing is", () => {
    expect(confirmLine(tally([prop()]))).toBe("1 thing to confirm.");
    expect(confirmLine(tally([prop(), prop({ id: "2" })]))).toBe("2 things to confirm.");
    expect(confirmLine(tally([prop({ status: "applied" })]))).toBe("Done — 1 accepted.");
    expect(confirmLine(tally([]))).toBe("Nothing to confirm on this one.");
  });
});
