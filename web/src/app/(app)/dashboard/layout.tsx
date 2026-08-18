/**
 * THE BRAIN's command centre — the full MARK-VII HUD ground, scoped to
 * `/dashboard`. Same class, same `--hud-*` tokens the health cockpit at
 * `/life/health` already validated in `tests/palette.test.ts` — "Variant
 * A, MARK-VII app-wide" means the SAME ground, not a second one, so this
 * needed no new palette test case.
 *
 * `/life` and `/empire` stay Linear for now (spec decision 8: replace in
 * place, one screen at a time, `/brain` first). Expect the join between
 * modes to look abrupt until they get the same pass — that is the cost
 * of a phased cutover, not a bug.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sys-cockpit hud-dotgrid">
      <span className="hud-scanlines" aria-hidden />
      {children}
    </div>
  );
}
