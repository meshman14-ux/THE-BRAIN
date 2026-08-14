/* ------------------------------------------------------------------ *
 * Samsung Health import — the official export, parsed honestly
 *
 * Samsung Health has no consumer cloud API. What it has is an export:
 * Settings → Download personal data, which produces a folder of CSVs, one
 * per tracker. This module turns those files into `health_days` rows.
 *
 * The export format has three quirks this code treats as facts rather
 * than surprises:
 *
 *   1. The FIRST line of every file is metadata ("com.samsung.shealth.
 *      tracker.pedometer_day_summary,201,…"), not headers. Headers are
 *      line two.
 *   2. Timestamps are UTC instants with a separate `time_offset` column
 *      ("UTC+0100") saying where the person was. A step taken at 23:30 in
 *      Cardiff belongs to the Cardiff day, so the offset is applied
 *      before the date is taken.
 *   3. A day can appear more than once (one row per source device). Steps
 *      take the LARGEST row rather than the sum — two devices counting
 *      the same walk are one walk, and undercounting a single device
 *      beats double-counting two.
 *
 * What this module deliberately does NOT do:
 *
 *   - Derive resting heart rate from raw heart-rate samples. A minimum
 *     over a day of readings is not a resting rate, it is a minimum. Only
 *     an explicit resting/`heart_rate_min`-free summary column would be
 *     honest, and the export does not reliably carry one — so the field
 *     stays null and the page keeps its dash.
 *   - Invent rMSSD. The export does not contain it; readiness stays
 *     silent until a source that measures it exists (the Health Connect
 *     companion is the recorded next step).
 *   - Write anything. Parsing returns a PLAN; the component shows it and
 *     Jay confirms. Never auto-commit — the same rule the advisor holds.
 * ------------------------------------------------------------------ */

/** One day's worth of importable figures. Absent field = not in the export
 *  = the upsert never mentions it, so a typed value cannot be clobbered. */
export type ImportDay = {
  steps?: number;
  active_minutes?: number;
  sleep_hours?: number;
  weight_kg?: number;
  protein_g?: number;
  calories?: number;
};

export type ImportPlan = {
  /** date → the fields the export actually held for that day. */
  days: Record<string, ImportDay>;
  /** Which file kinds contributed, with row counts — the preview's evidence. */
  found: { kind: RecognisedKind; file: string; rows: number }[];
  /** Files this parser did not recognise, with their header line so a
   *  format drift is debuggable rather than silent. */
  unrecognised: { file: string; headers: string[] }[];
};

export type RecognisedKind = "steps" | "sleep" | "weight" | "nutrition";

/* ------------------------------------------------------------------ *
 * CSV — small, complete, no dependency
 * ------------------------------------------------------------------ */

/** Parse CSV text into rows of fields. Handles quoted fields, escaped
 *  quotes, CRLF, and a UTF-8 BOM. Trailing empty fields are kept — the
 *  export ends most rows with a comma. */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/* ------------------------------------------------------------------ *
 * Time — offsets applied, dates local to where the day was lived
 * ------------------------------------------------------------------ */

/** "UTC+0100" / "UTC-0530" → minutes east of UTC. Anything else → 0. */
export function offsetMinutes(offset: string | undefined): number {
  const m = /^UTC([+-])(\d{2})(\d{2})$/.exec((offset ?? "").trim());
  if (!m) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "+" ? mins : -mins;
}

/** A UTC instant + the person's offset → the LOCAL calendar date. */
export function localDate(utcMs: number, offset: string | undefined): string | null {
  if (!Number.isFinite(utcMs)) return null;
  const d = new Date(utcMs + offsetMinutes(offset) * 60_000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** The export writes instants two ways: epoch milliseconds, or
 *  "2026-08-01 23:41:00.000". Both are UTC; both are accepted. */
export function parseInstant(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (s === "") return null;
  if (/^\d{10,}$/.test(s)) return Number(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

const num = (v: string | undefined): number | null => {
  const s = (v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ *
 * Recognising the files
 * ------------------------------------------------------------------ */

type Parsed = { headers: string[]; data: string[][] };

/** Line one is metadata, line two is headers — unless the file starts
 *  straight at headers (some re-exports do). Sniff rather than assume. */
function splitFile(text: string): Parsed | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const looksLikeHeaders = (r: string[]) =>
    r.some((h) => /[a-z_]{3,}/.test(h)) && !r.some((h) => /^\d+$/.test(h.trim()) && h.trim().length > 4);
  const first = rows[0];
  const startsAtHeaders = looksLikeHeaders(first) && first.length >= 3 && rows.length >= 2 && first.some((h) => h.includes("_"));
  const metaLine = /^com\.samsung\./.test(first[0] ?? "");
  const headerRow = metaLine ? rows[1] : startsAtHeaders ? rows[0] : rows[1];
  const dataStart = metaLine ? 2 : startsAtHeaders ? 1 : 2;
  if (!headerRow) return null;
  return { headers: headerRow.map((h) => h.trim()), data: rows.slice(dataStart) };
}

/** Column lookup that tolerates the export's long prefixes:
 *  `col(h, "start_time")` matches both "start_time" and
 *  "com.samsung.health.sleep.start_time". */
function col(headers: string[], name: string): number {
  const exact = headers.indexOf(name);
  if (exact !== -1) return exact;
  return headers.findIndex((h) => h === name || h.endsWith("." + name));
}

export function sniffKind(fileName: string, headers: string[]): RecognisedKind | null {
  const f = fileName.toLowerCase();
  const has = (n: string) => col(headers, n) !== -1;
  if (f.includes("pedometer_day_summary") || (has("step_count") && has("day_time")))
    return "steps";
  if (f.includes(".sleep") || (has("sleep_duration") || (has("start_time") && has("end_time") && f.includes("sleep"))))
    return f.includes("sleep_stage") ? null : "sleep";
  if (f.includes(".weight") || (has("weight") && has("start_time") && !has("exercise_type")))
    return "weight";
  if (f.includes("nutrition") || f.includes("food_intake") || (has("calorie") && has("start_time") && has("meal_type")))
    return "nutrition";
  return null;
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export function importPlan(files: { name: string; text: string }[]): ImportPlan {
  const days: Record<string, ImportDay> = {};
  const found: ImportPlan["found"] = [];
  const unrecognised: ImportPlan["unrecognised"] = [];
  const day = (d: string): ImportDay => (days[d] ??= {});

  for (const f of files) {
    const parsed = splitFile(f.text);
    if (!parsed) {
      unrecognised.push({ file: f.name, headers: [] });
      continue;
    }
    const kind = sniffKind(f.name, parsed.headers);
    if (kind == null) {
      unrecognised.push({ file: f.name, headers: parsed.headers.slice(0, 12) });
      continue;
    }
    const h = parsed.headers;
    let rows = 0;

    if (kind === "steps") {
      const iTime = col(h, "day_time");
      const iSteps = col(h, "step_count");
      const iActive = col(h, "active_time");
      const iOffset = col(h, "time_offset");
      for (const r of parsed.data) {
        const t = parseInstant(r[iTime]);
        const steps = num(r[iSteps]);
        if (t == null || steps == null) continue;
        const d = localDate(t, iOffset === -1 ? undefined : r[iOffset]);
        if (!d) continue;
        rows++;
        const held = day(d);
        // Largest row wins — one walk counted by two devices is one walk.
        if (held.steps == null || steps > held.steps) {
          held.steps = Math.round(steps);
          const act = iActive === -1 ? null : num(r[iActive]);
          if (act != null) held.active_minutes = Math.round(act / 60_000);
        }
      }
    }

    if (kind === "sleep") {
      const iStart = col(h, "start_time");
      const iEnd = col(h, "end_time");
      const iDur = col(h, "sleep_duration");
      const iOffset = col(h, "time_offset");
      for (const r of parsed.data) {
        const end = parseInstant(r[iEnd]);
        if (end == null) continue;
        const offset = iOffset === -1 ? undefined : r[iOffset];
        // A night belongs to the morning it ends in — the wake date.
        const d = localDate(end, offset);
        if (!d) continue;
        let hours: number | null = null;
        const durMin = iDur === -1 ? null : num(r[iDur]);
        if (durMin != null && durMin > 0) hours = durMin / 60;
        else {
          const start = parseInstant(r[iStart]);
          if (start != null && end > start) hours = (end - start) / 3_600_000;
        }
        if (hours == null || hours <= 0 || hours > 24) continue;
        rows++;
        const held = day(d);
        // Sessions on the same wake date sum — a broken night is still one night.
        held.sleep_hours = Math.round(((held.sleep_hours ?? 0) + hours) * 10) / 10;
      }
    }

    if (kind === "weight") {
      const iW = col(h, "weight");
      const iTime = col(h, "start_time");
      const iOffset = col(h, "time_offset");
      const latest: Record<string, number> = {};
      for (const r of parsed.data) {
        const w = num(r[iW]);
        const t = parseInstant(r[iTime]);
        if (w == null || w <= 0 || t == null) continue;
        const d = localDate(t, iOffset === -1 ? undefined : r[iOffset]);
        if (!d) continue;
        rows++;
        // Latest reading of the day wins.
        if (latest[d] == null || t > latest[d]) {
          latest[d] = t;
          day(d).weight_kg = Math.round(w * 10) / 10;
        }
      }
    }

    if (kind === "nutrition") {
      const iCal = col(h, "calorie");
      const iProt = col(h, "protein");
      const iTime = col(h, "start_time");
      const iOffset = col(h, "time_offset");
      for (const r of parsed.data) {
        const t = parseInstant(r[iTime]);
        if (t == null) continue;
        const d = localDate(t, iOffset === -1 ? undefined : r[iOffset]);
        if (!d) continue;
        const cal = iCal === -1 ? null : num(r[iCal]);
        const prot = iProt === -1 ? null : num(r[iProt]);
        if (cal == null && prot == null) continue;
        rows++;
        const held = day(d);
        // Meals sum into the day.
        if (cal != null) held.calories = Math.round((held.calories ?? 0) + cal);
        if (prot != null)
          held.protein_g = Math.round(((held.protein_g ?? 0) + prot) * 10) / 10;
      }
    }

    found.push({ kind, file: f.name, rows });
  }

  return { days, found, unrecognised };
}

/**
 * The rows the confirm button writes: `on_date` + ONLY the fields the
 * export held, `source: "samsung"`. PostgREST's upsert SETs the provided
 * columns and leaves the rest — which is the no-clobber guarantee: a
 * morning weight Jay typed by hand survives an import that only brought
 * steps.
 */
export function toUpsertRows(
  plan: ImportPlan
): (ImportDay & { on_date: string; source: "samsung" })[] {
  return Object.entries(plan.days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([on_date, fields]) => ({ on_date, source: "samsung", ...fields }));
}

/** The preview's one-line summary per field, so the confirm is informed. */
export function planSummary(plan: ImportPlan): { field: string; days: number }[] {
  const count = (k: keyof ImportDay) =>
    Object.values(plan.days).filter((d) => d[k] != null).length;
  return (
    [
      ["steps", count("steps")],
      ["active minutes", count("active_minutes")],
      ["sleep", count("sleep_hours")],
      ["weight", count("weight_kg")],
      ["calories", count("calories")],
      ["protein", count("protein_g")],
    ] as [string, number][]
  )
    .filter(([, n]) => n > 0)
    .map(([field, days]) => ({ field, days }));
}
