/* ------------------------------------------------------------------ *
 * THE COG — the data layer
 *
 * The impure half of the adapter: it talks to Supabase, and it is the only
 * file in THE COG that does. `cogstate.ts` holds the pure mapping (and is
 * therefore fully tested); this holds the queries, which are not worth
 * mocking a database to test and are kept deliberately dumb so that there
 * is nothing in them to test.
 *
 * Everything here READS. The single write path — `tasks.do_date`,
 * `tasks.priority`, `tasks.meta.cog`, on an accepted verdict only — lives
 * in the feedback route where it can be seen next to the concurrency check
 * that guards it.
 * ------------------------------------------------------------------ */

import { createClient } from "./supabase/server";
import { toIso } from "./logic";
import { seasonKind, type Season } from "./season";
import { collectFinishes, monthsCounted } from "./finishes";
import {
  type CogHealthRow,
  type CogIdentityRow,
  type CogJournalRow,
  type CogTaskRow,
  buildState,
  busyFromPlanner,
  completionRatio,
  completionsByPillar,
  deriveBands,
  eveningStreak,
  profileFrom,
  tasksFrom,
  yesterdayOf,
} from "./cogstate";
import { type IdentityProfile, type MomentumState, resolveConfig, type CogConfig } from "./cog";

/** Everything one advise() call needs, fetched once. */
export type CogBundle = {
  state: MomentumState;
  profile: IdentityProfile;
  config: CogConfig;
};

/**
 * Build today's momentum state from THE BRAIN.
 *
 * `now` is INJECTED, never read from a clock in here, because the engine's
 * determinism guarantee is only worth anything if the state that feeds it
 * is reproducible too — a persisted `cog_states` row replayed through
 * `advise()` must give the same answer it gave on the day.
 */
export async function loadCogBundle(
  todayIso: string = toIso(new Date()),
  nowIso?: string
): Promise<CogBundle> {
  const supabase = await createClient();
  const yesterday = yesterdayOf(todayIso);
  const windowStart = new Date(Date.parse(todayIso + "T00:00:00Z") - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: taskRows },
    { data: yesterdayRows },
    { data: journalRows },
    { data: healthRows },
    { data: seasons },
    { data: doneTaskRows },
    { data: doneRunRows },
    { data: recordedRows },
    { data: habitRows },
    { data: habitLogRows },
    { data: opportunityRows },
    { data: ventureRows },
    { count: inboxCount },
    { data: checkinRow },
    { data: identityRow },
    { data: configRow },
    { data: rejectedRows },
    { data: plannerRow },
    { data: completedRows },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, do_date, due_date, priority, energy, pillar_id, project_id, duration_min, created_at, meta")
      .in("status", ["open", "doing", "waiting"]),
    supabase.from("tasks").select("status").eq("do_date", yesterday),
    supabase
      .from("journal")
      .select("entry_date, mood, energy")
      .gte("entry_date", windowStart)
      .order("entry_date", { ascending: false }),
    supabase
      .from("health_days")
      .select("on_date, sleep_hours")
      .gte("on_date", windowStart)
      .order("on_date", { ascending: false }),
    supabase.from("seasons").select("id, kind, started_on, ended_on, note"),
    // A finish comes from three places, and the momentum test is only
    // honest if COG counts the same three the dashboard counts.
    supabase.from("tasks").select("id, title, priority, status, completed_at").eq("status", "done"),
    supabase
      .from("diagnostic_runs")
      .select("id, kind, completed_at, subject_id")
      .not("completed_at", "is", null),
    supabase.from("finishes").select("id, title, happened_on, kind"),
    supabase.from("habits").select("id, name, pillar_id, keystone").eq("active", true),
    supabase.from("habit_logs").select("habit_id, done_on").gte("done_on", yesterday),
    supabase.from("opportunities").select("id, title, next_step, next_step_date").eq("next_step_date", todayIso),
    supabase.from("ventures").select("id, status"),
    supabase.from("inbox").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("cog_checkins").select("energy_band, sleep_band").eq("date", todayIso).maybeSingle(),
    supabase
      .from("cog_identity")
      .select("keystone_habit_id, deep_work_start, deep_work_end, statements, alignment_window_days")
      .maybeSingle(),
    supabase.from("cog_config").select("config").eq("id", "default").maybeSingle(),
    supabase.from("cog_feedback").select("id").eq("verdict", "rejected").gte("created_at", `${todayIso}T00:00:00Z`),
    supabase.from("journal").select("meta").eq("entry_date", todayIso).maybeSingle(),
    supabase
      .from("tasks")
      .select("pillar_id, completed_at")
      .eq("status", "done")
      .gte("completed_at", `${windowStart}T00:00:00Z`),
  ]);

  /* -- the keystone -------------------------------------------------- *
   *
   * One habit is marked keystone (LIFE_OS: habits form one at a time), and
   * a task under ITS PILLAR counts as supporting it. Coarser than tagging
   * tasks individually, and deliberately so — a tag is a manual entry, and
   * a manual entry is a thing that stops happening in March. */
  const keystone = (habitRows ?? []).find(
    (h) => (h as { keystone?: boolean }).keystone === true
  ) as { id: string; pillar_id: string | null } | undefined;
  const keystonePillarId = keystone?.pillar_id ?? null;

  const logs = (habitLogRows ?? []) as { habit_id: string; done_on: string }[];
  const keystoneDoneToday =
    keystone != null && logs.some((l) => l.habit_id === keystone.id && l.done_on === todayIso);
  const keystoneHitYesterday =
    keystone == null
      ? null // no keystone declared is unmeasured, not a miss
      : logs.some((l) => l.habit_id === keystone.id && l.done_on === yesterday);

  /* -- the empire ---------------------------------------------------- *
   *
   * A task earns the flat bonus by being the next step of an opportunity
   * that lands today, matched on the opportunity's own words. Loose, but
   * the alternative is another foreign key nobody maintains. */
  const opportunities = (opportunityRows ?? []) as { title: string; next_step: string | null }[];
  const empireTaskIds = new Set<string>();
  for (const t of (taskRows ?? []) as CogTaskRow[]) {
    const title = t.title.toLowerCase();
    if (
      opportunities.some(
        (o) =>
          (o.next_step != null && o.next_step.length > 6 && title.includes(o.next_step.toLowerCase())) ||
          (o.title.length > 4 && title.includes(o.title.toLowerCase()))
      )
    ) {
      empireTaskIds.add(t.id);
    }
  }

  const tasks = tasksFrom((taskRows ?? []) as CogTaskRow[], todayIso, {
    keystonePillarId,
    empireTaskIds,
  });

  const bands = deriveBands({
    checkin: checkinRow
      ? {
          energyBand: (checkinRow as { energy_band: number }).energy_band as 1 | 2 | 3 | 4 | 5,
          sleepBand: ((checkinRow as { sleep_band: number | null }).sleep_band ?? null) as
            | 1 | 2 | 3 | 4 | 5 | null,
        }
      : null,
    journal: (journalRows ?? []) as CogJournalRow[],
    health: (healthRows ?? []) as CogHealthRow[],
    todayIso,
  });

  // FB-3: Google free/busy is not wired yet, so the day-planner's pinned
  // hours stand in — a weaker signal (where he MEANT to work, not where he
  // is committed), and the slot it produces says `planner` so the UI can.
  const calendar = busyFromPlanner(
    (plannerRow as { meta?: { hours?: unknown } } | null)?.meta?.hours,
    todayIso
  );

  const tallies = monthsCounted(
    collectFinishes(
      (doneTaskRows ?? []) as { id: string; title: string; priority: string; status: string; completed_at: string | null }[],
      ((doneRunRows ?? []) as { id: string; kind: string; completed_at: string | null; subject_id: string }[]).map(
        (r) => ({ ...r, subject_name: null })
      ),
      (recordedRows ?? []) as { id: string; title: string; happened_on: string; kind: string }[]
    ),
    todayIso
  );
  const settled = tallies.filter((t) => !t.current);
  const finishesRate =
    settled.length < 3 ? null : settled.filter((t) => t.counted).length / settled.length;

  const season: Season["kind"] = seasonKind((seasons ?? []) as Season[]);

  const state = buildState({
    date: todayIso,
    now: nowIso ?? new Date().toISOString().slice(0, 19),
    season,
    tasks,
    bands,
    calendar,
    yesterday: {
      completionRatio: completionRatio((yesterdayRows ?? []) as { status: never }[]),
      keystoneHit: keystoneHitYesterday,
    },
    finishesRate,
    empire: {
      dormantVentures: ((ventureRows ?? []) as { status: string }[]).filter(
        (v) => v.status === "dormant" || v.status === "paused"
      ).length,
      opportunitiesDueToday: opportunities.length,
    },
    counters: {
      inboxCount: inboxCount ?? 0,
      pulsesRejectedToday: (rejectedRows ?? []).length,
      checkinStreakDays: eveningStreak(
        ((journalRows ?? []) as CogJournalRow[]).map((j) => j.entry_date),
        todayIso
      ),
      keystoneDoneToday,
    },
  });

  const profile = profileFrom(
    (identityRow ?? null) as CogIdentityRow | null,
    keystonePillarId,
    completionsByPillar(
      (completedRows ?? []) as { pillar_id: string | null; completed_at: string | null }[],
      todayIso,
      (identityRow as CogIdentityRow | null)?.alignment_window_days ?? 7
    )
  );

  const config = resolveConfig(
    (configRow as { config?: Partial<CogConfig> } | null)?.config,
    process.env as Record<string, string | undefined>
  );

  return { state, profile, config };
}
