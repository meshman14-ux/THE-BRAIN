/**
 * A glass panel with the MARK-VII corner brackets and an optional serial
 * code — `.panel` already carries the glass surface (the `.sys-cockpit`
 * remap in globals.css makes `--lift`/`--border` HUD values), this only
 * adds the four corner spans a real element cannot draw from ::before/
 * ::after alone.
 */
export default function HudPanel({
  title,
  hint,
  serial,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  /** e.g. "TLM.001" — decoration, channel zero. */
  serial?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel hud-panel grid gap-2.5 min-w-0 ${className}`}>
      <span className="hud-corner" data-c="tl" />
      <span className="hud-corner" data-c="tr" />
      <span className="hud-corner" data-c="bl" />
      <span className="hud-corner" data-c="br" />
      {serial && <span className="hud-serial">{serial}</span>}
      {title && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--hud-cyan)",
            }}
          >
            {title}
          </h2>
          {hint && (
            <span className="text-[0.7rem]" style={{ color: "rgba(214,239,255,.55)" }}>
              {hint}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
