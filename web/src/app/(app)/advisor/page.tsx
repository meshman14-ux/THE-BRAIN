import { createClient } from "@/lib/supabase/server";
import {
  type Debt,
  type Habit,
  type HabitLog,
  type Note,
  type Pillar,
  type Task,
  type Venture,
} from "@/lib/types";
import { splitDebts } from "@/lib/season";
import {
  areasFor,
  debtTotal,
  greetingFor,
  habitsDoneToday,
  onboardingProgress,
  pickThree,
  toIso,
  venturesWithNextStep,
  watchtowerAlerts,
} from "@/lib/logic";
import { belongsOnCalendar, type CalendarLink } from "@/lib/calendar";
import {
  advisorState,
  briefSources,
  morningBrief,
  suggestedQuestions,
} from "@/lib/advisor";
import { isConfigured, missingConfig } from "@/lib/claude";
import Advisor from "@/components/Advisor";

export const dynamic = "force-dynamic";

/**
 * The advisor — locked decision 6.
 *
 * The brief at the top is assembled here from his own data and costs
 * nothing; the ask box below it is the only part that needs a model. That
 * split is deliberate: the most useful half of this page works with no API
 * key at all, and the half that can be wrong about facts is the half that
 * has to cite them.
 */
export default async function AdvisorPage() {
  const supabase = await createClient();
  const now = new Date();
  const today = toIso(now);

  const [
    { data: notes },
    { data: tasks },
    { data: pillars },
    { data: people },
    { data: ventures },
    { data: projects },
    { data: habits },
    { data: habitLogs },
    { data: debts },
    { data: links },
    { data: vehicles },
  ] = await Promise.all([
    supabase.from("notes").select("id, title, body, kind, tags, starred, pillar_id, meta"),
    supabase
      .from("tasks")
      .select("id, title, notes, pillar_id, project_id, do_date, due_date, priority, status"),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active, score, status_line, focus_week")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("people").select("id, name, last_contact, cadence_days, birthday"),
    supabase
      .from("ventures")
      .select("id, name, stage, status, progress, external_system, one_liner, budget, monthly_cost, funding_route, plan, meta"),
    supabase.from("projects").select("id, venture_id, status"),
    supabase.from("habits").select("id, name").eq("active", true),
    supabase.from("habit_logs").select("habit_id, done_on"),
    supabase.from("debts").select("id, creditor, kind, current_balance, status, plan_amount, plan_frequency, sort_order, recurring"),
    supabase.from("calendar_sync").select("id, task_id, conflict"),
    supabase
      .from("vehicles")
      .select("id, name, status, tax_due, mot_due, insurance_due, next_service"),
  ]);

  const allNotes = (notes ?? []) as Note[];
  const allTasks = (tasks ?? []) as Task[];
  const allPillars = (pillars ?? []) as Pillar[];
  const allVentures = (ventures ?? []) as Venture[];
  const allProjects = (projects ?? []) as { id: string; venture_id: string | null }[];
  const allHabits = (habits ?? []) as Habit[];
  const allLogs = (habitLogs ?? []) as HabitLog[];
  const allLinks = (links ?? []) as Pick<CalendarLink, "id" | "task_id" | "conflict">[];

  const alerts = watchtowerAlerts({
    tasks: allTasks,
    people: (people ?? []) as {
      id: string;
      name: string;
      last_contact: string | null;
      cadence_days: number | null;
      birthday: string | null;
    }[],
    ventures: allVentures,
    pillars: allPillars,
    vehicles: (vehicles ?? []) as {
      id: string;
      name: string;
      status: string;
      tax_due: string | null;
      mot_due: string | null;
      insurance_due: string | null;
      next_service: string | null;
    }[],
    todayIso: today,
  });

  // Only what can actually reach zero. A standing bill in the advisor's
  // headline would make "clear the debt" a sentence that never comes true.
  const total = debtTotal(splitDebts((debts ?? []) as Debt[]).closing);
  const scheduled = allTasks.filter((t) => belongsOnCalendar(t, today));
  const mapped = new Set(allLinks.map((l) => l.task_id).filter(Boolean));

  const brief = morningBrief({
    todayIso: today,
    greeting: greetingFor(now.getHours()).word,
    alerts,
    tasksToday: pickThree(allTasks, today),
    habitsDone: habitsDoneToday(allHabits, allLogs, today),
    debtKnown: total.known,
    debtComplete: total.complete,
    onboarded: onboardingProgress(
      allVentures,
      venturesWithNextStep(allProjects, allTasks)
    ),
    conflicts: allLinks.filter((l) => l.conflict).length,
    unsynced: scheduled.filter((t) => !mapped.has(t.id)).length,
  });

  // The brief may never draw on a principle — it arrives unasked, and
  // PRINCIPLES_NEVER_PUSH covers exactly that. The ask box below may.
  const pushable = briefSources(allNotes);

  return (
    <Advisor
      state={advisorState({ configured: isConfigured(), lastError: null })}
      missing={missingConfig()}
      brief={brief}
      noteCount={allNotes.length}
      pushableCount={pushable.length}
      principleCount={allNotes.filter((n) => n.kind === "principle").length}
      suggestions={suggestedQuestions({
        noteCount: allNotes.length,
        hasPrinciples: allNotes.some((n) => n.kind === "principle"),
        ventures: allVentures,
        areas: areasFor(allPillars, "empire"),
      })}
    />
  );
}
