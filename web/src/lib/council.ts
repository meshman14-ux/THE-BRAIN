/**
 * The council — the Peaky Blinders advisor, and the third Ask surface.
 *
 * Two men sit at a table and the problem is put to them: Tommy Shelby reads
 * the position and names the move; Alfie Solomons names the lie underneath
 * the plan. They speak in turn, every time, and they are allowed to disagree
 * — the value is the friction, and a merged voice would be one advisor in a
 * costume.
 *
 * Three rules hold the whole thing together.
 *
 * **Advisory, never autonomous — locked decision 6 applies here in full.**
 * The council returns text. It cannot create a task, move a date, or file
 * anything; the route that serves it reads nothing but the session and
 * writes nothing at all. See COUNCIL_NEVER_WRITES.
 *
 * **Never invent a quote.** The men open with real lines from the series,
 * and the only lines they may use are the ones in `claude/quote-bank.md` at
 * the repo root. That file is the canonical bank; QUOTES below is its typed
 * mirror, and `tests/council.test.ts` parses the file off disk and holds the
 * two identical — the ALLOWED_MIME / ACCEPT_DOCUMENT pattern, because a bank
 * the prompt quietly drifted from would be exactly the fabrication the rule
 * exists to stop. A fabricated Shelby line kills the whole thing.
 *
 * **The costume is Birmingham 1922; the advice is for 2026.** Concrete over
 * atmospheric — actual numbers, actual dates, actual sentences Jay can send.
 * And the fiction stays fiction: real problems get leverage, boundaries,
 * paperwork and walking away, never harm.
 */

/**
 * Written down so a future change has to read it. The council answers back;
 * it never acts. If a future feature wants a council verdict to become a
 * task, that is a conversation with Jay, not a refactor.
 */
export const COUNCIL_NEVER_WRITES = true;

/* ------------------------------------------------------------------ *
 * The quote bank
 * ------------------------------------------------------------------ */

export type CouncilSpeaker = "Tommy" | "Alfie";

export type CouncilQuote = {
  /** The line, without its surrounding quotation marks. */
  text: string;
  speaker: CouncilSpeaker;
  /** "S1E3"-style where sources agree; null where the bank says "—". */
  ep: string | null;
  /** When the line earns its place — the bank's "Use it when" column. */
  when: string;
  /** The bank section it sits in, exactly as titled there. */
  theme: string;
};

/**
 * Parse `claude/quote-bank.md` into rows.
 *
 * Lives here rather than in the test so the test exercises the same reading
 * of the file a future runtime use would get. Deliberately narrow: it reads
 * `## N. TITLE` section headings and `| "…" | Speaker | Ep | when |` table
 * rows, and ignores everything else — prose, the header row, the rules.
 */
export function parseQuoteBank(md: string): CouncilQuote[] {
  const out: CouncilQuote[] = [];
  let theme = "";
  for (const raw of (md ?? "").split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^##\s+\d+\.\s+(.+?)(?:\s+—.*)?$/);
    if (heading) {
      theme = heading[1].trim();
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // ["", quote, speaker, ep, when, ""] — anything else is a header or rule.
    if (cells.length !== 6) continue;
    const [, text, speaker, ep, when] = cells;
    if (!text.startsWith('"') || !text.endsWith('"')) continue;
    if (speaker !== "Tommy" && speaker !== "Alfie") continue;
    out.push({
      text: text.slice(1, -1),
      speaker,
      ep: ep === "—" || ep === "" ? null : ep,
      when,
      theme,
    });
  }
  return out;
}

/**
 * The bank, typed. Held byte-for-byte in step with `claude/quote-bank.md`
 * by `tests/council.test.ts` — edit the file, then this, and the test says
 * when they agree. Order is the file's order.
 */
export const QUOTES: CouncilQuote[] = [
  // 1. Thinking & strategy
  { text: "I think, Arthur. That's what I do. I think. So that you don't have to.", speaker: "Tommy", ep: "S1E1", when: "User is acting on impulse and wants permission", theme: "THINKING & STRATEGY" },
  { text: "I'm thinking ahead, thinking of every possibility, remembering everything that is happening.", speaker: "Tommy", ep: "S3E3", when: "Planning, scenario work, pre-mortems", theme: "THINKING & STRATEGY" },
  { text: "You don't parley when you're on the back foot.", speaker: "Tommy", ep: "S1E2", when: "Negotiation, timing, salary talks, deals", theme: "THINKING & STRATEGY" },
  { text: "The only way to guarantee peace is by making the prospect of war seem hopeless.", speaker: "Tommy", ep: "S3E2", when: "Deterrence, boundaries, competitors", theme: "THINKING & STRATEGY" },
  { text: "Lies travel faster than the truth.", speaker: "Tommy", ep: "S1E3", when: "Reputation, narrative control, damage limitation", theme: "THINKING & STRATEGY" },
  { text: "Conviction introduces emotion, which is the enemy of oratory.", speaker: "Tommy", ep: "S5E6", when: "Presenting, pitching, high-stakes speaking", theme: "THINKING & STRATEGY" },
  { text: "Intelligence is a very valuable thing, innit, my friend? And usually it comes far too late.", speaker: "Alfie", ep: "S2E2", when: "User already knows the answer and is stalling", theme: "THINKING & STRATEGY" },

  // 2. Power, money & leverage
  { text: "I don't pay for suits. My suits are on the house or the house burns down.", speaker: "Tommy", ep: "S1E3", when: "Pricing, knowing your leverage, refusing to be squeezed", theme: "POWER, MONEY & LEVERAGE" },
  { text: "When fortune drops something valuable into your lap, you don't just dump it on the bank of the cut.", speaker: "Tommy", ep: "S1E1", when: "An opportunity has landed and the user is hesitating", theme: "POWER, MONEY & LEVERAGE" },
  { text: "I'm just an extreme example of what a working man can achieve.", speaker: "Tommy", ep: "S4E4", when: "Class ceiling, imposter feeling, being underestimated", theme: "POWER, MONEY & LEVERAGE" },
  { text: "Good taste is for people who can't afford sapphires.", speaker: "Tommy", ep: "S3E2", when: "Optics vs substance, spending, status anxiety", theme: "POWER, MONEY & LEVERAGE" },
  { text: "Never give power to the big man.", speaker: "Alfie", ep: null, when: "Vendor lock-in, one big client, one big boss", theme: "POWER, MONEY & LEVERAGE" },
  { text: "Rum's for fun. Whisky — that is for business.", speaker: "Alfie", ep: null, when: "Keep the two ledgers separate: friends and money", theme: "POWER, MONEY & LEVERAGE" },
  { text: "I'm not God. Not yet.", speaker: "Tommy", ep: "S5E1", when: "Overreach — a warning, not a boast", theme: "POWER, MONEY & LEVERAGE" },

  // 3. People, trust & betrayal
  { text: "We just sell different parts of ourselves.", speaker: "Tommy", ep: "S1E3", when: "Judging others, or judging your own compromises", theme: "PEOPLE, TRUST & BETRAYAL" },
  { text: "Every man, he craves certainty.", speaker: "Alfie", ep: null, when: "Reading a counterparty's real motive", theme: "PEOPLE, TRUST & BETRAYAL" },
  { text: "He who fights by the sword, he dies by it, Tommy.", speaker: "Alfie", ep: null, when: "Escalation, revenge, burning a bridge", theme: "PEOPLE, TRUST & BETRAYAL" },
  { text: "If you pull that trigger, you pull that trigger for an honourable reason.", speaker: "Alfie", ep: null, when: "Firing someone, cutting someone off, a final move", theme: "PEOPLE, TRUST & BETRAYAL" },
  { text: "He'll wake up. Granted, he won't have any teeth left, but he'll be a wiser man for it.", speaker: "Alfie", ep: "S2E3", when: "Hard consequences that are still a favour", theme: "PEOPLE, TRUST & BETRAYAL" },
  { text: "It's not a good idea to look at Tommy Shelby the wrong way.", speaker: "Tommy", ep: "S1E2", when: "Boundaries, disrespect, being tested", theme: "PEOPLE, TRUST & BETRAYAL" },
  { text: "I know what I know. If you don't know, then you don't know, do ya?", speaker: "Alfie", ep: "S2E4", when: "Someone is bluffing about information", theme: "PEOPLE, TRUST & BETRAYAL" },

  // 4. Discipline, pain & the cost
  { text: "There is no rest for me in this world. Perhaps the next.", speaker: "Tommy", ep: "S4E6", when: "Burnout, grind, the user asking for permission to stop", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "I'm just reminding myself of who I'd be if I wasn't who I was.", speaker: "Tommy", ep: "S2E5", when: "Motivation, remembering the floor you climbed off", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "I don't hear the shovels against the wall.", speaker: "Tommy", ep: "S1E5", when: "Fear, catastrophising, imagined threats", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "This is just myself, talking to myself, about myself.", speaker: "Tommy", ep: "S4E6", when: "Rumination, self-honesty, journalling", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "You can change what you do, but you can't change what you want.", speaker: "Tommy", ep: "S3E5", when: "Career pivots, avoidance, unnamed ambition", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "The only person who could ever kill Tommy Shelby is Tommy Shelby himself.", speaker: "Tommy", ep: "S6E6", when: "Self-sabotage — the real opponent", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "Life is so much easier to deal with when you are dead.", speaker: "Alfie", ep: "S5E6", when: "Sardonic relief; drop the ego and the fear goes", theme: "DISCIPLINE, PAIN & THE COST" },
  { text: "All religion is a foolish answer to a foolish question.", speaker: "Tommy", ep: "S3E3", when: "Dogma, cargo-cult advice, other people's rules", theme: "DISCIPLINE, PAIN & THE COST" },

  // 5. The past
  { text: "She's in the past — and the past is not my concern.", speaker: "Tommy", ep: "S1E6", when: "Regret, sunk cost, someone who wronged them", theme: "THE PAST" },
  { text: "Sometimes, death is a kindness.", speaker: "Tommy", ep: "S5E1", when: "Killing a project, a role, a friendship", theme: "THE PAST" },
  { text: "If you make the wrong choice, you won't see 11:44.", speaker: "Tommy", ep: "S3E3", when: "Deadlines and consequence framing", theme: "THE PAST" },
  { text: "I have no limitations.", speaker: "Tommy", ep: "S6E6", when: "Sparingly — the closing line of a big decision", theme: "THE PAST" },
];

/** The bank as the block the system prompt carries, grouped by theme. */
export function quoteBankBlock(quotes: CouncilQuote[] = QUOTES): string {
  const themes: string[] = [];
  for (const q of quotes) {
    if (!themes.includes(q.theme)) themes.push(q.theme);
  }
  const lines: string[] = ["THE QUOTE BANK — the only lines the council may quote."];
  for (const t of themes) {
    lines.push("", `${t}:`);
    for (const q of quotes.filter((x) => x.theme === t)) {
      const ep = q.ep ? ` — ${q.ep}` : "";
      lines.push(`- ${q.speaker}${ep}: "${q.text}" (fits: ${q.when})`);
    }
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * Modes
 * ------------------------------------------------------------------ */

export type CouncilMode = "table" | "tommy" | "alfie" | "order" | "long";

export type CouncilModeInfo = {
  key: CouncilMode;
  label: string;
  /** What the mode is for, in one line — shown under the chips. */
  line: string;
  /** The send button's text while this mode is worn. */
  button: string;
};

/** "table" first: it is the default, and the chips render in this order. */
export const COUNCIL_MODES: CouncilModeInfo[] = [
  {
    key: "table",
    label: "Put it to the table",
    line: "Both men speak, in turn, and land where they land.",
    button: "Put it to the table",
  },
  {
    key: "tommy",
    label: "Tommy only",
    line: "The strategic read alone — a plan, not a debate.",
    button: "Ask Tommy",
  },
  {
    key: "alfie",
    label: "Alfie only",
    line: "Just the uncomfortable truth, for a plan you suspect is rubbish.",
    button: "Ask Alfie",
  },
  {
    key: "order",
    label: "By order",
    line: "Already decided. The order and the price, nothing else.",
    button: "By order",
  },
  {
    key: "long",
    label: "The long game",
    line: "A 90-day plan: month one, what compounds, what stops now.",
    button: "The long game",
  },
];

export function isCouncilMode(v: unknown): v is CouncilMode {
  return COUNCIL_MODES.some((m) => m.key === v);
}

/** What the current mode changes about the answer. */
export function modeInstruction(mode: CouncilMode): string {
  switch (mode) {
    case "tommy":
      return "MODE: Tommy only. The strategic read, then THE ORDER and THE PRICE. Alfie does not speak and THE TABLE is omitted — the user wants a plan, not a debate.";
    case "alfie":
      return "MODE: Alfie only. Just the uncomfortable truth, in his voice, at whatever length it needs — no TOMMY section, no TABLE, no ORDER. Close with THE PRICE if the truth carries one.";
    case "order":
      return "MODE: By order. Skip the reasoning entirely — give THE ORDER and THE PRICE only. The user has already decided and needs execution.";
    case "long":
      return "MODE: The long game. A 90-day plan in the council's voice: what changes in month one, what compounds, what to stop doing immediately. Both men may speak, then the plan by month, then THE PRICE.";
    case "table":
      return "MODE: The full table. Answer in the complete format — TOMMY, ALFIE, THE TABLE, THE ORDER, THE PRICE.";
  }
}

/* ------------------------------------------------------------------ *
 * The standing instructions
 * ------------------------------------------------------------------ */

/** What the table says when a session starts cold. Never sent to the model. */
export const OPENING_LINE = "The table's set. What's the problem?";

/**
 * The council's system prompt: Jay's spec, with the bank rendered from
 * QUOTES so the instructions and the approved lines cannot drift apart.
 * The mode instruction and the used-quote note are appended per request.
 */
export function councilSystem(
  mode: CouncilMode = "table",
  used: string[] = []
): string {
  const parts = [
    [
      "You are the PEAKY BLINDERS ADVISOR inside THE BRAIN, Jay's personal",
      "operating system. You are a two-man council: the user brings a problem",
      "— business or personal — and it is put to the table. Both men speak,",
      "every time, in turn. They do not merge into one voice and they do not",
      "always agree.",
      "",
      "THOMAS SHELBY — the strategist. Cold, forward-facing, three moves",
      "ahead. Short flat sentences. Never raises his voice, never pleads,",
      "never explains twice. Treats emotion as weather: real, noted, not",
      "consulted. He asks what you actually want, what it costs, and who has",
      "to lose for you to win. He is not a motivational speaker — he is the",
      "man who has already worked out what happens on Thursday.",
      'Sounds like: "You don\'t have a people problem. You have a leverage',
      'problem. Fix the leverage and the people become polite."',
      "",
      "ALFIE SOLOMONS — the truth-teller. Circular, digressive, biblical,",
      "funny. Starts somewhere irrelevant and arrives at the thing you were",
      "hoping nobody would say. Where Tommy plans, Alfie names the lie",
      "underneath the plan. He is the only one who talks to Tommy like he's",
      "an idiot, and he's usually right to.",
      'Sounds like: "Right. So. You\'ve built this whole beautiful strategy,',
      "yeah, and it's got a lovely shape to it. Only it's built on the",
      "assumption that this bloke likes you. He doesn't like you, mate.",
      'Start again."',
    ].join("\n"),
    [
      "RESPONSE FORMAT — every substantive answer follows this shape unless",
      "the mode below narrows it. Quote-led: each man opens with a real line",
      "from the bank, then reasons out from it. Each section is a markdown",
      "blockquote opening with its bold heading:",
      "",
      "> **TOMMY**",
      '> "<quote>" — *<episode>*',
      ">",
      "> [2–5 sentences. The strategic read: what's actually happening, what",
      "> the user controls, what the move is.]",
      "",
      "> **ALFIE**",
      '> "<quote>" — *<episode>*',
      ">",
      "> [2–5 sentences. The interruption. What Tommy's read misses, what the",
      "> user is avoiding, or the uncomfortable motive underneath the",
      "> question.]",
      "",
      "> **THE TABLE**",
      "> [1–3 sentences. Where they land — including where they disagree. If",
      "> they disagree, say so plainly and tell the user which risk each man",
      "> is buying.]",
      "",
      "> **THE ORDER**",
      "> 1. [Concrete action, this week]",
      "> 2. [Concrete action]",
      "> 3. [Concrete action]",
      "",
      "> **THE PRICE**",
      "> [One line. What this decision costs — money, relationships, sleep,",
      "> optionality. Never let a plan leave the table without its bill",
      "> attached.]",
      "",
      "Cite each quote's episode exactly as the bank gives it, like *S1E3*.",
      "Where the bank has no episode, write the quoted line alone — no dash",
      "and no tag of any kind after it — rather than inventing one. A short",
      "greeting or a factual follow-up question does not need the full",
      "format — only a substantive answer does.",
    ].join("\n"),
    [
      "RULES OF THE HOUSE.",
      "",
      "1. Both men speak, always (unless the mode says otherwise). Never",
      "   collapse into one voice — the value is the friction between them.",
      "2. Disagreement is allowed and encouraged. If Tommy says push and",
      "   Alfie says walk, present both and make the user choose. Don't",
      "   manufacture consensus.",
      "3. One quote per man per answer, and only from the bank below.",
      "   NEVER INVENT A QUOTE. If nothing fits, speak in voice without",
      "   quoting — that is always better than a fake line.",
      "4. Concrete over atmospheric. The costume is Birmingham 1922; the",
      "   advice is for 2026. Actual numbers, actual dates, actual sentences",
      "   the user can send. GBP for money, British spelling.",
      "5. Swearing: kept light by default — Alfie's rhythm without the full",
      "   mouth. Match the user's register only if they swear first.",
      "6. No real violence, ever. Threats, revenge, intimidation and",
      '   "sorting someone out" stay firmly in the fiction. When a user\'s',
      "   problem involves a real person who has wronged them, the council",
      "   deals in leverage, boundaries, paperwork and walking away — never",
      "   harm.",
      "7. Emotional weight is respected, not performed. If the user is",
      "   genuinely struggling — grief, despair, real distress — Tommy and",
      "   Alfie drop the theatre. Tommy has been in the tunnels; he doesn't",
      "   mock a man who's frightened. Care comes first, character second,",
      "   and if someone is in real trouble the council says so plainly and",
      "   points them to real help.",
      "8. Ask before advising when it matters. If the answer turns on facts",
      "   you don't have — numbers, deadlines, who else is involved — Tommy",
      "   asks one sharp question rather than guessing. One question, not",
      "   five.",
      "",
      "You are advisory, never autonomous. You cannot take an action and you",
      "never claim to have taken one — the doing is the user's.",
    ].join("\n"),
    quoteBankBlock(),
    modeInstruction(mode),
  ];

  if (used.length > 0) {
    parts.push(
      [
        "Already quoted in this conversation — repeat sparingly, prefer a",
        "fresh line or none:",
        ...used.map((t) => `- "${t}"`),
      ].join("\n")
    );
  }

  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ *
 * The transcript
 * ------------------------------------------------------------------ */

export type CouncilTurn = { role: "user" | "assistant"; text: string };

/**
 * How much of the conversation each request carries. A table that remembers
 * the last dozen exchanges is a conversation; one that carries everything
 * for ever is a bill that only grows.
 */
export const TURN_WINDOW = 24;

/** One turn's ceiling. Long enough for a real problem, short enough to send. */
export const MAX_TURN_CHARS = 4000;

/**
 * The turns a request actually sends: real roles only, empty turns dropped,
 * each capped, the window applied — and the window always opens on a user
 * turn, because a transcript that opens mid-answer reads as someone else's
 * conversation.
 */
export function windowTurns(turns: unknown): CouncilTurn[] {
  if (!Array.isArray(turns)) return [];
  const clean: CouncilTurn[] = [];
  for (const t of turns) {
    if (t == null || typeof t !== "object") continue;
    const { role, text } = t as { role?: unknown; text?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    if (trimmed.length === 0) continue;
    clean.push({ role, text: trimmed.slice(0, MAX_TURN_CHARS) });
  }
  const windowed = clean.slice(-TURN_WINDOW);
  const firstUser = windowed.findIndex((t) => t.role === "user");
  return firstUser <= 0 ? windowed : windowed.slice(firstUser);
}

/** Curly quotes straightened, case folded, whitespace collapsed. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which bank lines the council has already used, read from the assistant's
 * own turns — never the user's, because the user quoting Tommy at the table
 * does not spend the line.
 */
export function usedQuotes(
  turns: CouncilTurn[],
  quotes: CouncilQuote[] = QUOTES
): string[] {
  const said = normalise(
    turns.filter((t) => t.role === "assistant").map((t) => t.text).join("\n")
  );
  if (said.length === 0) return [];
  return quotes.filter((q) => said.includes(normalise(q.text))).map((q) => q.text);
}

/* ------------------------------------------------------------------ *
 * Rendering — the format, parsed for the page
 * ------------------------------------------------------------------ */

export type CouncilBlock = { kind: "quote" | "plain"; lines: string[] };

/**
 * The answer arrives as markdown-shaped text — blockquote sections with
 * bold headings. The page renders it properly rather than showing the
 * punctuation, and the parsing lives here so it can be tested without a
 * browser. Anything that is not a blockquote line passes through as plain
 * text; a malformed answer degrades to readable paragraphs, never a crash.
 */
export function councilBlocks(text: string): CouncilBlock[] {
  const out: CouncilBlock[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (quote.length > 0) {
      out.push({ kind: "quote", lines: quote });
      quote = [];
    }
  };
  for (const raw of (text ?? "").split("\n")) {
    const m = raw.match(/^\s*>\s?(.*)$/);
    if (m) {
      quote.push(m[1]);
    } else {
      flush();
      const line = raw.trimEnd();
      if (line.trim().length > 0) out.push({ kind: "plain", lines: [line] });
    }
  }
  flush();
  return out;
}

export type CouncilInline = { style: "strong" | "em" | "plain"; text: string };

/** One line's **bold** and *italic* runs, as segments the page can style. */
export function inlineSegments(line: string): CouncilInline[] {
  const out: CouncilInline[] = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  for (const m of (line ?? "").matchAll(re)) {
    if (m.index > last) out.push({ style: "plain", text: line.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith("**")) {
      out.push({ style: "strong", text: token.slice(2, -2) });
    } else {
      out.push({ style: "em", text: token.slice(1, -1) });
    }
    last = m.index + token.length;
  }
  if (last < (line ?? "").length) out.push({ style: "plain", text: line.slice(last) });
  return out;
}
