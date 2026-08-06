import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type TaskStatus, type Venture } from "@/lib/types";
import { findNextStepProject, isOpenWork, resolveVenture } from "@/lib/logic";
import { divisionHref } from "@/lib/references";
import Onboard from "@/components/Onboard";

export const dynamic = "force-dynamic";

/**
 * The onboarding questionnaire for one division.
 *
 * Built before the dashboard on purpose: Jay has eighteen divisions and
 * almost no money data, so a dashboard built first would have been eighteen
 * empty pages. This is what fills them, which makes it the feature rather
 * than the on-ramp to one.
 */
export default async function OnboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: ventures }, { data: projects }] = await Promise.all([
    supabase
      .from("ventures")
      .select(
        "id, name, pillar_id, stage, progress, one_liner, status, sort_order, external_system, external_url, plan, budget, monthly_cost, funding_route, profile, meta"
      ),
    supabase.from("projects").select("id, venture_id, meta"),
  ]);

  const venture = resolveVenture((ventures ?? []) as Venture[], id);
  // MAINFRAME is a pointer row: it is never onboarded and never asked
  // anything (locked decision A1). An unknown id lands in the same place.
  if (!venture) notFound();

  const project = findNextStepProject(
    (projects ?? []) as { id: string; venture_id: string | null; meta?: unknown }[],
    venture.id
  );

  // His previous next steps, so the question can show what is already there
  // rather than asking as though nothing was ever answered.
  let openNextSteps: { id: string; title: string; do_date: string | null }[] = [];
  if (project) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, do_date, status")
      .eq("project_id", project.id);
    openNextSteps = ((tasks ?? []) as {
      id: string;
      title: string;
      do_date: string | null;
      status: TaskStatus;
    }[])
      .filter(isOpenWork)
      .map((t) => ({ id: t.id, title: t.title, do_date: t.do_date }));
  }

  return (
    <Onboard
      venture={venture}
      home={divisionHref(venture.name)}
      nextStepProject={project}
      openNextSteps={openNextSteps}
    />
  );
}
