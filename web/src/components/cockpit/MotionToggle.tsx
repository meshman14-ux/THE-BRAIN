"use client";

import { useEffect, useState } from "react";

/**
 * Three independently-switchable motion levels (spec decision 10):
 * opening sweep, live countdown/pulse, ambient drift. Each is a
 * `data-motion-*` attribute on `<html>`, read by the CSS in
 * globals.css. Defaults to ON — the mockup ships with all three lit —
 * and persists per-toggle to localStorage so a choice survives a reload.
 *
 * This is one of the small set of components allowed a mount-time effect
 * (§A7/A8 item 6): it reads `localStorage`, which does not exist on the
 * server and cannot be read in a lazy initialiser without a hydration
 * mismatch — the same reasoning already documented for `ModeSwitch`.
 */

type Level = "sweep" | "countdown" | "drift";
const LEVELS: { key: Level; label: string }[] = [
  { key: "sweep", label: "Sweep" },
  { key: "countdown", label: "Pulse" },
  { key: "drift", label: "Drift" },
];
const STORAGE_KEY = "brain-motion";

function apply(key: Level, on: boolean) {
  document.documentElement.setAttribute(`data-motion-${key}`, on ? "on" : "off");
}

export default function MotionToggle() {
  const [state, setState] = useState<Record<Level, boolean>>({
    sweep: true,
    countdown: true,
    drift: true,
  });

  useEffect(() => {
    let stored: Partial<Record<Level, boolean>> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = {};
    }
    const next = {
      sweep: stored.sweep ?? true,
      countdown: stored.countdown ?? true,
      drift: stored.drift ?? true,
    };
    setState(next);
    for (const k of LEVELS.map((l) => l.key)) apply(k, next[k]);
  }, []);

  function toggle(key: Level) {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    apply(key, next[key]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* a private tab with storage disabled loses the preference, not the app */
    }
  }

  return (
    <div className="flex items-center gap-1.5" aria-label="Motion levels">
      {LEVELS.map((l) => (
        <button
          key={l.key}
          type="button"
          onClick={() => toggle(l.key)}
          className="chip tap"
          data-active={state[l.key] ? "true" : "false"}
          aria-pressed={state[l.key]}
          style={{ fontSize: "0.62rem", padding: "3px 8px" }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
