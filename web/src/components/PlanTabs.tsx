import Link from "next/link";

/* ------------------------------------------------------------------ *
 * The planning surface — one front door, three views
 *
 * There were four screens answering "what am I doing?", and the best of
 * them was unreachable: /day shipped with the day-planner work and never
 * got a nav entry, so the hour grid, the capacity meter and the
 * calibration multiplier could only be found through a chip on /week.
 *
 * A dashboard with five front doors has no front door. These three stay
 * as separate ROUTES — a seven-column week grid and a three-lane board
 * are genuinely different weights, and one route rendering all of them
 * would fetch everything to show a third of it — but they stop being
 * siblings in the nav and become views of one surface, which is exactly
 * how /dashboard and /life/money already work.
 *
 * The read lives at /dashboard. The planning lives here. Two surfaces,
 * which is what the v2 diagnosis asked for.
 * ------------------------------------------------------------------ */

export const PLAN_VIEWS = [
  { key: "day", href: "/day", label: "Day", question: "when, this hour" },
  { key: "week", href: "/week", label: "Week", question: "which day" },
  { key: "board", href: "/planner", label: "Board", question: "what is open" },
] as const;

export type PlanView = (typeof PLAN_VIEWS)[number]["key"];

export default function PlanTabs({ active }: { active: PlanView }) {
  const current = PLAN_VIEWS.find((v) => v.key === active);
  return (
    <div className="grid gap-1.5 mb-4">
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="label mr-1">Plan</span>
        {PLAN_VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            className="chip no-underline"
            data-active={v.key === active}
          >
            {v.label}
          </Link>
        ))}
      </div>
      {current && (
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          {current.label} answers <b>{current.question}</b>. The other two
          answer the other questions — same work, different lens.
        </p>
      )}
    </div>
  );
}
