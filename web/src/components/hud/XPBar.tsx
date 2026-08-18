import type { LevelState, Rank } from "@/lib/cockpit";

/** The top bar's level/XP fill and the rank badge. Pure render, real numbers. */
export function XPFill({ level }: { level: LevelState }) {
  const pct = level.span === 0 ? 100 : Math.min(100, Math.round((level.into / level.span) * 100));
  return (
    <div className="xpwrap" style={{ flex: 1, maxWidth: 340 }}>
      <div className="row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="lbl">LVL {level.level}</span>
        <span className="mono" style={{ fontSize: 11, color: "rgba(79,195,247,.8)" }}>
          {level.into.toLocaleString()} / {level.span.toLocaleString()} XP
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(30,74,102,.5)",
          border: "1px solid var(--hud-hair2)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--hud-dim), var(--hud-cyan))",
            boxShadow: "0 0 6px rgba(79,195,247,.5)",
          }}
        />
      </div>
    </div>
  );
}

export function RankBadge({ rank }: { rank: Rank }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        color: "var(--hud-cyan)",
        border: "1px solid var(--hud-hair)",
        padding: "2px 10px",
      }}
    >
      <span style={{ color: "var(--hud-core)", fontSize: 10, letterSpacing: -1 }}>
        {"▲".repeat(rank.chevrons)}
      </span>{" "}
      {rank.name}
    </span>
  );
}
