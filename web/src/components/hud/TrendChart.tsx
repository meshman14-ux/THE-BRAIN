/**
 * A small SVG trend line or bar chart over a real series.
 *
 * Holds the same rule `sparkPoints()` already holds in `metrics.ts`: one
 * point is a value, not a trend, so a line is refused below two points —
 * the caller gets `null` back from `linePoints`/`barRects` rather than a
 * chart that implies a direction from a single reading.
 */

const VB_W = 300;
const VB_H = 140;

export type Band = { fromPct: number; toPct: number; tone?: "safe" | "warn" };

function scaleY(v: number, min: number, max: number, top = 6, bottom = 130): number {
  if (max === min) return (top + bottom) / 2;
  return bottom - ((v - min) / (max - min)) * (bottom - top);
}

/** Points for a `<polyline>`, or null when there is nothing to draw a line through. */
export function linePoints(values: number[]): string | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = VB_W / (values.length - 1);
  return values.map((v, i) => `${(i * step).toFixed(1)},${scaleY(v, min, max).toFixed(1)}`).join(" ");
}

export default function TrendChart({
  values,
  bands = [],
  baseline,
  axisTop,
  axisBottom,
  axisLeft = "-30D",
  axisRight = "NOW",
  variant = "line",
}: {
  values: number[];
  bands?: Band[];
  /** A dashed reference line, e.g. the personal baseline. */
  baseline?: number;
  axisTop?: string;
  axisBottom?: string;
  axisLeft?: string;
  axisRight?: string;
  variant?: "line" | "bar";
}) {
  if (values.length === 0) {
    return (
      <p className="text-[0.72rem]" style={{ color: "rgba(214,239,255,.45)" }}>
        No readings yet.
      </p>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = linePoints(values);

  return (
    <svg className="chart" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 6 }}>
      {bands.map((b, i) => (
        <rect
          key={i}
          x={0}
          y={(b.fromPct / 100) * 130}
          width={VB_W}
          height={((b.toPct - b.fromPct) / 100) * 130}
          fill={b.tone === "warn" ? "rgba(255,159,67,.06)" : "rgba(124,232,196,.07)"}
        />
      ))}
      <g opacity={0.8} stroke="rgba(79,195,247,.1)" strokeWidth={0.5}>
        <line x1={0} y1={30} x2={VB_W} y2={30} />
        <line x1={0} y1={65} x2={VB_W} y2={65} />
        <line x1={0} y1={100} x2={VB_W} y2={100} />
      </g>
      {baseline != null && (
        <line
          x1={0}
          y1={scaleY(baseline, min, max)}
          x2={VB_W}
          y2={scaleY(baseline, min, max)}
          stroke="rgba(255,159,67,.5)"
          strokeWidth={0.8}
          strokeDasharray="3 3"
        />
      )}
      {variant === "bar" ? (
        values.map((v, i) => {
          const w = VB_W / values.length - 4;
          const x = i * (VB_W / values.length) + 2;
          const y = scaleY(v, min, max);
          const hot = i === values.length - 1;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={130 - y}
              fill={hot ? "rgba(79,195,247,.65)" : "rgba(79,195,247,.35)"}
              stroke="var(--hud-cyan)"
              strokeWidth={0.6}
            />
          );
        })
      ) : points ? (
        <polyline
          points={points}
          fill="none"
          stroke="var(--hud-cyan)"
          strokeWidth={1.6}
          style={{ filter: "drop-shadow(0 0 3px rgba(79,195,247,.6))" }}
        />
      ) : (
        <text x={4} y={70} className="mono" fontSize={9} fill="rgba(214,239,255,.4)">
          one reading — needs a second to draw a line
        </text>
      )}
      {axisTop && (
        <text x={2} y={12} className="axis" fontSize={8} fontFamily="Share Tech Mono" fill="rgba(79,195,247,.55)">
          {axisTop}
        </text>
      )}
      {axisBottom && (
        <text x={2} y={128} className="axis" fontSize={8} fontFamily="Share Tech Mono" fill="rgba(79,195,247,.55)">
          {axisBottom}
        </text>
      )}
      <text x={2} y={139} className="axis" fontSize={8} fontFamily="Share Tech Mono" fill="rgba(79,195,247,.55)">
        {axisLeft}
      </text>
      <text x={VB_W - 24} y={139} className="axis" fontSize={8} fontFamily="Share Tech Mono" fill="rgba(79,195,247,.55)">
        {axisRight}
      </text>
    </svg>
  );
}
