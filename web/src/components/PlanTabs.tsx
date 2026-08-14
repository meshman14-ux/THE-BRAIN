import Link from "next/link";

/* ------------------------------------------------------------------ *
 * The planning surface — one front door, four views
 *
 * There were four screens answering "what am I doing?", and the best of
 * them was unreachable: /day shipped with the day-planner work and never
 * got a nav entry, so the hour grid, the capacity meter and the
 * calibration multiplier could only be found through a chip on /week.
 *
 * A dashboard with five front doors has no front door. These stay as
 * separate ROUTES — a seven-column week grid and a three-lane board are
 * genuinely different weights, and one route rendering all of them would
 * fetch everything to show a third of it — but they stop being siblings
 * in the nav and become views of one surface, which is exactly how
 * /dashboard and /life/money already work.
 *
 * The read lives at /dashboard. The planning lives here. Two surfaces,
 * which is what the v2 diagnosis asked for.
 *
 * CALENDAR JOINED ON 2026-08-14, and it is the correction that finishes
 * the job. It was the fourth planning surface and the only one still
 * outside this group: its own nav item, its own address, answering the
 * same question — where does this land — from a different angle. Three
 * chips and a fourth thing beside them is not one front door.
 *
 * It also frees a nav slot, which matters: `brain` mode carried thirteen
 * items inside a 1200px header with ~27px spare, and the honest answer to
 * a fourteenth was always a shorter label or fewer items. This is fewer
 * items, arrived at by filing rather than by cutting.
 * ------------------------------------------------------------------ */

export const PLAN_VIEWS = [
  { key: "day", href: "/day", label: "Day", question: "when, this hour" },
  { key: "week", href: "/week", label: "Week", question: "which day" },
  { key: "board", href: "/planner", label: "Board", question: "what is open" },
  { key: "calendar", href: "/calendar", label: "Calendar", question: "what is already fixed" },
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
        {/* Print is deliberately NOT a view. It strips the app chrome so a
            browser can lay it out for paper, so it cannot be a tab of a
            page that has chrome — and it is an export rather than a lens
            on the same work. Set apart, and it says where it goes. */}
        <Link
          href="/week/print"
          className="chip no-underline ml-auto"
          style={{ color: "var(--faint)" }}
        >
          Print ↗
        </Link>
      </div>
      {current && (
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          {current.label} answers <b>{current.question}</b>. The others answer
          the other questions — same work, different lens.
        </p>
      )}
    </div>
  );
}
