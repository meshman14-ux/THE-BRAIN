import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import {
  LIBRARY,
  SKILL_TREES,
  deriveState,
  hasPassed,
  masteryOf,
  nextTestIn,
  treeProgress,
  workingEdge,
} from "@/lib/hybrid";
import {
  attemptsFrom,
  profileFrom,
  type AthleteProfileRow,
  type SkillAttemptRow,
} from "@/lib/training";
import SkillTrees, { type TreeView } from "@/components/SkillTrees";
import HudPanel from "@/components/hud/HudPanel";

export const dynamic = "force-dynamic";

/**
 * The skill trees.
 *
 * Everything shown here is derived from `skill_attempts` on every load —
 * mastery is never stored, for the same reason venture dormancy is never
 * stored: a flag written once and never revisited is a claim that quietly
 * stops being true.
 */
export default async function SkillsPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: attempts }, { data: profileRow }] = await Promise.all([
    supabase.from("skill_attempts").select("node_id, on_date, amount, strict"),
    supabase
      .from("athlete_profile")
      .select("bodyweight_kg, sessions_per_week, equipment, focus_skills, landmarks")
      .maybeSingle(),
  ]);

  const allAttempts = attemptsFrom((attempts ?? []) as SkillAttemptRow[]);
  const profile = profileFrom((profileRow ?? null) as AthleteProfileRow | null);

  const views: TreeView[] = SKILL_TREES.map((tree) => {
    const state = deriveState(tree, allAttempts);
    const progress = treeProgress(tree, state);
    const edge = workingEdge(tree, state);
    return {
      tree,
      owned: progress.owned,
      of: progress.of,
      percent: progress.percent,
      edgeIds: edge.map((n) => n.id),
      focused: profile.focus_skills.includes(tree.id),
      nodes: tree.nodes.map((node) => {
        const passed = hasPassed(allAttempts, node);
        return {
          node,
          mastery: masteryOf(state, node.id),
          qualifying: passed.qualifying,
          needed: passed.needed,
          exerciseName: LIBRARY.get(node.exercise_id)?.name ?? node.exercise_id,
        };
      }),
    };
  });

  // The test-in question, asked only while it is still worth asking.
  const attemptedIds = new Set(allAttempts.map((a) => a.node_id));
  const untested = SKILL_TREES.map((tree) => ({
    tree,
    next: nextTestIn(tree, deriveState(tree, allAttempts), attemptedIds),
  })).filter((t) => t.next != null);

  const totalOwned = views.reduce((n, v) => n + v.owned, 0);
  const focusCount = views.filter((v) => v.focused).length;

  return (
    <div className="grid gap-5 max-w-[820px]">
      <header>
        <p className="label">Training · skills</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">
          Four trees, {totalOwned} rungs owned
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[66ch]">
          A tree is a graph, not a ladder — real progressions converge, so a
          rung names everything it needs rather than pretending there is one
          order. Mastery is worked out from your attempt log every time this
          page loads; nothing here can be ticked by hand.
        </p>
      </header>

      {/* -- test-in ---------------------------------------------------- */}
      {attemptedIds.size === 0 && untested.length > 0 && (
        <HudPanel title="◈ Test in" hint="so an owned skill is not re-climbed">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            You already own some of this. Rather than starting every tree at
            the bottom, log an attempt at the hardest rung you can actually
            hold — the tree positions itself from the evidence. It does not
            skip: a gap further down still surfaces, because a rung is only
            passed when it is proved.
          </p>
          <div className="grid gap-1.5 mt-3">
            {untested.map(({ tree, next }) => (
              <p key={tree.id} className="text-[0.78rem]">
                <span className="font-medium">{tree.name}</span>
                <span className="text-[var(--muted)]">
                  {" "}
                  — start at {next!.name}
                  {next!.standard.hold_s != null
                    ? ` (${next!.standard.hold_s}s)`
                    : ` (${next!.standard.reps} reps)`}
                </span>
              </p>
            ))}
          </div>
        </HudPanel>
      )}

      {focusCount > 2 && (
        <p className="text-[0.78rem]" style={{ color: "var(--warn)" }}>
          {focusCount} skills in focus at once. Two is about the ceiling —
          beyond that each gets too little practice to move, and none of them
          finishes.
        </p>
      )}

      <SkillTrees trees={views} today={today} />

      <p className="text-[0.74rem] text-[var(--faint)]">
        <Link
          href="/life/health/train"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          ← Today&apos;s session
        </Link>
        {"  ·  "}
        <Link
          href="/life/health"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          Health
        </Link>
      </p>
    </div>
  );
}
