"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NAV } from "@/lib/nav";
import { KIND_WORD, moveCursor, search, type Target } from "@/lib/commandk";

/**
 * ⌘K — a layer over wherever you already are.
 *
 * This is what replaces a `/search` route: the old one was a page you had to
 * go to, which meant leaving whatever you were doing to look something up.
 *
 * Rows are fetched ONCE, lazily, the first time it opens — so a session that
 * never presses ⌘K costs nothing, and one that presses it twice pays once.
 * Written plain rather than with a palette library: this app has no
 * client-side query layer and does not need its first dependency for a list.
 */
export default function CommandK() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [targets, setTargets] = useState<Target[] | null>(null);
  // The keydown listener is bound once, so it cannot read `targets` from a
  // stale closure — the ref is how "have we already fetched?" stays current.
  const targetsRef = useRef<Target[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const supabase = createClient();
    const pages: Target[] = NAV.map((n) => ({
      kind: "page" as const,
      id: `page:${n.key}`,
      label: n.label,
      href: n.href,
    }));
    // Addresses that carry no nav item but are real destinations.
    pages.push(
      { kind: "page", id: "page:capture", label: "Capture", href: "/capture" },
      { kind: "page", id: "page:estate", label: "Estate", href: "/estate", hint: "divisions ventures" },
      { kind: "page", id: "page:holdings", label: "What you own", href: "/holdings", hint: "assets investments" },
      { kind: "page", id: "page:metrics", label: "Metrics", href: "/life/metrics" },
      { kind: "page", id: "page:vault", label: "The vault", href: "/library/notes", hint: "notes" },
      { kind: "page", id: "page:setup", label: "Setup", href: "/setup", hint: "questions onboarding" }
    );

    const [people, ventures, notes, vehicles] = await Promise.all([
      supabase.from("people").select("id, name").limit(200),
      supabase.from("ventures").select("id, name, external_system").limit(200),
      supabase.from("notes").select("id, title").limit(200),
      supabase.from("vehicles").select("id, name, registration").limit(50),
    ]);

    const rows: Target[] = [
      ...pages,
      ...(people.data ?? []).map((p) => ({
        kind: "person" as const,
        id: `person:${p.id}`,
        label: p.name,
        href: "/life/people",
      })),
      // MAINFRAME is a pointer row and has no page of its own (§A1).
      ...(ventures.data ?? [])
        .filter((v) => !v.external_system)
        .map((v) => ({
          kind: "venture" as const,
          id: `venture:${v.id}`,
          label: v.name,
          href: `/empire/${v.id}`,
        })),
      ...(notes.data ?? [])
        .filter((n) => n.title)
        .map((n) => ({
          kind: "note" as const,
          id: `note:${n.id}`,
          label: n.title as string,
          href: `/library/notes/${n.id}`,
        })),
      ...(vehicles.data ?? []).map((v) => ({
        kind: "vehicle" as const,
        id: `vehicle:${v.id}`,
        label: v.name,
        href: "/life/money/vehicles",
        hint: v.registration ?? undefined,
      })),
    ];
    targetsRef.current = rows;
    setTargets(rows);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // The reset belongs to the OPEN, not to an effect watching it: the
        // box should be empty every time it appears, and doing that here
        // keeps it a consequence of the keystroke rather than of a render.
        setQ("");
        setCursor(0);
        setOpen((was) => {
          // Fetch once, lazily, on the first open. Done here rather than in an
          // effect watching `open`: the fetch is a consequence of the
          // keystroke, not of a render, and saying so keeps it out of the
          // set-state-in-effect exception list the repo deliberately keeps short.
          if (!was && targetsRef.current === null) load();
          return !was;
        });
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `load` is a stable useCallback with no deps, so binding once is correct
    // and re-binding on every render would only churn the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  const results = search(targets ?? [], q);

  function go(t: Target) {
    setOpen(false);
    router.push(t.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-[560px] p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          // The input only mounts when the palette opens, so autoFocus is the
          // honest way to focus it — no effect reaching into the DOM.
          autoFocus
          className="input w-full border-0 rounded-none text-base"
          placeholder="Find a page, a division, a person…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => moveCursor(c, 1, results.length));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => moveCursor(c, -1, results.length));
            }
            if (e.key === "Enter" && results[cursor]) go(results[cursor]);
          }}
        />

        {q && results.length === 0 && (
          <p className="px-4 py-4 text-sm text-[var(--muted)]">
            {targets === null ? "Looking…" : "Nothing by that name."}
          </p>
        )}

        {results.length > 0 && (
          <ul className="list-none m-0 p-0 max-h-[50vh] overflow-y-auto border-t border-[var(--border)]">
            {results.map((t, i) => (
              <li key={t.id}>
                <button
                  className={`w-full text-left px-4 py-3 flex items-center gap-2 ${
                    i === cursor ? "bg-[var(--panel-2)]" : ""
                  }`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(t)}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{t.label}</span>
                  <span className="chip shrink-0 text-xs">{KIND_WORD[t.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="px-4 py-2 text-xs text-[var(--faint)] border-t border-[var(--border)]">
          ↑↓ to move · ↵ to open · esc to close
        </p>
      </div>
    </div>
  );
}
