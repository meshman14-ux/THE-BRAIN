"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/life/health", label: "Home" },
  { href: "/life/health/train", label: "Train" },
  { href: "/life/health/skills", label: "Skills" },
  { href: "/life/health/planner", label: "Planner" },
  { href: "/life/health/stats", label: "Stats" },
  { href: "/life/health/measurements", label: "Body" },
] as const;

/**
 * Real routes, not a client-side view switch — the mockup swaps `.view`
 * panels with JS; this is six actual pages, so a link is bookmarkable,
 * back-button-able and works with JS disabled. `usePathname` only decides
 * which one glows.
 *
 * `.hud-tabs`/`.hud-tab` (globals.css) rather than inline styles, because
 * a phone-width breakpoint can only live in a stylesheet — six tabs at
 * `flex:1` each squeeze unreadable below ~500px, so under `sm` they wrap
 * to two rows of three instead.
 */
export default function CockpitTabs() {
  const pathname = usePathname();
  return (
    <nav className="hud-tabs" role="tablist" aria-label="Body module sections">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} role="tab" aria-selected={active} className="hud-tab" data-active={active}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
