"use client";

import Link from "next/link";
import { useState } from "react";
import type { SetupStep } from "@/lib/setup";
import { inlineField } from "@/lib/inline";
import InlineValue from "./InlineValue";

/**
 * The setup list.
 *
 * Every gap in the system, each one either typed here or one tap away.
 * The reason sits under each heading rather than behind a tooltip, because
 * the reason is the only thing that makes the twentieth figure worth
 * typing — by then "because the list said so" has stopped working.
 *
 * Finished steps stay, greyed and collapsed. A list that silently shortens
 * as you work down it gives no sense of having got anywhere, and getting
 * somewhere is the entire point of the screen.
 */
export default function SetupList({
  steps,
  values,
}: {
  steps: SetupStep[];
  /** Current value per `${key}:${id}`, so a saved figure updates in place. */
  values: Record<string, string | number | null>;
}) {
  return (
    <div className="grid gap-2.5">
      {steps.map((step) => (
        <Step key={step.id} step={step} values={values} />
      ))}
    </div>
  );
}

function Step({
  step,
  values,
}: {
  step: SetupStep;
  values: Record<string, string | number | null>;
}) {
  // Done steps start closed — they are there to be counted, not read.
  const [open, setOpen] = useState(!step.done);

  return (
    <section
      className="panel"
      style={{
        borderColor: step.done
          ? "var(--border)"
          : step.worldPunishes
            ? "var(--bad)"
            : "var(--border)",
        opacity: step.done ? 0.55 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-baseline gap-2.5 w-full text-left bg-transparent border-0 p-0 cursor-pointer"
      >
        <span
          aria-hidden
          className="mono text-[0.8rem] shrink-0"
          style={{ color: step.done ? "var(--good)" : "var(--faint)" }}
        >
          {step.done ? "✓" : "○"}
        </span>
        <span className="flex-1 min-w-0">
          <span
            className="text-[0.88rem] font-semibold leading-snug block"
            style={{ textDecoration: step.done ? "line-through" : "none" }}
          >
            {step.title}
          </span>
        </span>
        {/* The world's business is marked, because it is the one category
            here that is not this system having an opinion. */}
        {step.worldPunishes && !step.done && (
          <span
            className="mono text-[0.58rem] font-bold uppercase tracking-[0.1em] shrink-0"
            style={{ color: "var(--bad)" }}
          >
            Legal
          </span>
        )}
        {step.oneOff && !step.done && (
          <span className="mono text-[0.58rem] uppercase tracking-[0.1em] text-[var(--faint)] shrink-0">
            One-off
          </span>
        )}
      </button>

      {open && (
        <>
          <p className="text-[0.76rem] text-[var(--muted)] leading-relaxed mt-2 m-0">
            {step.unlocks}
          </p>

          {/* Figures typed here. No form, no Save — tap the dash, type,
              look away. */}
          {step.figures && step.figures.length > 0 && (
            <ul className="grid gap-1.5 list-none p-0 mt-2.5 m-0">
              {step.figures.map((fig) => {
                const f = inlineField(fig.key);
                return (
                  <li
                    key={`${fig.key}:${fig.id}`}
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-[9px] border border-[var(--border)] px-3 py-2.5"
                  >
                    <span className="text-[0.82rem] font-medium min-w-0">{fig.subject}</span>
                    <span className="label">{f.label}</span>
                    <span className="ml-auto shrink-0 text-[0.85rem]">
                      <InlineValue
                        field={fig.key}
                        id={fig.id}
                        value={values[`${fig.key}:${fig.id}`] ?? null}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {step.href && !step.done && (
            <Link
              href={step.href}
              className="inline-block mono text-[0.7rem] font-bold no-underline mt-2.5"
              style={{ color: "var(--accent)" }}
            >
              {step.cta} →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
