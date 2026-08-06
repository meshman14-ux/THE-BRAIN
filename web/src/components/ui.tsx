/**
 * The shared furniture both dashboards are built from.
 *
 * All server-safe — no state, no effects — so a Server Component can render
 * them directly without pulling a client bundle in behind it. Every colour
 * is a CSS variable, so both themes come for free.
 */

import Link from "next/link";

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // `min-w-0` is load-bearing: a grid item defaults to `min-width: auto`,
    // so a panel holding something wide (the month grid, a code block) would
    // otherwise push the whole page wider than the phone and take every
    // other panel with it.
    <section className={`card p-4 sm:p-5 flex flex-col gap-3.5 min-w-0 ${className}`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="label">{title}</h2>
        {hint && (
          <span className="text-[0.7rem] text-[var(--faint)]">{hint}</span>
        )}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * The first-run voice. Every panel is empty on day one, so an empty state
 * has to teach what the panel is for and what fills it — never apologise
 * for being empty, and never pretend the emptiness is a problem.
 */
export function Empty({
  children,
  cta,
}: {
  children: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
      <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
        {children}
      </p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block mt-2.5 text-[0.78rem] font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/**
 * One headline number. `value` is pre-formatted by the caller, because the
 * decision about whether something reads `£0` or `£—` is a rule that lives
 * in logic.ts and is tested — not a decision a tile makes on the fly.
 */
export function Kpi({
  label,
  value,
  note,
  tone = "text",
  href,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "text" | "good" | "warn" | "bad" | "accent" | "faint";
  href?: string;
}) {
  const colour = {
    text: "var(--text)",
    good: "var(--good)",
    warn: "var(--warn)",
    bad: "var(--bad)",
    accent: "var(--accent)",
    faint: "var(--faint)",
  }[tone];

  const body = (
    <>
      <p className="label">{label}</p>
      <p
        className="mono text-[1.5rem] sm:text-[1.75rem] font-semibold leading-none mt-2"
        style={{ color: colour }}
      >
        {value}
      </p>
      {note && (
        <p className="text-[0.7rem] text-[var(--faint)] mt-1.5 leading-snug">
          {note}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card card-hover p-4 no-underline text-[var(--text)] block transition-colors"
      >
        {body}
      </Link>
    );
  }
  return <div className="card p-4">{body}</div>;
}

/* ------------------------------------------------------------------ *
 * Bars
 * ------------------------------------------------------------------ */

/**
 * A labelled progress bar. `percent` is already clamped by the caller's
 * rule; this only draws it.
 */
export function Bar({
  percent,
  colour = "var(--accent)",
  height = 8,
  muted = false,
}: {
  percent: number;
  colour?: string;
  height?: number;
  muted?: boolean;
}) {
  return (
    <div
      className="w-full rounded-full overflow-hidden bg-[var(--bg-2)] border border-[var(--border)]"
      style={{ height }}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${percent}%`,
          background: colour,
          opacity: muted ? 0.45 : 1,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Chips
 * ------------------------------------------------------------------ */

/** A read-only chip. `.chip` itself is a button style; this is the label form. */
export function Tag({
  children,
  colour = "var(--muted)",
  title,
}: {
  children: React.ReactNode;
  colour?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="text-[0.66rem] font-bold uppercase tracking-[0.06em] px-2 py-[3px] rounded-[6px] border shrink-0"
      style={{ color: colour, borderColor: "var(--border-bright)" }}
    >
      {children}
    </span>
  );
}

/**
 * Shown wherever a stated figure and the underlying evidence disagree.
 * The system's job is to surface the gap, not to decide which side is right.
 */
export function DriftNote({
  stated,
  derived,
  what,
}: {
  stated: number;
  derived: number;
  what: string;
}) {
  return (
    <p className="text-[0.72rem] leading-relaxed" style={{ color: "var(--warn)" }}>
      You have this at <b className="mono">{stated}%</b>; {what} puts it at{" "}
      <b className="mono">{derived}%</b>. One of the two is out of date.
    </p>
  );
}
