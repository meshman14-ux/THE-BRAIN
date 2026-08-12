import Link from "next/link";
import { toIso, formatDayLong } from "@/lib/logic";
import { estimateMinutes, setupProgress, setupSteps } from "@/lib/setup";
import { loadSetupFacts } from "@/lib/setupserver";
import SetupList from "@/components/SetupList";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Setup — the list that makes the rest of it work
 *
 * THE BRAIN has always known what it was missing; it just never said so
 * anywhere anybody would look. Every module reports "unmeasured" rather
 * than inventing a zero — which is why the numbers can be trusted, and
 * also why a system with empty tables looks broken instead of hungry.
 * This is one screen that turns all of those admissions into a list you
 * can work down in a single sitting.
 *
 * It is somewhere you GO. The dashboard carries a single line while
 * anything is missing and nothing once it is filled.
 * ------------------------------------------------------------------ */

export default async function SetupPage() {
  const today = toIso(new Date());
  const facts = await loadSetupFacts();

  const steps = setupSteps(facts);
  const progress = setupProgress(steps);
  const minutes = estimateMinutes(steps);

  // Current values, so a figure saved in place re-renders as itself
  // rather than snapping back to a dash.
  const values: Record<string, string | number | null> = {};
  for (const d of facts.debts) values[`debts.current_balance:${d.id}`] = d.current_balance;
  for (const v of facts.vehicles) {
    values[`vehicles.tax_due:${v.id}`] = v.tax_due;
    values[`vehicles.mot_due:${v.id}`] = v.mot_due;
    values[`vehicles.insurance_due:${v.id}`] = v.insurance_due;
    values[`vehicles.next_service:${v.id}`] = v.next_service;
  }

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <div className="max-w-[860px] mx-auto grid gap-7">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">Setup</p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">{formatDayLong(today)}</p>
          <Link
            href="/dashboard"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            ← THE BRAIN
          </Link>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          {progress.complete ? "Everything is wired." : "What the system still needs"}
        </h1>

        {/* The framing matters more than the list. Nothing here is broken:
            every one of these is the system refusing to invent a number it
            was never given, and saying so once turns a wall of dashes from
            a fault into a to-do list. */}
        <p className="text-[0.86rem] text-[var(--muted)] leading-relaxed mt-2 max-w-[62ch]">
          {progress.complete ? (
            <>
              Every figure is confirmed and every feed is connected. Nothing on this page
              needs you — it stays here for the day something changes.
            </>
          ) : (
            <>
              Nothing here is broken. Every one of these is the system declining to invent
              a number nobody gave it, which is exactly why the numbers it does show can be
              trusted.{" "}
              {progress.figures > 0 && (
                <>{progress.figures} of them are typed straight into this page — no forms, no
                saving, tap the dash and look away. </>
              )}
              About {minutes} minute{minutes === 1 ? "" : "s"} in total, and{" "}
              {progress.total - progress.done} parts of the system are waiting on it.
            </>
          )}
        </p>

        <div className="mt-3.5 flex items-center gap-3">
          <div
            className="h-[6px] flex-1 rounded-full overflow-hidden"
            style={{ background: "var(--border)" }}
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: progress.complete ? "var(--good)" : "var(--accent)",
                transition: "width 200ms",
              }}
            />
          </div>
          <span className="mono text-[0.7rem] text-[var(--faint)] shrink-0">
            {progress.done}/{progress.total}
          </span>
        </div>
      </header>

      <SetupList steps={steps} values={values} />

      <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed max-w-[62ch]">
        Finished items stay on the list, greyed and folded away. A list that quietly
        shortens as you work down it gives no sense of having got anywhere, and getting
        somewhere is the whole point of this screen.
      </p>
    </div>
  );
}
