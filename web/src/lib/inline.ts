/**
 * Inline editing — the dash IS the input.
 *
 * The highest-leverage change in the v2 pass, and it is a one-line idea:
 * anything rendering `—` is the system admitting it does not know something,
 * and the moment you are looking at that admission is the moment you are
 * most likely to be able to fix it. Sending him to another route, to a form,
 * to a Save button, spends all of that. Eight null debt balances become
 * eight taps from the screen he is already on.
 *
 * The allowlist below is the discipline that makes it safe to have a generic
 * writer in a Client Component. RLS is what actually protects the data —
 * every query runs as the signed-in user and there is no service-role key —
 * so this is not a security boundary. It is a correctness one: a typo in a
 * column name would otherwise be a silent no-op, and a field nobody meant to
 * be editable would become editable by being passed a different string.
 */

export type InlineKind = "money" | "date" | "text" | "int";

export type InlineField = {
  table: string;
  column: string;
  kind: InlineKind;
  /** What the dash means here, said in his words. */
  label: string;
  /** The prompt shown when the value is missing. Never "N/A". */
  placeholder: string;
  min?: number;
  max?: number;
};

/**
 * Every field the dash-is-the-input mechanism may write.
 *
 * Deliberately narrow. A field earns a place here by being something the
 * system asks about and he can answer in one tap or one number — not by
 * being a column that happens to be nullable.
 */
export const INLINE_FIELDS = {
  "debts.current_balance": {
    table: "debts",
    column: "current_balance",
    kind: "money",
    label: "Balance",
    placeholder: "not confirmed",
    min: 0,
  },
  "debts.plan_amount": {
    table: "debts",
    column: "plan_amount",
    kind: "money",
    label: "Payment",
    placeholder: "no plan",
    min: 0,
  },
  "vehicles.tax_due": {
    table: "vehicles",
    column: "tax_due",
    kind: "date",
    label: "Tax due",
    placeholder: "not recorded",
  },
  "vehicles.mot_due": {
    table: "vehicles",
    column: "mot_due",
    kind: "date",
    label: "MOT due",
    placeholder: "not recorded",
  },
  "vehicles.insurance_due": {
    table: "vehicles",
    column: "insurance_due",
    kind: "date",
    label: "Insurance due",
    placeholder: "not recorded",
  },
  "vehicles.next_service": {
    table: "vehicles",
    column: "next_service",
    kind: "date",
    label: "Next service",
    placeholder: "not recorded",
  },
  "people.cadence_days": {
    table: "people",
    column: "cadence_days",
    kind: "int",
    label: "Cadence",
    placeholder: "no cadence set",
    min: 1,
    max: 3650,
  },
  "people.last_contact": {
    table: "people",
    column: "last_contact",
    kind: "date",
    label: "Last contact",
    placeholder: "never logged",
  },
  "people.birthday": {
    table: "people",
    column: "birthday",
    kind: "date",
    label: "Birthday",
    placeholder: "not recorded",
  },
  "pillars.status_line": {
    table: "pillars",
    column: "status_line",
    kind: "text",
    label: "Status",
    placeholder: "no line yet",
  },
} as const satisfies Record<string, InlineField>;

export type InlineKey = keyof typeof INLINE_FIELDS;

export function inlineField(key: InlineKey): InlineField {
  return INLINE_FIELDS[key];
}

/**
 * Turn what was typed into what gets written, or say why it cannot be.
 *
 * An empty box means "I want this to go back to unknown", so it returns
 * null rather than an error — clearing a figure has to be as easy as
 * entering one, or a mistyped balance is stuck there forever.
 */
export function parseInline(
  key: InlineKey,
  raw: string
): { ok: true; value: string | number | null } | { ok: false; error: string } {
  const f = INLINE_FIELDS[key] as InlineField;
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };

  if (f.kind === "text") return { ok: true, value: s };

  if (f.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: "Needs a real date." };
    // Reject 2026-02-31 and friends: the input type=date will not produce
    // one, but a paste or an autofill can.
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      return { ok: false, error: "That date does not exist." };
    }
    return { ok: true, value: s };
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: "Needs a number." };
  if (f.kind === "int" && !Number.isInteger(n)) {
    return { ok: false, error: "Needs a whole number." };
  }
  if (f.min != null && n < f.min) return { ok: false, error: `Cannot be below ${f.min}.` };
  if (f.max != null && n > f.max) return { ok: false, error: `Cannot be above ${f.max}.` };
  return { ok: true, value: n };
}

/* ------------------------------------------------------------------ *
 * What the system does not know
 * ------------------------------------------------------------------ */

export type Unknown = {
  key: InlineKey;
  /** The row to write to. */
  id: string;
  /** Which thing this is about — "Council Tax", "BMW ME54 JAY". */
  subject: string;
  /** Why it is worth knowing, in one short clause. */
  why: string;
};

/**
 * The gaps, gathered into one list.
 *
 * This is the panel that makes the whole idea pay: rather than hunting
 * dashes across five screens, every figure the system is missing arrives in
 * one place, each one a tap. It is deliberately NOT a nag — it lives on
 * /life as a panel he can ignore, it never enters the watchtower, and it
 * says nothing at all when there is nothing missing.
 */
export function unknowns(input: {
  debts: { id: string; creditor: string; status: string; current_balance: number | null }[];
  vehicles: {
    id: string;
    name: string;
    registration: string | null;
    status: string;
    tax_due: string | null;
    mot_due: string | null;
    insurance_due: string | null;
  }[];
}): Unknown[] {
  const out: Unknown[] = [];

  for (const d of input.debts) {
    if (d.status !== "active") continue;
    if (d.current_balance == null) {
      out.push({
        key: "debts.current_balance",
        id: d.id,
        subject: d.creditor,
        why: "the total is incomplete without it",
      });
    }
  }

  for (const v of input.vehicles) {
    if (v.status !== "active") continue;
    const name = v.registration ? `${v.name} · ${v.registration}` : v.name;
    const dates = [
      ["vehicles.tax_due", v.tax_due, "tax"],
      ["vehicles.mot_due", v.mot_due, "MOT"],
      ["vehicles.insurance_due", v.insurance_due, "insurance"],
    ] as const;
    for (const [key, value, what] of dates) {
      if (value == null) {
        out.push({
          key,
          id: v.id,
          subject: name,
          why: `${what} cannot warn you about a date it was never given`,
        });
      }
    }
  }

  return out;
}
