import Link from "next/link";
import { ALL_VIEW, type ParentArea, type ParentState, subHref } from "@/lib/parents";

/* ------------------------------------------------------------------ *
 * The parent page, identical everywhere
 *
 * Five pages, one shape. That is most of what the compression buys: you
 * learn the layout once and it works in Money, in Body, in Standing.
 *
 * The tab bar FILTERS a page that is already fully rendered rather than
 * navigating anywhere new. Three things fall out of that:
 *
 *   · **One scrolling page.** Land on Money with no parameter and every
 *     section is there — debt, accounts, vehicles, worth — in one scroll.
 *   · **Tabs.** Pick one and the rest are hidden, which is what a phone
 *     needs and what a focused job needs.
 *   · **Deep links.** `?tab=vehicles` behaves exactly like a sub-page when
 *     something links to it, without being one — which is what lets the
 *     old /life/vehicles route redirect somewhere true.
 *
 * The cost, stated plainly: there is no separate overview SCREEN. The
 * header band is the overview. One scroll beat a summary you have to
 * click past, but it was a choice rather than a fact.
 * ------------------------------------------------------------------ */

const STATE_COLOUR: Record<ParentState, string> = {
  ok: "var(--good)",
  note: "var(--warn)",
  warn: "var(--bad)",
};

export function ParentHeader({
  parent,
  view,
  line,
  state = "ok",
  working,
  stale,
}: {
  parent: ParentArea;
  view: string;
  /** The one truth. Always words, never a bare number. */
  line: string;
  state?: ParentState;
  /** How a score was arrived at. Printed under the line, never instead of it. */
  working?: string | null;
  stale?: string | null;
}) {
  return (
    <header className="grid gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-[1.35rem] font-bold m-0 leading-none">
          <span aria-hidden className="mr-2 text-[var(--faint)]">
            {parent.icon}
          </span>
          {parent.name}
        </h1>
        <p className="text-[0.74rem] text-[var(--faint)] m-0">{parent.question}</p>
      </div>

      {/* The one truth, carrying its own colour. A parent that is fine
          still speaks — an area that goes silent when healthy is
          indistinguishable from one that is broken. */}
      <p
        className="text-[0.92rem] font-semibold m-0 leading-snug"
        style={{ color: state === "ok" ? "var(--text)" : STATE_COLOUR[state] }}
      >
        {line}
      </p>

      {working && (
        <p className="text-[0.76rem] text-[var(--muted)] m-0 leading-relaxed max-w-[70ch]">
          {working}
        </p>
      )}

      {stale && (
        <p className="text-[0.74rem] m-0" style={{ color: "var(--warn)" }}>
          {stale}
        </p>
      )}

      <ParentTabs parent={parent} view={view} />
    </header>
  );
}

export function ParentTabs({ parent, view }: { parent: ParentArea; view: string }) {
  // Filters stay tabs on this page; pages become links that navigate.
  // Visually identical, structurally honest — and `subHref` is the one
  // place the page-versus-filter rule is applied, so no screen has to
  // know it.
  const tabs = [
    { id: ALL_VIEW, label: "All", hint: "everything, one scroll", kind: "filter" as const },
    ...parent.views,
  ];
  const active = tabs.find((t) => t.id === view) ?? tabs[0];
  return (
    <div className="grid gap-2">
      <nav
        className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5"
        aria-label={`${parent.name} sections`}
      >
        {tabs.map((t) => {
          const on = t.id === view;
          return (
            <Link
              key={t.id}
              href={subHref(parent, t.id)}
              aria-current={on ? "page" : undefined}
              data-active={on ? "true" : "false"}
              // A page view leaves this screen, so it says so rather than
              // looking like a filter that did nothing.
              className={`chip no-underline shrink-0${t.kind === "page" ? " opacity-90" : ""}`}
            >
              {t.label}
              {t.kind === "page" && <span aria-hidden className="ml-1 text-[0.6rem]">↗</span>}
            </Link>
          );
        })}
      </nav>
      {/* The hint explains what the tab is FOR, which is the difference
          between a label you can read and a label you can act on. */}
      <p className="text-[0.72rem] text-[var(--faint)] m-0">{active.hint}</p>
    </div>
  );
}

/**
 * One sub-module.
 *
 * Not rendered when filtered out. The drop's version rendered everything
 * and hid it with CSS to avoid a re-fetch — but every section here is an
 * async server component that fetches its own data, so "hidden" would
 * still have paid for every query on every tab. Returning null actually
 * skips the work.
 */
export function ParentSection({
  id,
  title,
  view,
  children,
}: {
  id: string;
  title: string;
  view: string;
  children: React.ReactNode;
}) {
  if (!(view === ALL_VIEW || view === id)) return null;
  return (
    <section id={id} className="grid gap-3 scroll-mt-20">
      <h2 className="text-[0.7rem] font-bold tracking-[0.14em] uppercase text-[var(--faint)] m-0">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The shared-tools slice.
 *
 * THE BRAIN owns the planner; a parent shows its own WINDOW onto it. Same
 * table, filtered — never a second task list, which is how things get
 * missed in one place while looking done in another.
 */
export function ParentWork({
  parent,
  children,
}: {
  parent: ParentArea;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 pt-5 border-t border-[var(--border)]">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[0.7rem] font-bold tracking-[0.14em] uppercase text-[var(--faint)] m-0">
          This area&apos;s work
        </h2>
        <Link
          href="/planner"
          className="text-[0.72rem] no-underline ml-auto"
          style={{ color: "var(--accent)" }}
        >
          ALL TASKS →
        </Link>
      </div>
      <p className="text-[0.72rem] text-[var(--faint)] m-0 leading-relaxed">
        A window onto the planner, not a second list — anything here is the same task you
        would see in the planner, filtered to {parent.name}.
      </p>
      {children}
    </section>
  );
}
