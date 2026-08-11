"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Add to calendar" — the one button from Jay's sheet.
 *
 * It does not invent a second way to reach Google. It runs the same
 * two-way pass `/calendar` runs, because everything scheduled here is
 * already an event waiting to be pushed: a `do_date` is an all-day block,
 * and a `meta.time` written by the day planner is a timed one. The button
 * is a shortcut to a sync, not a new integration.
 *
 * If the calendar has never been connected there is nothing to push to, so
 * the button says that plainly and points at the place to fix it rather
 * than failing into a shrug.
 */
export default function AddToCalendar({
  connected,
  label = "Add to calendar",
}: {
  connected: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  if (!connected) {
    return (
      <Link href="/calendar" className="chip no-underline">
        Connect calendar first →
      </Link>
    );
  }

  async function run() {
    setBusy(true);
    setLine("");
    setFailed(false);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setFailed(true);
        setLine(body?.error ?? "The sync did not complete.");
      } else {
        setLine(body?.line ?? "Synced.");
        // Partial failures are reported rather than swallowed.
        if (Array.isArray(body?.errors) && body.errors.length > 0) {
          setFailed(true);
          setLine(
            `${body.line ?? "Synced"} · ${body.errors.length} item${
              body.errors.length === 1 ? "" : "s"
            } failed — see /calendar`
          );
        }
        router.refresh();
      }
    } catch {
      setFailed(true);
      setLine("Could not reach the sync.");
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button onClick={run} disabled={busy} className="chip">
        {busy ? "Syncing…" : label}
      </button>
      {line && (
        <span
          className="text-[0.7rem]"
          style={{ color: failed ? "var(--warn)" : "var(--muted)" }}
        >
          {line}
        </span>
      )}
    </span>
  );
}
