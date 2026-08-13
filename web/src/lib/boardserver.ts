/* ------------------------------------------------------------------ *
 * The parent board — one loader, two callers
 *
 * `/life` renders the standing board in full. The dashboard shows one
 * tile summarising it. Both need the same computed scores, and the moment
 * they each fetch their own is the moment they can disagree — the
 * dashboard saying Money is fine while the page it links to says it is
 * the weakest area, with no way to tell which is right.
 *
 * So the fetching lives here once, the same way `setupserver.ts` is
 * shared by `/setup` and the dashboard line. `reports.ts` stays pure and
 * measures nothing; this reads rows and hands them to the contracts that
 * already know how to judge them.
 * ------------------------------------------------------------------ */

import { createClient } from "./supabase/server";
import { toIso, type PersonRow } from "./logic";
import { bodyContract, moneyContract, peopleContract } from "./lifeos";
import { standingBoard, type AreaScore } from "./standing";
import { type CookedMealRow, fedState } from "./training";
import type { ParentReport } from "./parents";
import {
  bodyReport,
  empireParentReport,
  horizonReport,
  moneyReport,
  peopleReport,
  standingReport,
} from "./reports";
import {
  type DivisionRow,
  divisionsFrom,
  divisionsIn,
  empireShape,
  type EmpireShape,
} from "./empire";
import { EMPIRE_PARENTS } from "./parents";

export type LifeBoard = {
  reports: ParentReport[];
  /** The full standing board, so `/life` does not fetch it twice. */
  standing: AreaScore[];
  /** One report per EMPIRE parent, worst first. */
  empire: ParentReport[];
  /** The ratio the grouping exists to produce. */
  shape: EmpireShape;
};

export async function loadLifeBoard(todayIso: string = toIso(new Date())): Promise<LifeBoard> {
  const supabase = await createClient();

  const [
    { data: pillarRows },
    { data: peopleRows },
    { data: workoutRows },
    { data: healthRows },
    { data: journalRows },
    { data: vehicleRows },
    { data: debtRows },
    { data: cookedRows },
    { data: paymentRows },
    { data: goalRows },
    { data: ventureRows },
    { data: runRows },
  ] = await Promise.all([
    supabase.from("pillars").select("id, name, system"),
    supabase
      .from("people")
      .select("id, name, relationship, last_contact, cadence_days, birthday, pillar_id"),
    supabase.from("workouts").select("on_date"),
    supabase.from("health_days").select("on_date, ate_well").order("on_date", { ascending: false }).limit(14),
    supabase.from("journal").select("entry_date").order("entry_date", { ascending: false }).limit(40),
    supabase.from("vehicles").select("status, tax_due, mot_due, insurance_due, next_service"),
    supabase.from("debts").select("id, status, current_balance, recurring, meta"),
    supabase.from("meals").select("last_cooked_on, protein_g, estimates").not("last_cooked_on", "is", null),
    supabase.from("debt_payments").select("due_on, paid_on"),
    supabase.from("goals").select("target_date, status"),
    supabase.from("ventures").select("id, name, status, stage, one_liner, created_at, meta"),
    supabase.from("diagnostic_runs").select("subject_id, completed_at").not("completed_at", "is", null),
  ]);

  const pillars = (pillarRows ?? []) as { id: string; name: string; system: string }[];
  const pillarNameById = new Map(pillars.map((p) => [p.id, p.name]));
  const peopleWithArea = (peopleRows ?? []) as (PersonRow & { pillar_id: string | null })[];

  /* -- money -------------------------------------------------------- *
   *
   * Standing bills are excluded from both counts. A thing that cannot
   * close cannot be a closure, and counting one would make "debt free"
   * unreachable by construction. */
  const allDebts = (debtRows ?? []) as {
    id: string;
    status: string;
    current_balance: number | null;
    recurring: boolean | null;
    meta: unknown;
  }[];
  const closable = allDebts.filter((d) => !d.recurring);
  const openAccounts = closable.filter((d) => d.status === "active").length;
  const overduePayments = ((paymentRows ?? []) as { due_on: string; paid_on: string | null }[])
    .filter((p) => p.paid_on == null && p.due_on < todayIso).length;

  // The confirmation stamp is jsonb, so it is read defensively — a junk
  // value must not become a date the staleness test then reasons about.
  const lastConfirmed =
    closable
      .map((d) => {
        const m =
          typeof d.meta === "object" && d.meta !== null && !Array.isArray(d.meta)
            ? (d.meta as Record<string, unknown>)
            : {};
        const v = m.balance_confirmed_on;
        return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      })
      .filter((v): v is string => v != null)
      .sort()
      .at(-1) ?? null;

  const body = bodyContract({
    trainingDays: ((workoutRows ?? []) as { on_date: string }[]).map((w) => w.on_date),
    readinessBand: null,
    todayIso,
  });
  const money = moneyContract({
    debts: closable as { current_balance: number | null; status: string }[],
    missedPayments: overduePayments,
    debtFreeDate: null,
  });
  const people = peopleContract({ people: peopleWithArea, todayIso });

  const standing = standingBoard(
    pillars.filter((p) => p.system === "life").map((p) => ({ name: p.name, score: null })),
    {
      body,
      money,
      people: peopleWithArea,
      personArea: Object.fromEntries(
        peopleWithArea.map((p) => [
          p.id,
          p.pillar_id ? (pillarNameById.get(p.pillar_id) ?? null) : null,
        ])
      ),
      ateWell: ((healthRows ?? []) as { ate_well: boolean | null }[]).map((h) => h.ate_well),
      cookedDays: fedState((cookedRows ?? []) as CookedMealRow[], todayIso).cookedDays,
      journalDates: ((journalRows ?? []) as { entry_date: string }[]).map((j) => j.entry_date),
      vehicles: (
        (vehicleRows ?? []) as {
          status: string;
          tax_due: string | null;
          mot_due: string | null;
          insurance_due: string | null;
          next_service: string | null;
        }[]
      )
        // A SORNed vehicle has no MOT to hold, so asking it to score would
        // be the board inventing a failure out of a legal declaration.
        .filter((v) => v.status === "active")
        .map((v) => ({
          tax_due: v.tax_due,
          mot_due: v.mot_due,
          insurance_due: v.insurance_due,
          next_service: v.next_service ?? null,
        })),
      debtsTotal: closable.length,
      todayIso,
    }
  );

  // The person furthest past their cadence, named — a count is a statistic
  // and a name is a person, and only one of those gets you to phone them.
  const overdueList = peopleWithArea
    .filter((p) => p.cadence_days != null && p.last_contact != null)
    .map((p) => ({
      name: p.name,
      days: Math.round(
        (Date.parse(todayIso + "T00:00:00Z") - Date.parse(p.last_contact! + "T00:00:00Z")) /
          86_400_000
      ),
    }))
    .filter((p) => p.days > 0)
    .sort((a, b) => b.days - a.days);
  const tracked = peopleWithArea.filter((p) => p.cadence_days != null).length;

  /* -- the empire --------------------------------------------------- *
   *
   * A diagnostic run is the only per-division action the schema
   * timestamps, so it is what "touched" means here — the same definition
   * dormancy already uses, rather than a second one that disagrees. */
  const divisions = divisionsFrom((ventureRows ?? []) as DivisionRow[]);
  const lastRun = new Map<string, string>();
  for (const r of (runRows ?? []) as { subject_id: string; completed_at: string }[]) {
    const held = lastRun.get(r.subject_id);
    if (!held || r.completed_at > held) lastRun.set(r.subject_id, r.completed_at);
  }
  const ageOf = (id: string): number | null => {
    const at = lastRun.get(id);
    if (!at) return null;
    return Math.round(
      (Date.parse(todayIso + "T00:00:00Z") - Date.parse(at.slice(0, 10) + "T00:00:00Z")) /
        86_400_000
    );
  };

  const empire = EMPIRE_PARENTS.map((p) =>
    empireParentReport(
      p.id,
      p.name,
      divisionsIn(divisions, p.id).map((d) => ({
        name: d.name,
        live: d.live,
        lastTouchedDays: ageOf(d.id),
      }))
    )
  );

  return {
    standing,
    empire,
    shape: empireShape(divisions),
    reports: [
      standingReport(standing, todayIso),
      bodyReport(body, todayIso),
      moneyReport(money, todayIso, { openAccounts, lastConfirmed }),
      peopleReport(people, { tracked, worst: overdueList[0] ?? null }),
      horizonReport(
        (goalRows ?? []) as { target_date: string | null; status: string }[],
        todayIso
      ),
    ],
  };
}
