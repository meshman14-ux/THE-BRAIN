import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/dashboard", label: "Areas", icon: "◈" },
  { href: "/planner", label: "Planner", icon: "▤" },
  { href: "/week", label: "Week", icon: "▦" },
  { href: "/capture", label: "Capture", icon: "＋" },
  { href: "/inbox", label: "Inbox", icon: "▣" },
];

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

  const badge = (href: string) =>
    href === "/inbox" ? inboxCount : href === "/planner" ? openCount : null;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="mx-auto max-w-[1200px] px-5 h-14 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 no-underline text-[var(--text)]"
          >
            <span
              className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[13px] font-bold mono"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              JB
            </span>
            <span className="serif font-semibold text-[1.05rem]">THE BRAIN</span>
          </Link>

          <nav className="ml-auto hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const c = badge(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
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
            <span className="mx-1.5">
              <ThemeToggle />
            </span>
            <form action="/auth/signout" method="post">
              <button className="btn btn-ghost text-[0.82rem] py-2 px-3" type="submit">
                Sign out
              </button>
            </form>
          </nav>

          <span className="ml-auto md:hidden">
            <ThemeToggle />
          </span>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1200px] px-5 py-7 pb-24 md:pb-8">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
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
