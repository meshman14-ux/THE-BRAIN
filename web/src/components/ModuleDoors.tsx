import Link from "next/link";
import {
  parentsFor,
  pageViews,
  subHref,
  type Layer,
  type ParentReport,
} from "@/lib/parents";

/**
 * The module doors — one tile per area of a system, each carrying the
 * question that area answers and the ways into it.
 *
 * WHY A LANDING PAGE NEEDS THIS. /life and /empire already report how things
 * stand; what they did not do is say where to go next. A dashboard that
 * summarises without offering a door makes you go back to the nav to act on
 * what it just told you, and that trip is where an intention gets lost.
 *
 * The tiles are built from PARENTS, not written here, so a module cannot
 * exist in the registry and be missing from its own system's front page —
 * the drift that produced ten nav items pointing at nothing.
 *
 * The QUESTION is the label under the name, not a description of the module.
 * "What you owe and when it is gone" tells you whether to click; "the money
 * module" does not.
 */
export default function ModuleDoors({
  layer,
  reports = [],
}: {
  layer: Layer;
  /** Optional live state, so a tile can say something true rather than generic. */
  reports?: ParentReport[];
}) {
  const parents = parentsFor(layer);
  const reportFor = (id: string) => reports.find((r) => r.id === id) ?? null;

  return (
    <section>
      <p className="label mb-2.5">
        {layer === "life" ? "The life modules" : "The empire modules"}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {parents.map((p) => {
          const r = reportFor(p.id);
          // Only `page` views are offered as doors. A filter is a lens on the
          // parent's own screen and reaching it from here would land you on
          // the same page you were about to open anyway.
          const doors = pageViews(p).filter((v) => subHref(p, v.id) !== p.href);

          return (
            <div key={p.id} className="card p-4 flex flex-col">
              <Link
                href={p.href}
                className="no-underline text-[var(--text)] flex items-baseline gap-2"
              >
                <span aria-hidden className="text-[0.95rem] shrink-0">
                  {p.icon}
                </span>
                <span className="min-w-0 flex-1 font-semibold text-[0.98rem]">{p.name}</span>
                <span className="text-[0.7rem] shrink-0" style={{ color: "var(--accent)" }}>
                  OPEN →
                </span>
              </Link>

              <p className="text-xs text-[var(--faint)] mt-1.5 leading-relaxed">{p.question}</p>

              {/* The live line when there is one. An area with nothing to say
                  says nothing here rather than padding with "all good" — the
                  board above already speaks for every parent, including the
                  healthy ones, and repeating it would teach the eye to skip
                  this whole region. */}
              {r?.line && (
                <p
                  className="text-[0.82rem] mt-2 leading-snug"
                  style={{
                    color:
                      r.state === "warn"
                        ? "var(--bad)"
                        : r.state === "note"
                          ? "var(--warn)"
                          : "var(--text)",
                  }}
                >
                  {r.line}
                </p>
              )}

              {doors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {doors.map((v) => (
                    <Link key={v.id} href={subHref(p, v.id)} className="chip tap no-underline">
                      {v.label}
                    </Link>
                  ))}
                </div>
              )}

              {/* What it costs to keep truthful. The whole redesign turns on
                  this: a module with a typing cost is empty by the time a
                  busy season arrives, so the price is stated up front. */}
              <p className="text-[0.66rem] text-[var(--faint)] mt-auto pt-2.5 leading-relaxed">
                {p.cost === "none"
                  ? "Costs nothing — it reads itself."
                  : `Costs ${p.cost} to keep true.`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
