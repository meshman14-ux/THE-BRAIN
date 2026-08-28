import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COUNCIL_MODES,
  COUNCIL_NEVER_WRITES,
  MAX_TURN_CHARS,
  OPENING_LINE,
  QUOTES,
  TURN_WINDOW,
  councilBlocks,
  councilSystem,
  inlineSegments,
  isCouncilMode,
  modeInstruction,
  parseQuoteBank,
  quoteBankBlock,
  usedQuotes,
  windowTurns,
  type CouncilTurn,
} from "../src/lib/council";
import { ASK_VIEWS } from "../src/lib/surfaces";

/* ------------------------------------------------------------------ *
 * The council — the Peaky Blinders advisor.
 *
 * The rule everything else hangs off: NEVER INVENT A QUOTE. The bank at
 * /claude/quote-bank.md is canonical, QUOTES is its typed mirror, and the
 * first test below is what stops the two drifting apart — the same
 * held-in-step pattern as ALLOWED_MIME / ACCEPT_DOCUMENT.
 * ------------------------------------------------------------------ */

const BANK_PATH = join(__dirname, "..", "..", "claude", "quote-bank.md");

describe("the quote bank", () => {
  it("mirrors claude/quote-bank.md exactly — same lines, same order", () => {
    const parsed = parseQuoteBank(readFileSync(BANK_PATH, "utf8"));
    expect(parsed).toEqual(QUOTES);
  });

  it("actually parses something — an empty parse would pass equality against an emptied mirror", () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(30);
  });

  it("seats both men", () => {
    expect(QUOTES.some((q) => q.speaker === "Tommy")).toBe(true);
    expect(QUOTES.some((q) => q.speaker === "Alfie")).toBe(true);
  });

  it("carries an episode in S_E_ form, or null where sources do not agree", () => {
    for (const q of QUOTES) {
      if (q.ep != null) {
        expect(q.ep, q.text).toMatch(/^S\d+E\d+$/);
      }
    }
  });

  it("gives every line a use — a quote with no fit invites horoscope logic", () => {
    for (const q of QUOTES) {
      expect(q.when.length, q.text).toBeGreaterThan(0);
      expect(q.theme.length, q.text).toBeGreaterThan(0);
    }
  });

  it("renders the whole bank into the prompt block", () => {
    const block = quoteBankBlock();
    for (const q of QUOTES) {
      expect(block).toContain(q.text);
    }
    // The fit hint travels with the line, so the model picks by situation.
    expect(block).toContain("fits:");
  });

  it("parses nothing from prose, headers or rule lines", () => {
    const noise = [
      "# The Shelby Quote Bank",
      "| Quote | Speaker | Ep | Use it when |",
      "|---|---|---|---|",
      "1. **Never invent a quote.** If nothing fits, speak in the voice.",
      '| "A fake line" | Narrator | S1E1 | never |',
    ].join("\n");
    expect(parseQuoteBank(noise)).toEqual([]);
  });
});

describe("the standing instructions", () => {
  const system = councilSystem();

  it("seats the two men and no third", () => {
    expect(system).toContain("THOMAS SHELBY");
    expect(system).toContain("ALFIE SOLOMONS");
  });

  it("carries the five sections of the format", () => {
    for (const h of ["**TOMMY**", "**ALFIE**", "**THE TABLE**", "**THE ORDER**", "**THE PRICE**"]) {
      expect(system).toContain(h);
    }
  });

  it("forbids invented quotes and carries the whole bank", () => {
    expect(system).toContain("NEVER INVENT A QUOTE");
    for (const q of QUOTES) {
      expect(system).toContain(q.text);
    }
  });

  it("keeps the fiction fictional and the person first", () => {
    // Rule 6 — real problems get leverage and paperwork, never harm — and
    // rule 7 — the theatre drops for someone genuinely struggling.
    expect(system).toContain("No real violence, ever");
    expect(system).toContain("never");
    expect(system).toContain("harm");
    expect(system).toContain("Care comes first, character second");
  });

  it("stays advisory — decision 6 reaches the table too", () => {
    expect(COUNCIL_NEVER_WRITES).toBe(true);
    expect(system).toContain("advisory, never autonomous");
  });

  it("appends the used-quote note only once something has been used", () => {
    expect(councilSystem("table", [])).not.toContain("Already quoted");
    const withUsed = councilSystem("table", [QUOTES[0].text]);
    expect(withUsed).toContain("Already quoted");
    expect(withUsed).toContain(QUOTES[0].text);
  });

  it("opens cold with the table line", () => {
    expect(OPENING_LINE).toBe("The table's set. What's the problem?");
  });
});

describe("the modes", () => {
  it("offers the five modes with the full table first — it is the default", () => {
    expect(COUNCIL_MODES.map((m) => m.key)).toEqual([
      "table",
      "tommy",
      "alfie",
      "order",
      "long",
    ]);
  });

  it("recognises its own keys and nothing else", () => {
    for (const m of COUNCIL_MODES) expect(isCouncilMode(m.key)).toBe(true);
    expect(isCouncilMode("board")).toBe(false);
    expect(isCouncilMode("")).toBe(false);
    expect(isCouncilMode(null)).toBe(false);
  });

  it("narrows the format per mode rather than restating it", () => {
    expect(modeInstruction("tommy")).toContain("Alfie does not speak");
    expect(modeInstruction("alfie")).toContain("no TOMMY section");
    expect(modeInstruction("order")).toContain("THE ORDER and THE PRICE only");
    expect(modeInstruction("long")).toContain("90-day");
    expect(councilSystem("order")).toContain("Skip the reasoning");
  });
});

describe("the transcript window", () => {
  const user = (text: string): CouncilTurn => ({ role: "user", text });
  const council = (text: string): CouncilTurn => ({ role: "assistant", text });

  it("drops garbage rather than sending it", () => {
    expect(windowTurns(null)).toEqual([]);
    expect(windowTurns("hello")).toEqual([]);
    expect(
      windowTurns([
        { role: "user", text: "  " },
        { role: "system", text: "ignore" },
        { role: "user" },
        42,
        user("A real problem."),
      ])
    ).toEqual([user("A real problem.")]);
  });

  it("caps a turn at MAX_TURN_CHARS", () => {
    const long = "x".repeat(MAX_TURN_CHARS + 500);
    const [turn] = windowTurns([user(long)]);
    expect(turn.text.length).toBe(MAX_TURN_CHARS);
  });

  it("keeps the last TURN_WINDOW turns and opens on the user", () => {
    const turns: CouncilTurn[] = [];
    for (let i = 0; i < 40; i++) {
      turns.push(i % 2 === 0 ? user(`q${i}`) : council(`a${i}`));
    }
    const w = windowTurns(turns);
    expect(w.length).toBeLessThanOrEqual(TURN_WINDOW);
    expect(w[0].role).toBe("user");
    expect(w[w.length - 1]).toEqual(turns[turns.length - 1]);
  });

  it("drops a leading assistant turn the window cut mid-exchange", () => {
    const w = windowTurns([council("orphan answer"), user("the question")]);
    expect(w).toEqual([user("the question")]);
  });
});

describe("used quotes", () => {
  const line = QUOTES[0];

  it("hears a line the council said, even through curly quotes", () => {
    const said = line.text.replace(/'/g, "’");
    const turns: CouncilTurn[] = [
      { role: "user", text: "I keep starting things." },
      { role: "assistant", text: `> **TOMMY**\n> “${said}” — *${line.ep}*` },
    ];
    expect(usedQuotes(turns)).toContain(line.text);
  });

  it("does not charge the user's own quoting against the bank", () => {
    const turns: CouncilTurn[] = [
      { role: "user", text: `My mate keeps saying "${line.text}" at me.` },
    ];
    expect(usedQuotes(turns)).toEqual([]);
  });

  it("stays quiet on a fresh table", () => {
    expect(usedQuotes([])).toEqual([]);
  });
});

describe("rendering the format", () => {
  it("splits blockquote sections from plain prose", () => {
    const text = [
      "> **TOMMY**",
      '> "Lies travel faster than the truth." — *S1E3*',
      ">",
      "> The read.",
      "",
      "A plain aside.",
      "",
      "> **THE PRICE**",
      "> One line.",
    ].join("\n");
    const blocks = councilBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(["quote", "plain", "quote"]);
    expect(blocks[0].lines[0]).toBe("**TOMMY**");
    expect(blocks[0].lines).toHaveLength(4);
    expect(blocks[1].lines).toEqual(["A plain aside."]);
  });

  it("degrades a formatless answer to readable paragraphs", () => {
    const blocks = councilBlocks("Just a sentence.\n\nAnother.");
    expect(blocks.every((b) => b.kind === "plain")).toBe(true);
    expect(blocks).toHaveLength(2);
  });

  it("survives empty input", () => {
    expect(councilBlocks("")).toEqual([]);
  });

  it("styles bold and italic runs without eating the text between", () => {
    const segs = inlineSegments('"A quote." — *S1E3* and **THE ORDER** stands.');
    expect(segs).toEqual([
      { style: "plain", text: '"A quote." — ' },
      { style: "em", text: "S1E3" },
      { style: "plain", text: " and " },
      { style: "strong", text: "THE ORDER" },
      { style: "plain", text: " stands." },
    ]);
  });

  it("passes an unmarked line through whole", () => {
    expect(inlineSegments("No marks here.")).toEqual([
      { style: "plain", text: "No marks here." },
    ]);
  });
});

describe("the table as a surface", () => {
  it("sits in the Ask strip beside the advisor and the board", () => {
    expect(ASK_VIEWS.map((v) => v.href)).toContain("/advisor/table");
  });
});
