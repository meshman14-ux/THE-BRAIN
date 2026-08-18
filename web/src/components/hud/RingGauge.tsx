/**
 * The readiness ring — a 270° arc from a real HYBRID score, not an
 * illustration. Both arcs (value and confidence) are computed from the
 * actual numbers passed in, so the ring can never show a score the engine
 * did not produce.
 *
 * Geometry follows the mockup exactly: viewBox is fixed at 0..440 and the
 * rendered SIZE is a CSS box around it, so the maths (r=172 value track,
 * r=152 confidence track, 270° sweep starting at 135°) never has to be
 * recomputed per size — only the box shrinks, on the `xl:` cockpit
 * breakpoint the same way the mockup's own media query does.
 *
 * Server-safe: no state, no effects, just SVG from props.
 */

const VB = 440;
const CX = VB / 2;
const CY = VB / 2;
const VALUE_R = 172;
const CONF_R = 152;
const SWEEP = 270; // degrees
const START = 135; // degrees — leaves a gap at the bottom, gauge-style

function arcDash(radius: number, fraction: number): { value: string; full: string } {
  const circumference = 2 * Math.PI * radius;
  const trackArc = (SWEEP / 360) * circumference;
  const valueLen = Math.max(0, Math.min(1, fraction)) * trackArc;
  return { value: `${valueLen.toFixed(1)} ${circumference.toFixed(1)}`, full: `${trackArc.toFixed(1)} ${circumference.toFixed(1)}` };
}

export default function RingGauge({
  score,
  confidence,
  band,
  size = 440,
  label = "READINESS",
  sysLine,
}: {
  /** 0–100, or null when the engine has nothing to show — see the caller. */
  score: number | null;
  /** 0–1. */
  confidence: number;
  band: "green" | "amber" | "red" | null;
  size?: number;
  label?: string;
  /** e.g. "SYS.OK" / "SYS.CAUTION" — the mockup's status readout line. */
  sysLine?: string;
}) {
  const track = arcDash(VALUE_R, 1);
  const value = score == null ? null : arcDash(VALUE_R, score / 100);
  const confTrack = arcDash(CONF_R, 1);
  const conf = arcDash(CONF_R, confidence);

  const colour =
    band === "green" ? "var(--hud-good)" : band === "amber" ? "var(--hud-orange)" : band === "red" ? "var(--hud-red)" : "var(--hud-dim)";

  return (
    <div style={{ position: "relative", width: size, height: size, maxWidth: "100%" }}>
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
        aria-label={
          score == null
            ? "Readiness not yet available"
            : `Readiness ${score} of 100, confidence ${Math.round(confidence * 100)} percent`
        }
        role="img"
      >
        {/* track */}
        <circle
          cx={CX}
          cy={CY}
          r={VALUE_R}
          fill="none"
          stroke="var(--hud-dim)"
          strokeOpacity={0.55}
          strokeWidth={10}
          strokeDasharray={track.full}
          transform={`rotate(${START} ${CX} ${CY})`}
          strokeLinecap="round"
        />
        {value && (
          <>
            <circle
              className="hud-ring-readiness"
              cx={CX}
              cy={CY}
              r={VALUE_R}
              fill="none"
              stroke={colour}
              strokeWidth={10}
              strokeDasharray={value.value}
              transform={`rotate(${START} ${CX} ${CY})`}
              strokeLinecap="round"
            />
            <circle
              cx={CX}
              cy={CY}
              r={VALUE_R}
              fill="none"
              stroke="var(--hud-core)"
              strokeWidth={3.5}
              strokeOpacity={0.8}
              strokeDasharray={value.value}
              transform={`rotate(${START} ${CX} ${CY})`}
              strokeLinecap="round"
            />
          </>
        )}
        {/* confidence sub-arc */}
        <circle
          cx={CX}
          cy={CY}
          r={CONF_R}
          fill="none"
          stroke="var(--hud-dim)"
          strokeOpacity={0.4}
          strokeWidth={2}
          strokeDasharray={confTrack.full}
          transform={`rotate(${START} ${CX} ${CY})`}
        />
        <circle
          cx={CX}
          cy={CY}
          r={CONF_R}
          fill="none"
          stroke="var(--hud-core)"
          strokeOpacity={0.75}
          strokeWidth={2}
          strokeDasharray={conf.value}
          transform={`rotate(${START} ${CX} ${CY})`}
          strokeLinecap="round"
        />
      </svg>
      <div className="hud-ring-center">
        <div className="lbl" style={{ fontSize: 12, letterSpacing: "0.3em", color: "rgba(79,195,247,.45)" }}>
          {label}
        </div>
        <div className="big hud-num" style={{ fontSize: size >= 320 ? 88 : 44 }}>
          {score ?? "—"}
        </div>
        {sysLine && (
          <div className="mono" style={{ fontSize: 12, color: colour, letterSpacing: "0.24em", marginTop: 6 }}>
            ■ {sysLine}
          </div>
        )}
        <div className="mono" style={{ fontSize: 11, color: "rgba(79,195,247,.7)", marginTop: 2 }}>
          CONF {Math.round(confidence * 100)}%
        </div>
      </div>
    </div>
  );
}
