import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import ThemeToggle from "@/components/ThemeToggle";
import ModeSwitch from "@/components/ModeSwitch";
import { NAV } from "@/lib/nav";

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

  const [{ count: inboxCount }, { count: openCount }] = await Promise.all([
    supabase
      .from("inbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "doing"]),
  ]);

  const badge = (key: string) =>
    key === "inbox" ? inboxCount : key === "planner" ? openCount : null;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-5 h-14 flex items-center gap-2 sm:gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 sm:gap-2.5 no-underline text-[var(--text)] shrink-0"
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

          <nav className="ml-auto hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const c = badge(n.key);
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  data-nav-modes={n.modes.join(" ")}
                  className="px-3 py-2 rounded-[9px] text-[0.84rem] font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] no-underline transition-colors"
                >
                  {n.label}
                  {!!c && (
                    <span className="mono ml-1.5 text-[0.66rem] px-1.5 py-0.5 rounded-full bg-[var(--border)] text-[var(--muted)]">
                      {c}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* The two buttons from Jay's sheet. In the bar at every width —
              on a phone this is the only way to change system. */}
          <span className="ml-auto md:ml-1.5 shrink-0">
            <ModeSwitch />
          </span>
          <span className="shrink-0">
            <ThemeToggle />
          </span>

          <form action="/auth/signout" method="post" className="hidden md:block">
            <button className="btn btn-ghost text-[0.82rem] py-2 px-3" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1200px] px-5 py-7 pb-24 md:pb-8">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => n.phoneModes.length > 0).map((n) => (
            <Link
              key={n.key}
              href={n.href}
              data-phone-modes={n.phoneModes.join(" ")}
              className="py-2.5 flex flex-col items-center gap-0.5 no-underline text-[var(--muted)] active:text-[var(--accent)]"
            >
              <span className="text-base leading-none">{n.icon}</span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-wide">
                {n.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
