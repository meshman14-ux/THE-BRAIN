import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Reflect from "@/components/Reflect";
import {
  halfForHour,
  prompt,
  runLength,
  type ReflectionKind,
} from "@/lib/reflect";

export const dynamic = "force-dynamic";

/**
 * The daily reflection.
 *
 * Which half it opens on comes from the clock, but `?half=` always wins — the
 * button in the shell knows what it is asking for, and a page that argues with
 * the link that opened it is a page you stop trusting.
 */
export default async function ReflectPage({
  searchParams,
}: {
  searchParams: Promise<{ half?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // UK local, not UTC: at 00:30 BST the UTC date is still yesterday, and a
  // reflection filed against the wrong day is worse than none.
  const now = new Date();
  const uk = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (t: string) => uk.find((p) => p.type === t)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const hour = Number(part("hour"));

  const date = sp.date ?? today;
  const kind: ReflectionKind =
    sp.half === "morning" || sp.half === "evening" ? sp.half : halfForHour(hour);

  const { data: rows } = await supabase
    .from("reflections")
    .select("on_date, kind, transcript, one_thing, it_happened, energy")
    .order("on_date", { ascending: false })
    .limit(60);

  const all = rows ?? [];
  const existing =
    all.find((r) => r.on_date === date && r.kind === kind) ?? null;

  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yIso = yesterday.toISOString().slice(0, 10);

  const state = {
    morningDone: all.some((r) => r.on_date === today && r.kind === "morning"),
    eveningDone: all.some((r) => r.on_date === today && r.kind === "evening"),
    unclosedDate: all.some((r) => r.on_date === yIso && r.kind === "evening")
      ? null
      : all.some((r) => r.on_date === yIso)
        ? yIso
        : null,
  };

  const p = prompt(hour, state);
  const run = runLength([...new Set(all.map((r) => r.on_date))], today);

  return (
    <div className="max-w-[620px] mx-auto">
      <header className="mb-5">
        <p className="label">
          {kind === "morning" ? "Morning plan" : "Evening close"}
          {date !== today && ` · ${date}`}
        </p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">
          {kind === "morning" ? "What is today for?" : "How did today go?"}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Two taps is the whole thing. Say more only if you want to — and if you
          do, the Advisor reads it back tonight rather than just filing it.
        </p>

        <div className="flex gap-2 mt-3 flex-wrap">
          <Link
            href={`/reflect?half=${kind === "morning" ? "evening" : "morning"}`}
            className="chip tap"
          >
            {kind === "morning" ? "Close the day instead" : "Plan the day instead"}
          </Link>
          {p.key === "unclosed" && state.unclosedDate && (
            <Link
              href={`/reflect?half=evening&date=${state.unclosedDate}`}
              className="chip tap border-[var(--warn)] text-[var(--warn)]"
            >
              Close {state.unclosedDate}
            </Link>
          )}
        </div>
      </header>

      <Reflect kind={kind} date={date} existing={existing} />

      {run > 0 && (
        <p className="text-sm text-[var(--muted)] mt-5">
          {run} day{run === 1 ? "" : "s"} in a row. Today staying open does not
          break it.
        </p>
      )}
    </div>
  );
}
