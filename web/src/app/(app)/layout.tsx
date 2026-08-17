import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import ThemeToggle from "@/components/ThemeToggle";
import ModeSwitch from "@/components/ModeSwitch";
import { NAV } from "@/lib/nav";
import { ALL_PARENTS } from "@/lib/parents";
import CommandK from "@/components/CommandK";

/**
 * The app shell.
 *
 * Every nav item for every mode is rendered once, carrying the modes it
 * belongs to; CSS hides the ones that do not apply (see globals.css). That
 * is deliberate — the alternative, filtering in a client component off
 * localStorage, would rearrange the top bar on every hydration. This way the
 * bar is correct on the first frame with no JavaScript at all.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!supabaseConfigured) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ count: inboxCount }, { count: openCount }, { count: captureCount }] =
    await Promise.all([
      supabase
        .from("inbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "doing"]),
      // Documents read but not yet confirmed. A capture nobody decided on is
      // work waiting, so the sidebar says so rather than letting it go quiet.
      supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("status", "extracted"),
    ]);

  const badge = (key: string) =>
    key === "inbox"
      ? inboxCount
      : key === "planner"
        ? openCount
        : key === "capture"
          ? captureCount
          : null;

  return (
    <div className="min-h-dvh flex flex-col">
      <header data-appshell className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-5 h-14 flex items-center gap-2 sm:gap-4">
          <Link
            href="/dashboard"
            // `.tap` + a 38px floor: the badge is drawn at 32 and this is a
            // link to /dashboard, so it was the one bit of chrome still
            // under the thumb minimum.
            className="tap min-h-[38px] min-w-[38px] flex items-center gap-2 sm:gap-2.5 no-underline text-[var(--text)] shrink-0"
          >
            <span
              className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[13px] font-bold mono shrink-0"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              JB
            </span>
            {/* Below 640px the badge carries the brand on its own — the mode
                switch needs that width more than the wordmark does. */}
            <span className="serif font-semibold text-[1.05rem] hidden sm:inline whitespace-nowrap">
              THE BRAIN
            </span>
          </Link>

          {/* THE HEADER'S WIDTH HISTORY, kept because it is the reason for the
              shape of this file. The nav used to be a horizontal row here and
              was permanently one item from overflowing: thirteen items at
              `px-1.5` measured ~1173px inside a `max-w-[1200px]` box, and at
              `lg` it pushed the page 197px sideways. It moved to a COLUMN on
              2026-08-17, which removed the budget entirely — a fourteenth
              item now costs 36px of height instead of a remeasure.

              What is left here is deliberately small and mode-scoped, so the
              header can never go back to being the constraint. Every `xl:` in
              this file is still one decision and they must stay in step: if
              the phone bar hides before desktop navigation appears there is a
              width with no navigation at all, and if `main` drops `pb-24`
              early the bar covers the last row. */}
          {/* The quick bar — the current system's modules, beside the switch
              that chooses the system.

              MODE-SCOPED ON PURPOSE. LIFE carries four modules and EMPIRE
              five; showing both in `brain` would put nine short links in the
              header and re-create precisely the width problem the column was
              built to dissolve. Brain is the neutral position and its sidebar
              already lists everything, so it keeps the two actions and no
              modules. Filtering is the same fail-closed CSS the nav uses, so
              this is correct on the first frame with no JavaScript.

              `xl` because that is every breakpoint in this file: below it the
              phone bar is the navigation, and it already carries Capture. */}
          <nav className="ml-auto hidden xl:flex items-center gap-0.5">
            {ALL_PARENTS.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                data-nav-modes={p.layer}
                title={p.question}
                className="px-2 py-2 rounded-[9px] text-[0.78rem] font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] no-underline transition-colors whitespace-nowrap"
              >
                {p.name}
              </Link>
            ))}
          </nav>

          {/* The two buttons from Jay's sheet. In the bar at every width —
              on a phone this is the only way to change system. */}
          <span className="ml-auto xl:ml-1.5 shrink-0">
            <ModeSwitch />
          </span>

          {/* Capture, beside the switch, at EVERY width.
              It is the entry point (locked decision 4) and the one control
              whose value is entirely in being reachable without thinking —
              a thought had while looking for the capture button is a thought
              already half lost. The count is documents read and not yet
              confirmed, so an unfinished capture cannot go quiet. */}
          <Link
            href="/capture"
            className="btn tap shrink-0 text-[0.82rem] py-2 px-3 whitespace-nowrap no-underline flex items-center gap-1.5"
          >
            <span aria-hidden>＋</span>
            <span>Capture</span>
            {!!captureCount && (
              <span className="mono text-[0.66rem] px-1.5 py-0.5 rounded-full bg-[var(--bg)]/30">
                {captureCount}
              </span>
            )}
          </Link>
          <span className="shrink-0">
            <ThemeToggle />
          </span>

          <form action="/auth/signout" method="post" className="hidden xl:block shrink-0">
            <button
              className="btn btn-ghost text-[0.82rem] py-2 px-3 whitespace-nowrap"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-[1200px] flex">
        {/* The sidebar replaces the top nav at the same breakpoint the top
            nav used, so `hidden xl:flex` still governs desktop navigation and
            every rule about the phone bar staying in step is unchanged.

            It also dissolves the problem the old bar was fighting. A
            horizontal row of thirteen items needed 1173px inside a 1200px
            box, remeasured twice, with the honest next step being a shorter
            label or fewer items. A vertical list has no such budget: a
            fourteenth item costs 36px of height, of which there is plenty. */}
        <nav
          data-appshell
          className="hidden xl:flex flex-col gap-0.5 w-[196px] shrink-0 py-7 pr-4 border-r border-[var(--border)]"
        >
          {NAV.map((n) => {
            const c = badge(n.key);
            return (
              <Link
                key={n.key}
                href={n.href}
                data-nav-modes={n.modes.join(" ")}
                className="px-3 py-2 rounded-[9px] text-[0.84rem] font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] no-underline transition-colors flex items-center gap-2"
              >
                <span className="text-[0.95rem] leading-none w-4 shrink-0">{n.icon}</span>
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                {!!c && (
                  <span className="mono shrink-0 text-[0.66rem] px-1.5 py-0.5 rounded-full bg-[var(--border)] text-[var(--muted)]">
                    {c}
                  </span>
                )}
              </Link>
            );
          })}

          <p className="mt-auto px-3 text-[0.66rem] text-[var(--faint)] leading-relaxed">
            ⌘K to find anything
          </p>
        </nav>

        <main className="flex-1 min-w-0 px-5 py-7 pb-24 xl:pb-8">{children}</main>
      </div>

      {/* ⌘K is a LAYER, not a route — it opens over whatever you were doing.
          It renders nothing until pressed and fetches nothing until opened. */}
      <CommandK />

      {/* `xl:hidden` must mirror the top nav's `xl:flex` — in step, or a
          width exists with no navigation. `data-appshell` is how the print
          sheet strips the chrome. */}
      <nav data-appshell className="xl:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => n.phoneModes.length > 0).map((n) => (
            <Link
              key={n.key}
              href={n.href}
              data-phone-modes={n.phoneModes.join(" ")}
              // `min-w-0` is what lets the label truncate instead of pushing
              // out of its column. A grid child defaults to min-width:auto, so
              // without it a long label — "Opportunities" at 390px — renders
              // wider than its fifth of the bar and leans on its neighbours.
              className="py-2.5 px-1 min-w-0 flex flex-col items-center gap-0.5 no-underline text-[var(--muted)] active:text-[var(--accent)]"
            >
              <span className="text-base leading-none">{n.icon}</span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-wide max-w-full truncate">
                {n.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
