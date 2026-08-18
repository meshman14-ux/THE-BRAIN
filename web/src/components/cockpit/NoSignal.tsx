import Link from "next/link";

/**
 * The honest empty face (constraint 3). Never "no data" — that says
 * nothing an adult can act on. Always what is missing, and where to go
 * fix it if there's somewhere to go. Never dimmed: on a dark HUD, dim
 * reads as disabled, and an unfed widget is not broken.
 */
export default function NoSignal({
  tag = "NO SIGNAL",
  children,
  href,
  cta,
}: {
  tag?: string;
  children: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <p className="hud-no-signal">
      <span className="hud-no-signal-tag">◌ {tag}</span>
      {children}
      {href && cta && (
        <>
          {" "}
          <Link href={href} className="font-semibold no-underline" style={{ color: "var(--hud-cyan)" }}>
            {cta} →
          </Link>
        </>
      )}
    </p>
  );
}
