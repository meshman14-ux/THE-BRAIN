import { createClient } from "@/lib/supabase/server";
import { type Pillar, type Task } from "@/lib/types";
import { toIso } from "@/lib/logic";
import {
  connectionState,
  scheduledTasks,
  type CalendarLink,
} from "@/lib/calendar";
import { isConfigured, missingConfig } from "@/lib/google";
import { loadIntegration } from "@/lib/calendar-server";
import PlanTabs from "@/components/PlanTabs";
import Calendar from "@/components/Calendar";

export const dynamic = "force-dynamic";

/**
 * The calendar — THE BRAIN's side of the two-way sync.
 *
 * `/week` is still where the week gets planned. This page is where the
 * scheduling *leaves the building*: what is synced, what moved, and the
 * conflicts waiting on a decision.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: tasks }, { data: links }, { data: pillars }, integration] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, notes, pillar_id, project_id, do_date, due_date, priority, status, meta"),
      supabase
        .from("calendar_sync")
        .select(
          "id, task_id, google_event_id, google_cal_id, etag, event_start, event_end, last_pushed_at, last_pulled_at, conflict, conflict_note, meta"
        ),
      supabase.from("pillars").select("id, name, emoji, system"),
      loadIntegration(supabase),
    ]);

  const allTasks = (tasks ?? []) as Task[];
  const allLinks = (links ?? []) as CalendarLink[];
  const allPillars = (pillars ?? []) as Pick<Pillar, "id" | "name" | "emoji" | "system">[];

  const state = connectionState({
    configured: isConfigured(),
    hasIntegration: integration != null,
    calendarId: integration?.calendar_id ?? null,
    lastError: integration?.last_error ?? null,
  });

  const scheduled = scheduledTasks(allTasks, today);

  return (
    <>
      {/* Calendar is the fourth PLANNING view, not a neighbour of them.
          It answers "what is already fixed" where Day answers "when, this
          hour" — same question, different angle, so it belongs in the
          same strip rather than in its own nav slot. */}
      <PlanTabs active="calendar" />
      <Calendar
      state={state}
      missing={missingConfig()}
      calendarName={integration?.calendar_name ?? null}
      lastSyncAt={integration?.last_sync_at ?? null}
      lastError={integration?.last_error ?? null}
      today={today}
      tasks={scheduled}
      links={allLinks}
      pillars={allPillars}
      notice={typeof sp.connected === "string" ? sp.connected : null}
      error={typeof sp.error === "string" ? sp.error : null}
      />
    </>
  );
}
