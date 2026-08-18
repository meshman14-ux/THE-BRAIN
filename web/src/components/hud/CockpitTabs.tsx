"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/life/body", label: "Home" },
  { href: "/life/body/train", label: "Train" },
  { href: "/life/body/skills", label: "Skills" },
  { href: "/life/body/planner", label: "Planner" },
  { href: "/life/body/stats", label: "Stats" },
  { href: "/life/body/measurements", label: "Body" },
] as const;

/**
 * Real routes, not a client-side view switch — the mockup swaps `.view`
 * panels with JS; this is six actual pages, so a link is bookmarkable,
 * back-button-able and works with JS disabled. `usePathname` only decides
 * which one glows.
 */
export default function CockpitTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" role="tablist" aria-label="Body module sections" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className="tab"
            data-active={active}
            style={{
              flex: 1,
              textAlign: "center",
              background: "var(--hud-panel)",
              border: `1px solid ${active ? "var(--hud-cyan)" : "var(--hud-hair2)"}`,
              color: active ? "var(--hud-core)" : "rgba(214,239,255,.6)",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "10px 0",
              textDecoration: "none",
              boxShadow: active ? "0 0 10px rgba(79,195,247,.25), inset 0 0 12px rgba(79,195,247,.08)" : "none",
              textShadow: active ? "0 0 8px rgba(79,195,247,.8)" : "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
