import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/ui";
import SurfaceTabs from "@/components/SurfaceTabs";
import { ASK_VIEWS } from "@/lib/surfaces";

export const dynamic = "force-dynamic";

/**
 * The diagnostic picker — every venture and every life area, one screen.
 *
 * Worst-first once scored, unscored surfaced plainly ("not yet triaged"
 * is a state, not an apology), and the two worst scores carry a
 * deep-dive nudge. Nudge, never gate: it is Jay's system, everything is
 * always openable — the picker's job is only to point.
 */

type Row = {
  id: string;
  name: string;
  system: "venture" | "area";
  sub: string;
  score: number | null;
  answered: number | null;
  ofTotal: number | null;
  hasDeep: boolean;
};

export default async function DiagnosePage() {
  const supabase = await createClient();
  const [{ data: ventures }, { data: pillars }, { data: runs }] =
    await Promise.all([
      supabase
        .from("ventures")
        .select("id, name, status")
        .order("name"),
      supabase
        .from("pillars")
        .select("id, name, emoji, system, active")
        .eq("system", "life")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("diagnostic_runs")
        .select("subject_type, subject_id, kind, score, answered, of_total, completed_at")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false }),
    ]);

  const latestTriage = new Map<string, { score: number | null; answered: number | null; ofTotal: number | null }>();
  const hasDeep = new Set<string>();
  for (const r of runs ?? []) {
    const k = `${r.subject_type}:${r.subject_id}`;
    if (r.kind === "deep") hasDeep.add(k);
    else if (!latestTriage.has(k))
      latestTriage.set(k, {
        score: r.score,
        answered: r.answered,
        ofTotal: r.of_total,
      });
  }

  const row = (
    id: string,
    name: string,
    system: "venture" | "area",
    sub: string
  ): Row => {
    const t = latestTriage.get(`${system}:${id}`);
    return {
      id,
      name,
      system,
      sub,
      score: t?.score ?? null,
      answered: t?.answered ?? null,
      ofTotal: t?.ofTotal ?? null,
      hasDeep: hasDeep.has(`${system}:${id}`),
    };
  };

  const ventureRows = (ventures ?? [])
    .filter((v) => v.name !== "MAINFRAME") // separate system; a pointer, never a subject
    .map((v) => row(v.id, v.name, "venture", v.status));
  const areaRows = (pillars ?? []).map((p) =>
    row(p.id, `${p.emoji ?? ""} ${p.name}`.trim(), "area", "life area")
  );

  // Worst-first among the scored; unscored keep their register order below.
  const sortRows = (rows: Row[]) =>
    [...rows].sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return a.score - b.score;
    });

  const scoredVentures = ventureRows.filter((r) => r.score != null);
  const nudge = new Set(
    sortRows(scoredVentures)
      .slice(0, 2)
      .map((r) => r.id)
  );

  const section = (title: string, hint: string, rows: Row[]) => (
    <Panel title={title} hint={hint}>
      <div className="grid gap-1.5">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 card-hover"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[0.88rem] font-semibold truncate">{r.name}</p>
              <p className="text-[0.68rem] text-[var(--faint)] mt-0.5">
                {r.score != null ? (
                  <span className="mono">
                    health {r.score} · {r.answered} of {r.ofTotal} signals
                    {r.hasDeep ? " · deep-dived" : ""}
                  </span>
                ) : (
                  <>not yet triaged · {r.sub}</>
                )}
              </p>
            </div>
            {r.score != null && nudge.has(r.id) && (
              <span
                className="text-[0.64rem] font-bold uppercase tracking-[0.06em] shrink-0"
                style={{ color: "var(--warn)" }}
              >
                deep dive suggested
              </span>
            )}
            <Link
              href={`/diagnose/${r.system}/${r.id}`}
              className="chip no-underline shrink-0"
            >
              {r.score != null ? "Re-triage" : "Triage →"}
            </Link>
            {r.score != null && r.system === "venture" && (
              <Link
                href={`/diagnose/${r.system}/${r.id}?kind=deep`}
                className="chip no-underline shrink-0"
              >
                Go deeper
              </Link>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );

  return (
    <div className="max-w-[760px] mx-auto grid gap-5">
      <SurfaceTabs label="Ask" views={ASK_VIEWS} active="diagnose" />
      <header>
        <p className="label">EMPIRE_OS + LIFE_OS</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Diagnose</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Pick anything. Triage is ten questions and about five minutes —
          every answer saves as you give it, skipping writes nothing, and
          the score arrives with its basis attached. The worst scores earn
          a deep-dive nudge; nothing is ever locked.
        </p>
      </header>
      {section(
        "⬢ Ventures",
        "worst-first once scored · MAINFRAME excluded by design",
        [...sortRows(ventureRows.filter((r) => r.score != null)), ...ventureRows.filter((r) => r.score == null)]
      )}
      {section("☼ Life areas", "the same triage, pointed inward", [
        ...sortRows(areaRows.filter((r) => r.score != null)),
        ...areaRows.filter((r) => r.score == null),
      ])}
    </div>
  );
}
