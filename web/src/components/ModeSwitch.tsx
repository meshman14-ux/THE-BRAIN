"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type Mode,
  type SystemKey,
  MODE_KEY,
  MODE_HOME,
  MODE_SHORT,
  MODE_ICON,
  SYSTEM_LABEL,
} from "@/lib/types";
import { normaliseMode, toggleMode } from "@/lib/logic";

/**
 * The two buttons from Jay's sheet: switch between LIFE_OS and EMPIRE_OS.
 *
 * A mode, not a filter. Pressing a system selects it — accent colour, nav
 * contents and the dashboard you are looking at all follow. Pressing the
 * one you are already in returns you to `brain`, the neutral position that
 * shows both.
 *
 * The class the app wears lives on <html> as `data-mode`, set before first
 * paint by ModeScript, so this component only has to keep it in step. The
 * nav itself is filtered in CSS off that same attribute, which is why the
 * top bar never rearranges on hydration.
 */
export default function ModeSwitch() {
  const [mode, setMode] = useState<Mode>("brain");
  const router = useRouter();

  useEffect(() => {
    // Re-apply rather than only read, exactly as ThemeToggle does for the
    // palette. ModeScript sets `data-mode` before first paint, but a client
    // navigation can reconcile <html> and drop it — and the CSS that filters
    // the nav keys off that one attribute. When it went missing the top bar
    // showed every item from every mode at once. The theme never had this
    // problem because its toggle rewrote the attribute on mount; now the
    // mode does too, so the state on screen heals itself either way.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODE_KEY);
    } catch {
      // Storage denied. `brain` is the neutral position and the right default.
    }
    const next = normaliseMode(
      saved ?? document.documentElement.getAttribute("data-mode")
    );
    document.documentElement.setAttribute("data-mode", next);
    setMode(next);
  }, []);

  function select(pressed: SystemKey) {
    const next = toggleMode(mode, pressed);
    setMode(next);
    document.documentElement.setAttribute("data-mode", next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Private browsing with storage denied: the mode still applies for
      // this session, it just will not be remembered. Not worth an error.
    }
    // This is how dashboard scope follows the mode — a Server Component
    // cannot read localStorage, so selecting a system goes to its dashboard.
    router.push(MODE_HOME[next]);
  }

  return (
    <div
      className="flex items-center gap-1 rounded-[10px] p-[3px]"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      role="group"
      aria-label="System"
    >
      {(["life", "empire"] as SystemKey[]).map((s) => {
        const on = mode === s;
        return (
          <button
            key={s}
            onClick={() => select(s)}
            aria-pressed={on}
            title={
              on
                ? `Leave ${SYSTEM_LABEL[s]} — back to the command centre`
                : `Switch to ${SYSTEM_LABEL[s]}`
            }
            // 38px drawn + `.tap`'s 3px above and below = 44 tapped, and
            // px-4 takes the icon-only form to 42 wide + 3 + 3 = 48. It was
            // 20x27, which made the only way to change system on a phone the
            // smallest control on the screen.
            //
            // `xl:px-2.5` gives the 24px back at exactly the width the top
            // nav appears. Thirteen nav items already sit inside 1200 with
            // ~27px to spare, so the wider switch pushed the header 23px
            // over its own box. 44px is a TOUCH minimum; xl is where the
            // phone bar hides and a pointer takes over, so the two
            // requirements never apply at the same width.
            className="tap min-h-[38px] px-4 xl:px-2.5 rounded-[7px] text-[0.72rem] font-bold leading-none flex items-center justify-center gap-1 transition-colors"
            style={{
              background: on ? `var(--${s})` : "transparent",
              color: on ? "var(--on-accent)" : "var(--muted)",
            }}
          >
            <span aria-hidden>{MODE_ICON[s]}</span>
            <span className="hidden sm:inline">{MODE_SHORT[s]}</span>
          </button>
        );
      })}
    </div>
  );
}
