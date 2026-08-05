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
    // Read what ModeScript already applied rather than localStorage, so the
    // button state can never disagree with the palette on screen.
    setMode(normaliseMode(document.documentElement.getAttribute("data-mode")));
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
            className="px-2 py-1 rounded-[7px] text-[0.72rem] font-bold leading-none flex items-center gap-1 transition-colors"
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
