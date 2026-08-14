/* ------------------------------------------------------------------ *
 * Setup — the queries
 *
 * Two screens need the same facts: the setup page itself, and the single
 * line the dashboard carries while anything is missing. One loader rather
 * than two copies that drift, because the day they disagree is the day the
 * dashboard says "all done" over a page listing eight gaps.
 *
 * The counting rules live here rather than in `setup.ts` for the usual
 * reason: `setup.ts` is pure and tested, this talks to a database and is
 * kept dumb enough that there is nothing in it worth testing.
 * ------------------------------------------------------------------ */

import { createClient } from "./supabase/server";
import { TYPED_AREAS } from "./standing";
import { canRecord } from "./metrics";
import type { SetupFacts } from "./setup";

export async function loadSetupFacts(): Promise<SetupFacts> {
  const supabase = await createClient();

  const [
    { data: debts },
    { data: vehicles },
    { count: workoutCount },
    { count: healthDayCount },
    { data: journal },
    { data: habits },
    { data: tasks },
    { data: pillars },
    { count: cookedMealCount },
    { count: reviewCount },
    { data: metrics },
    { data: metricReadings },
  ] = await Promise.all([
    supabase.from("debts").select("id, creditor, status, current_balance, recurring"),
    supabase
      .from("vehicles")
      .select("id, name, registration, status, tax_due, mot_due, insurance_due, next_service"),
    supabase.from("workouts").select("id", { count: "exact", head: true }),
    supabase.from("health_days").select("on_date", { count: "exact", head: true }),
    supabase.from("journal").select("mood, energy"),
    supabase.from("habits").select("id, pillar_id, keystone").eq("active", true),
    supabase
      .from("tasks")
      .select("id, pillar_id, status")
      .in("status", ["open", "doing", "waiting"]),
    supabase.from("pillars").select("id, name, score"),
    supabase
      .from("meals")
      .select("id", { count: "exact", head: true })
      .not("last_cooked_on", "is", null),
    supabase.from("reviews").select("id", { count: "exact", head: true }),
    supabase.from("metrics").select("id, name"),
    supabase.from("metric_readings").select("metric_id"),
  ]);

  const keystone = (
    (habits ?? []) as { id: string; pillar_id: string | null; keystone: boolean }[]
  ).find((h) => h.keystone);
  const keystonePillarId = keystone?.pillar_id ?? null;
  const pillarRows = (pillars ?? []) as { id: string; name: string; score: number | null }[];

  return {
    // A standing bill cannot close, so it has no balance worth confirming
    // and no place on a list about finishing things.
    debts: (
      (debts ?? []) as {
        id: string;
        creditor: string;
        status: string;
        current_balance: number | null;
        recurring: boolean | null;
      }[]
    )
      .filter((d) => !d.recurring)
      .map(({ id, creditor, status, current_balance }) => ({
        id,
        creditor,
        status,
        current_balance,
      })),
    vehicles: (vehicles ?? []) as SetupFacts["vehicles"],
    workoutCount: workoutCount ?? 0,
    healthDayCount: healthDayCount ?? 0,
    // An entry that recorded neither number is not evidence that the tank
    // was measured — the same rule the band derivation follows.
    bandedJournalCount: (
      (journal ?? []) as { mood: number | null; energy: number | null }[]
    ).filter((j) => j.mood != null || j.energy != null).length,
    keystoneTaskCount:
      keystonePillarId == null
        ? 0
        : ((tasks ?? []) as { pillar_id: string | null }[]).filter(
            (t) => t.pillar_id === keystonePillarId
          ).length,
    keystonePillarName: pillarRows.find((p) => p.id === keystonePillarId)?.name ?? null,
    cookedMealCount: cookedMealCount ?? 0,
    reviewCount: reviewCount ?? 0,
    // Seven of the eight areas compute themselves. Only the typed one can
    // be missing in a way a person can actually fix.
    unscoredTypedAreas: pillarRows
      .filter((p) => (TYPED_AREAS as readonly string[]).includes(p.name) && p.score == null)
      .map((p) => p.name),
    // A derived metric is deliberately excluded: `canRecord` is false for
    // it, the board refuses the entry box, and asking here for something
    // the system will not accept is how a setup list loses its authority.
    unrecordedMetrics: (() => {
      const read = new Set(
        ((metricReadings ?? []) as { metric_id: string }[]).map((r) => r.metric_id)
      );
      return ((metrics ?? []) as { id: string; name: string }[])
        .filter((m) => canRecord(m) && !read.has(m.id))
        .map((m) => m.name);
    })(),
  };
}
