import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DiagnosticRun from "@/components/DiagnosticRun";
import type { DiagAnswers } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

/**
 * A diagnostic run over one subject. The server resolves the subject and
 * any open (incomplete) run of the requested kind, so the client runner
 * resumes at the first unanswered question rather than re-asking.
 */
export default async function DiagnoseRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { type, id } = await params;
  const { kind: kindParam } = await searchParams;
  if (type !== "venture" && type !== "area") notFound();
  const subjectType = type as "venture" | "area";
  const kind = kindParam === "deep" && subjectType === "venture" ? "deep" : "triage";

  const supabase = await createClient();

  let name: string | null = null;
  let pillarId: string | null = null;
  let home = "/diagnose";
  if (subjectType === "venture") {
    const { data: v } = await supabase
      .from("ventures")
      .select("id, name, pillar_id")
      .eq("id", id)
      .maybeSingle();
    if (!v || v.name === "MAINFRAME") notFound(); // separate system, never a subject
    name = v.name;
    pillarId = v.pillar_id ?? null;
    home = `/empire/${id}`;
  } else {
    const { data: p } = await supabase
      .from("pillars")
      .select("id, name, emoji")
      .eq("id", id)
      .maybeSingle();
    if (!p) notFound();
    name = `${p.emoji ?? ""} ${p.name}`.trim();
    pillarId = p.id;
    home = "/life";
  }

  const { data: open } = await supabase
    .from("diagnostic_runs")
    .select("id, answers")
    .eq("subject_type", subjectType)
    .eq("subject_id", id)
    .eq("kind", kind)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-[620px] mx-auto">
      <header className="mb-5">
        <p className="label">{kind === "deep" ? "Deep dive" : "Triage"}</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">{name}</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          {kind === "deep"
            ? "Operations, forensics, risk, and the LIFE cross-map — about twenty questions, resumable forever. Answers enrich the record; re-triage is what moves the score."
            : "Ten questions, about five minutes. Estimates are welcome, skips are honest, and the score arrives with its basis attached."}
        </p>
      </header>
      <DiagnosticRun
        subjectType={subjectType}
        subjectId={id}
        subjectName={name!}
        pillarId={pillarId}
        kind={kind}
        runId={open?.id ?? null}
        initialAnswers={(open?.answers ?? {}) as DiagAnswers}
        home={home}
      />
    </div>
  );
}
