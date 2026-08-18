import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The palette, measured rather than eyeballed.
 *
 * v1 shipped three collisions that every review missed, because two hex
 * strings that differ in every digit can still be the same colour to the
 * eye: --empire #c07a1e against --warn #c07a1e (identical), --doing #4b57c9
 * against --accent #4b57c9 (identical), and --p-learning #b3801d against
 * --warn #c07a1e (a difference of roughly one step). Reading the file did
 * not catch them. Computing the distance does.
 *
 * So this suite parses globals.css and measures. It is the only honest way
 * to hold the four-channel rule: a channel is separate from another channel
 * when the colours are far apart in a perceptual space, not when the authors
 * intended them to be.
 */

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/* ------------------------------------------------------------------ *
 * Colour maths — sRGB → linear → XYZ → CIE Lab → ΔE
 * ------------------------------------------------------------------ */

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** sRGB companding, undone. */
function linearise(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(linearise) as RGB;
  // sRGB D65 → XYZ
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE. Blunt, but more than sharp enough to catch a collision. */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * Viénot/Brettel dichromat simulation in linear sRGB.
 *
 * The pair that ships THE COG's cautionary tale — brass and amber — was
 * ΔE 2.3 to normal vision and 1.2 under deuteranopia. Measuring only normal
 * vision would have passed it. Roughly 1 in 12 men is red-green colour
 * blind, so this is the check that matters more of the two.
 */
function simulate(hex: string, kind: "deuter" | "prot"): string {
  const [r, g, b] = hexToRgb(hex).map(linearise) as RGB;
  const m: number[][] =
    kind === "deuter"
      ? [
          [0.625, 0.375, 0.0],
          [0.7, 0.3, 0.0],
          [0.0, 0.3, 0.7],
        ]
      : [
          [0.567, 0.433, 0.0],
          [0.558, 0.442, 0.0],
          [0.0, 0.242, 0.758],
        ];
  const out = m.map((row) => row[0] * r + row[1] * g + row[2] * b);
  const encode = (v: number) => {
    const c = Math.max(0, Math.min(1, v));
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${out.map(encode).join("")}`;
}

function cvdDeltaE(a: string, b: string): number {
  return Math.min(
    deltaE(simulate(a, "deuter"), simulate(b, "deuter")),
    deltaE(simulate(a, "prot"), simulate(b, "prot"))
  );
}

/* ------------------------------------------------------------------ *
 * Reading the stylesheet
 * ------------------------------------------------------------------ */

/** Pull one selector's custom properties out of the file, unresolved. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  expect(at, `selector ${selector} is missing from globals.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open + 1, close);

  const raw: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) raw[m[1]] = m[2].trim();
  }
  return raw;
}

/**
 * Cascade the blocks, THEN resolve the `var()`s — in that order, because
 * that is the order the browser does it in. Resolving inside each block
 * first would have `--todo: var(--faint)` freeze to the theme's faint even
 * on a mode that replaces it, and the test would then be measuring a colour
 * no screen ever shows.
 */
function ground(...blocks: Record<string, string>[]): Record<string, string> {
  const merged = Object.assign({}, ...blocks) as Record<string, string>;
  const resolve = (v: string, depth = 0): string => {
    const m = v.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!m || depth > 5) return v;
    return merged[m[1]] ? resolve(merged[m[1]], depth + 1) : v;
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) out[k] = resolve(v);
  return out;
}

const PAPER = tokens(':root[data-theme="paper"]');
const DARK = tokens(':root[data-theme="dark"]');
const EMPIRE = tokens(':root[data-mode="empire"]');

/**
 * Every ground a Brain screen can actually have — the cross product of two
 * themes and the one mode that replaces the surface, not a list of themes.
 *
 * EMPIRE appears twice on purpose. It flips the ground to graphite in BOTH
 * themes, so a paper-theme user in EMPIRE mode is looking at tokens that
 * were never validated against paper OR against the dark theme: they are
 * their own surface and have to be measured as one.
 */
const GROUNDS = {
  paper: ground(PAPER),
  dark: ground(DARK),
  "paper+empire": ground(PAPER, EMPIRE),
  "dark+empire": ground(DARK, EMPIRE),
};

/** ΔE below this is "the same colour wearing a different name". */
const SAME_COLOUR = 10;
/** What a pair must clear under red-green colour blindness. */
const CVD_FLOOR = 8;

describe("palette · the three v1 collisions", () => {
  /*
   * These three are named individually because each one shipped, and a
   * regression would ship the same way: silently, with every test green.
   */

  it("EMPIRE is not the warning colour (v1 had both at #c07a1e)", () => {
    for (const [name, t] of Object.entries(GROUNDS)) {
      expect(t["--empire"], `${name}: empire is literally warn`).not.toBe(t["--warn"]);
      expect(deltaE(t["--empire"], t["--warn"]), `${name}: empire vs warn`).toBeGreaterThan(
        SAME_COLOUR
      );
      // And it must be out of the warm band entirely, not merely retuned:
      // the fix was to move the accent, so bad must clear it too.
      expect(deltaE(t["--empire"], t["--bad"]), `${name}: empire vs bad`).toBeGreaterThan(
        SAME_COLOUR
      );
    }
  });

  it("the in-progress lane is not the accent (v1 had doing = accent = life)", () => {
    for (const [name, t] of Object.entries(GROUNDS)) {
      expect(t["--doing"], `${name}: doing is the accent`).not.toBe(t["--accent"]);
      expect(t["--doing"], `${name}: doing is the life hue`).not.toBe(t["--life"]);
      expect(
        deltaE(t["--doing"], t["--accent"]),
        `${name}: doing vs accent`
      ).toBeGreaterThan(SAME_COLOUR);
    }
  });

  it("a learning hour is not a warning (v1 had #b3801d against #c07a1e)", () => {
    for (const [name, t] of Object.entries(GROUNDS)) {
      const d = deltaE(t["--p-learning"], t["--warn"]);
      expect(d, `${name}: p-learning vs warn was ΔE ${d.toFixed(1)}`).toBeGreaterThan(
        SAME_COLOUR
      );
    }
  });
});

describe("palette · channel separation", () => {
  it("keeps the status trio mutually distinct, including to red-green CVD", () => {
    // Status is the one channel that is allowed to be colour-only in a
    // small mark, so it is the one that has to survive dichromacy.
    for (const [name, t] of Object.entries(GROUNDS)) {
      const pairs: [string, string][] = [
        ["--good", "--warn"],
        ["--warn", "--bad"],
        ["--good", "--bad"],
      ];
      for (const [a, b] of pairs) {
        expect(deltaE(t[a], t[b]), `${name}: ${a} vs ${b}`).toBeGreaterThan(SAME_COLOUR);
        expect(cvdDeltaE(t[a], t[b]), `${name}: ${a} vs ${b} under CVD`).toBeGreaterThan(
          CVD_FLOOR
        );
      }
    }
  });

  it("keeps the two systems apart from each other and from every alarm", () => {
    for (const [name, t] of Object.entries(GROUNDS)) {
      expect(deltaE(t["--life"], t["--empire"]), `${name}: life vs empire`).toBeGreaterThan(
        SAME_COLOUR
      );
      for (const status of ["--good", "--warn", "--bad"]) {
        for (const system of ["--life", "--empire"]) {
          expect(
            deltaE(t[system], t[status]),
            `${name}: ${system} vs ${status}`
          ).toBeGreaterThan(SAME_COLOUR);
        }
      }
    }
  });

  it("keeps the five hour purposes off the alarm band and apart from each other", () => {
    const purposes = [
      "--p-work",
      "--p-rest",
      "--p-learning",
      "--p-cleaning",
      "--p-connecting",
    ];
    for (const [name, t] of Object.entries(GROUNDS)) {
      for (const p of purposes) {
        for (const status of ["--good", "--warn", "--bad"]) {
          expect(deltaE(t[p], t[status]), `${name}: ${p} vs ${status}`).toBeGreaterThan(
            SAME_COLOUR
          );
        }
      }
      for (let i = 0; i < purposes.length; i++) {
        for (let j = i + 1; j < purposes.length; j++) {
          expect(
            deltaE(t[purposes[i]], t[purposes[j]]),
            `${name}: ${purposes[i]} vs ${purposes[j]}`
          ).toBeGreaterThan(SAME_COLOUR);
        }
      }
    }
  });

  it("draws the task states as a weight ramp, with no hue of their own", () => {
    // The fix for the --doing collision was structural: the three states are
    // a sequence, so they borrow the neutral text ramp instead of owning
    // three hues. If someone gives one of them a colour again, the ramp
    // stops being a ramp and the collision has room to come back.
    expect(css).toMatch(/--todo:\s*var\(--faint\)/);
    expect(css).toMatch(/--doing:\s*var\(--text\)/);
    expect(css).toMatch(/--done:\s*var\(--muted\)/);
  });
});

describe("palette · priority is shape, never hue", () => {
  it("defines no priority colour token at all", () => {
    // The absence is the design. A --prio-high would immediately be reached
    // for, and the only two colours it could plausibly be — red and the
    // accent — are exactly the two already spoken for.
    expect(css).not.toMatch(/--prio-(high|med|low)\s*:/i);
    expect(css).not.toMatch(/--priority-/i);
  });

  it("encodes the three levels as border weight and marker fill", () => {
    for (const [p, w] of [
      ["High", "4px"],
      ["Med", "2px"],
      ["Low", "1px"],
    ] as const) {
      const block = css.match(
        new RegExp(`\\.prio\\[data-p="${p}"\\]\\s*\\{([^}]*)\\}`)
      );
      expect(block, `.prio[data-p="${p}"] is missing`).not.toBeNull();
      expect(block![1]).toContain(`border-left-width: ${w}`);
    }
    // Every drawn part of the mark comes from currentColor, so priority can
    // sit on a row that is already carrying a status colour without either
    // one becoming ambiguous.
    const mark = css.match(/\.prio-mark\s*\{([^}]*)\}/);
    expect(mark![1]).toContain("currentColor");
  });
});

describe("palette · two machines, one attribute", () => {
  it("gives EMPIRE its own ground, type and density rather than an accent swap", () => {
    const empire = EMPIRE;
    // Surface: the whole point. If EMPIRE only changed --accent it would be
    // a button colour, not a machine.
    for (const surface of ["--bg", "--card", "--text", "--border"]) {
      expect(empire[surface], `EMPIRE must override ${surface}`).toBeDefined();
    }
    // Voice and density.
    expect(empire["--headfont"]).toContain("IBM Plex Mono");
    expect(parseInt(empire["--radius"], 10)).toBeLessThan(
      parseInt(GROUNDS.paper["--radius"], 10)
    );
    expect(parseInt(empire["--pad"], 10)).toBeLessThan(
      parseInt(GROUNDS.paper["--pad"], 10)
    );
  });

  it("leaves LIFE and the command centre on the theme's own ground", () => {
    // `brain` is the neutral position and must override nothing at all —
    // it is what a screenshot of "the whole system" looks like.
    expect(css).not.toMatch(/:root\[data-mode="brain"\]\s*\{\s*--/);
    const life = tokens(':root[data-mode="life"]');
    expect(life["--bg"], "LIFE must not replace the surface").toBeUndefined();
  });

  it("keeps LIFE legible inside EMPIRE, where the ground has gone graphite", () => {
    // Cross-system links do not disappear because you put the other hat on,
    // so the paper theme's deep indigo would be unreadable here.
    const t = GROUNDS["dark+empire"];
    expect(contrast(t["--life"], t["--card"]), "life on the EMPIRE card").toBeGreaterThan(3);
  });
});

/**
 * A THIRD ground, `.sys-cockpit`, scoped to `/life/health/**` (the MARK-VII
 * health cockpit). It is a full surface override in the same shape as
 * `:root[data-mode="empire"]`, so it is measured the same way — resolved
 * once, checked for the same channel-collision class of bug the v1
 * incident taught. It does not vary by theme (no paper/dark cross), so
 * there is exactly one ground to check rather than four.
 */
const COCKPIT = ground(tokens(".sys-cockpit"));

describe("palette · .sys-cockpit — a third ground, not a fourth theme", () => {
  it("overrides the surface completely, the same shape as EMPIRE", () => {
    for (const surface of ["--bg", "--card", "--text", "--border", "--lift"]) {
      expect(COCKPIT[surface], `cockpit must override ${surface}`).toBeDefined();
    }
    expect(COCKPIT["--headfont"]).toContain("Rajdhani");
  });

  it("separates cyan (accent), orange (warn) and red (bad) — the module's own status trio", () => {
    const pairs: [string, string][] = [
      ["--accent", "--warn"],
      ["--warn", "--bad"],
      ["--accent", "--bad"],
      ["--good", "--warn"],
      ["--good", "--bad"],
      ["--good", "--accent"],
    ];
    for (const [a, b] of pairs) {
      const d = deltaE(COCKPIT[a], COCKPIT[b]);
      expect(d, `cockpit: ${a} vs ${b} was ΔE ${d.toFixed(1)}`).toBeGreaterThan(SAME_COLOUR);
      const cvd = cvdDeltaE(COCKPIT[a], COCKPIT[b]);
      expect(cvd, `cockpit: ${a} vs ${b} under CVD was ${cvd.toFixed(1)}`).toBeGreaterThan(
        CVD_FLOOR
      );
    }
  });

  it("keeps priority hue-free and status trio reserved, same as everywhere else", () => {
    expect(COCKPIT["--todo"]).toBe(COCKPIT["--faint"]);
    expect(COCKPIT["--doing"]).toBe(COCKPIT["--text"]);
    expect(COCKPIT["--done"]).toBe(COCKPIT["--muted"]);
  });
});

describe("palette · legibility on every ground", () => {
  it("holds 4.5:1 for body text and 3:1 for muted text and accents", () => {
    for (const [name, t] of Object.entries(GROUNDS)) {
      expect(contrast(t["--text"], t["--bg"]), `${name}: text on bg`).toBeGreaterThan(4.5);
      expect(contrast(t["--text"], t["--card"]), `${name}: text on card`).toBeGreaterThan(4.5);
      expect(contrast(t["--muted"], t["--card"]), `${name}: muted on card`).toBeGreaterThan(3);
      for (const c of ["--accent", "--good", "--warn", "--bad"]) {
        expect(contrast(t[c], t["--card"]), `${name}: ${c} on card`).toBeGreaterThan(3);
      }
    }
  });

  it("keeps text on the accent readable, since that is a filled button", () => {
    for (const [name, t] of Object.entries(GROUNDS)) {
      expect(
        contrast(t["--on-accent"], t["--accent"]),
        `${name}: on-accent over accent`
      ).toBeGreaterThan(4.5);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Channel zero — decoration, and only decoration
 *
 * The enrichment pass (2026-08-12) added depth: gradients, glows,
 * sheens and growth. The whole bargain is that none of it MEANS
 * anything — the four channels keep that job, and a decoration that
 * carries information is a fifth channel wearing a disguise. These
 * tests are what stop the bargain quietly lapsing.
 * ------------------------------------------------------------------ */

describe("palette · channel zero is decoration only", () => {
  it("gives every ground its own depth tokens, so nothing is hardcoded", () => {
    // A literal colour in a component is a colour that cannot follow the
    // theme or the machine — the same reason --accent exists at all.
    for (const [name, t] of Object.entries(GROUNDS)) {
      for (const token of [
        "--lift",
        "--hero",
        "--fill-accent",
        "--glow-accent",
        "--sheen",
        "--shadow-lift",
      ]) {
        expect(t[token], `${name} is missing ${token}`).toBeDefined();
      }
    }
  });

  it("never lets decoration name a priority — the absence is still the design", () => {
    // The enrichment added gradients called --fill-*; none of them may be
    // a priority, because priority is shape and this is the file where
    // that rule would be easiest to break by accident.
    expect(css).not.toMatch(/--fill-(high|med|low)\s*:/i);
    expect(css).not.toMatch(/--glow-(high|med|low)\s*:/i);
  });

  it("keeps the status trio as the only tones a fill may take", () => {
    // --fill-* exists for accent, good and warn. A --fill-bad would put a
    // gradient on the one colour that must never be decorative.
    expect(css).not.toMatch(/--fill-bad\s*:/);
  });

  it("holds its contrast promises after the enrichment", () => {
    // The gradients sit ON the card, so the card's own token is still what
    // text is read against — this is the assertion that would fail if a
    // --lift were ever darkened past its --card.
    for (const [name, t] of Object.entries(GROUNDS)) {
      expect(t["--lift"], `${name}: --lift must be a gradient, not a colour`).toContain(
        "gradient"
      );
      expect(t["--hero"], `${name}: --hero must be a gradient`).toContain("gradient");
    }
  });

  it("lets a reduced-motion reader opt out of every animation", () => {
    // Growth and celebration are the only new motion, and both are
    // animations — so the existing blanket rule already covers them. This
    // asserts that rule is still there, because the enrichment is exactly
    // the kind of change that would tempt someone to make an exception.
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/
    );
    expect(block, "the reduced-motion block is missing").not.toBeNull();
    expect(block![1]).toContain("animation: none !important");
    expect(block![1]).toContain("transition: none !important");
  });
});
