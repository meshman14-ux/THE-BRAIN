import type { HexDay } from "@/lib/cockpit";

/**
 * The week, drawn as hexes — real calendar days from `cockpit.ts`'s
 * `hexWeek()`, never a forecast. `future` renders identically to
 * `pending` visually (an empty hex) but is a distinct state in the data,
 * so a caller that needs the distinction — "not missed, just not here
 * yet" — has it without re-deriving from dates.
 */
export default function HexWeek({ days }: { days: HexDay[] }) {
  return (
    <div className="hud-hexrow" role="img" aria-label="This week, Monday to Sunday">
      {days.map((d) => {
        const filled = d.state === "done";
        const stroke = d.state === "pending" ? "rgba(30,74,102,.9)" : "var(--hud-cyan)";
        return (
          <div key={d.iso} className="hud-hex" data-s={d.state} title={`${d.label} · ${d.state}`}>
            <svg viewBox="0 0 44 50">
              <polygon
                points="22,2 41,13 41,37 22,48 3,37 3,13"
                fill={filled ? "var(--hud-cyan)" : "transparent"}
                stroke={stroke}
                strokeWidth={1.2}
              />
            </svg>
            <span className="d">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
