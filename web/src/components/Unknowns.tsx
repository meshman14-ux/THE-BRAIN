"use client";

import { type Unknown, inlineField } from "@/lib/inline";
import InlineValue from "./InlineValue";

/**
 * Everything the system does not know, in one list, each one a tap.
 *
 * The point is arithmetic: eight null debt balances scattered over two
 * screens is eight navigations, and nobody does eight navigations. Eight
 * rows on the screen he is already on is eight taps, and people do that.
 *
 * It is a panel, not a nag. It never enters the watchtower, it never
 * arrives unasked anywhere, and when there is nothing missing it says so
 * once and stops — a list that congratulates you every day for being
 * complete is a list you learn to scroll past.
 */
export default function Unknowns({
  items,
  values,
}: {
  items: Unknown[];
  /** Current value per `${key}:${id}`, so a saved row updates in place. */
  values: Record<string, string | number | null>;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
        Nothing outstanding. Every balance is confirmed and every vehicle date
        is recorded, so the totals on this page are whole rather than partial.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
        {items.length} figure{items.length === 1 ? "" : "s"} the system is
        missing. Each one edits here — no page to open, nothing to save.
      </p>
      <ul className="grid gap-1.5 list-none p-0 m-0">
        {items.map((u) => {
          const f = inlineField(u.key);
          return (
            <li
              key={`${u.key}:${u.id}`}
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-[9px] border border-[var(--border)] px-3 py-2.5"
            >
              <span className="text-[0.84rem] font-medium min-w-0">{u.subject}</span>
              <span className="label">{f.label}</span>
              <span className="ml-auto shrink-0 text-[0.85rem]">
                <InlineValue
                  field={u.key}
                  id={u.id}
                  value={values[`${u.key}:${u.id}`] ?? null}
                />
              </span>
              <span className="basis-full text-[0.7rem] text-[var(--faint)] leading-snug">
                {u.why}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
