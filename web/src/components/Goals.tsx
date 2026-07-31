"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Goal, Pillar, Project, Task } from "@/lib/types";
import {
  goalRollup,
  isLive,
  projectsForGoal,
  projectProgress,
  sortGoals,
  daysUntil,
  clampPercent,
} from "@/lib/logic";

/** Tasks are carried only for progress maths — id, parent and status is all it takes. */
type TaskRef = { id: string; project_id: string | null; status: Task["status"] };

type Props = {
  goals: Goal[];
  projects: Project[];
  tasks: TaskRef[];
  pillars: Pillar[];
  today: string;
};

export default function Goals({ goals, projects, tasks, pillars, today }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState("");
  const [newGoalPillar, setNewGoalPillar] = useState("");
  const [newGoalDate, setNewGoalDate] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const pillarById = Object.fromEntries(pillars.map((p) => [p.id, p]));
  const tasksFor = (projectId: string) =>
    tasks.filter((t) => t.project_id === projectId);

  const live = goals.filter(isLive);
  const ordered = sortGoals(live, today);
  const looseProjects = projectsForGoal(projects.filter(isLive), null);

  async function run(key: string, fn: () => Promise<{ error: unknown }>) {
    setBusy(key);
    setErr("");
    const { error } = await fn();
    setBusy(null);
    if (error) {
      setErr(error instanceof Error ? error.message : String(error));
      return;
    }
    router.refresh();
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const title = newGoal.trim();
    if (!title) return;
    await run("new-goal", async () =>
      supabase.from("goals").insert({
        title,
        pillar_id: newGoalPillar || null,
        target_date: newGoalDate || null,
      })
    );
    setNewGoal("");
    setNewGoalDate("");
    setAdding(false);
  }

  return (
    <div className="grid gap-9">
      <header>
        <p className="label">Command centre</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-[1.7rem] font-semibold mt-1.5">Goals</h1>
          <button className="btn" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "New goal"}
          </button>
        </div>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-[62ch] leading-relaxed">
          A goal is something that finishes. Projects hang off it, tasks hang off
          them — but none of that is required. A goal with no projects is still a
          goal, and a project with no goal is still work.
        </p>
      </header>

      {adding && (
        <form onSubmit={addGoal} className="card p-4 grid gap-3">
          <input
            className="input"
            autoFocus
            placeholder="What does finished look like?"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap">
            <select
              className="input flex-1 min-w-[160px]"
              value={newGoalPillar}
              onChange={(e) => setNewGoalPillar(e.target.value)}
            >
              <option value="">No area</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input flex-1 min-w-[160px]"
              value={newGoalDate}
              onChange={(e) => setNewGoalDate(e.target.value)}
            />
            <button className="btn" disabled={!newGoal.trim() || busy === "new-goal"}>
              {busy === "new-goal" ? "Adding…" : "Add goal"}
            </button>
          </div>
        </form>
      )}

      {err && (
        <p
          className="card px-4 py-3 text-sm"
          style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
        >
          {err}
        </p>
      )}

      {ordered.length === 0 && !adding && (
        <p className="card px-4 py-3.5 text-sm text-[var(--faint)]">
          No goals yet. Areas hold a standard forever; goals are the things that
          finish. Add the one you would actually be annoyed to miss.
        </p>
      )}

      <div className="grid gap-4">
        {ordered.map((g) => {
          const r = goalRollup(g, projects, tasksFor, today);
          const pillar = g.pillar_id ? pillarById[g.pillar_id] : null;
          const days = daysUntil(g.target_date, today);
          const open = openGoal === g.id;
          return (
            <section
              key={g.id}
              className={`card p-4 grid gap-3 ${
                pillar ? (pillar.system === "life" ? "sys-life" : "sys-empire") : ""
              }`}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[1.05rem] font-semibold">{g.title}</h2>
                    {r.overdue && (
                      <span className="chip" style={{ color: "var(--bad)" }}>
                        overdue
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--faint)] mt-1 flex items-center gap-2 flex-wrap">
                    {pillar ? (
                      <Link
                        href={`/pillar/${pillar.id}`}
                        className="no-underline text-[var(--muted)]"
                      >
                        {pillar.emoji} {pillar.name}
                      </Link>
                    ) : (
                      <span>No area</span>
                    )}
                    {g.target_date && (
                      <span className="mono">
                        {g.target_date}
                        {days != null &&
                          ` · ${
                            days === 0
                              ? "today"
                              : days > 0
                                ? `${days}d left`
                                : `${Math.abs(days)}d late`
                          }`}
                      </span>
                    )}
                  </p>
                </div>
                <ProgressDial stated={r.stated} derived={r.derived} drifts={r.drifts} />
              </div>

              {r.drifts && (
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  You have this at <b className="mono">{r.stated}%</b>; its projects
                  are at <b className="mono">{r.derived}%</b>. Worth a look — one of
                  the two is out of date.
                </p>
              )}

              <ProgressInput
                value={r.stated}
                busy={busy === `p-${g.id}`}
                onCommit={(n) =>
                  run(`p-${g.id}`, async () =>
                    supabase.from("goals").update({ progress: n }).eq("id", g.id)
                  )
                }
              />

              <ProjectList
                projects={r.projects}
                tasksFor={tasksFor}
                today={today}
                busy={busy}
                onDone={(id) =>
                  run(`pr-${id}`, async () =>
                    supabase.from("projects").update({ status: "done" }).eq("id", id)
                  )
                }
              />

              {open ? (
                <AddProject
                  goalId={g.id}
                  pillarId={g.pillar_id}
                  busy={busy === `np-${g.id}`}
                  onAdd={async (title, due) => {
                    await run(`np-${g.id}`, async () =>
                      supabase.from("projects").insert({
                        title,
                        goal_id: g.id,
                        pillar_id: g.pillar_id,
                        due_date: due || null,
                      })
                    );
                    setOpenGoal(null);
                  }}
                  onCancel={() => setOpenGoal(null)}
                />
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <button className="btn ghost" onClick={() => setOpenGoal(g.id)}>
                    + Project
                  </button>
                  <button
                    className="btn ghost"
                    disabled={busy === `d-${g.id}`}
                    onClick={() =>
                      run(`d-${g.id}`, async () =>
                        supabase
                          .from("goals")
                          .update({ status: "done", progress: 100 })
                          .eq("id", g.id)
                      )
                    }
                  >
                    Mark done
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section>
        <h2 className="label mb-3">Projects with no goal</h2>
        {looseProjects.length === 0 ? (
          <p className="card px-4 py-3.5 text-sm text-[var(--faint)]">
            Nothing loose. Every live project sits under a goal.
          </p>
        ) : (
          <div className="grid gap-2">
            {looseProjects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                percent={projectProgress(tasksFor(p.id))}
                today={today}
                busy={busy === `pr-${p.id}`}
                onDone={() =>
                  run(`pr-${p.id}`, async () =>
                    supabase.from("projects").update({ status: "done" }).eq("id", p.id)
                  )
                }
              />
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--faint)] mt-2 leading-relaxed">
          These are fine. The hierarchy is optional by design — work does not need
          a goal above it to be worth doing.
        </p>
      </section>
    </div>
  );
}

/** Stated vs derived, side by side. Derived is the quieter of the two. */
function ProgressDial({
  stated,
  derived,
  drifts,
}: {
  stated: number;
  derived: number | null;
  drifts: boolean;
}) {
  return (
    <div className="text-right shrink-0">
      <div
        className="mono text-[1.35rem] font-semibold leading-none"
        style={{ color: drifts ? "var(--warn)" : "var(--text)" }}
      >
        {stated}%
      </div>
      <div className="text-[11px] text-[var(--faint)] mt-1">
        {derived == null ? "no tasks yet" : `work: ${derived}%`}
      </div>
    </div>
  );
}

/** Commits on release, not on every pixel — one write per adjustment. */
function ProgressInput({
  value,
  busy,
  onCommit,
}: {
  value: number;
  busy: boolean;
  onCommit: (n: number) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <label className="flex items-center gap-3">
      <span className="label shrink-0">Progress</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        disabled={busy}
        className="flex-1"
        onChange={(e) => setLocal(clampPercent(Number(e.target.value)))}
        onMouseUp={() => local !== value && onCommit(local)}
        onTouchEnd={() => local !== value && onCommit(local)}
        onKeyUp={() => local !== value && onCommit(local)}
      />
      <span className="mono text-xs w-10 text-right">{local}%</span>
    </label>
  );
}

function ProjectList({
  projects,
  tasksFor,
  today,
  busy,
  onDone,
}: {
  projects: Project[];
  tasksFor: (id: string) => Pick<Task, "status">[];
  today: string;
  busy: string | null;
  onDone: (id: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <p className="text-sm text-[var(--faint)]">
        No projects yet. A goal without projects is a wish with a deadline.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {projects.map((p) => (
        <ProjectRow
          key={p.id}
          project={p}
          percent={projectProgress(tasksFor(p.id))}
          today={today}
          busy={busy === `pr-${p.id}`}
          onDone={() => onDone(p.id)}
        />
      ))}
    </div>
  );
}

function ProjectRow({
  project,
  percent,
  today,
  busy,
  onDone,
}: {
  project: Project;
  percent: number | null;
  today: string;
  busy: boolean;
  onDone: () => void;
}) {
  const late = project.due_date != null && project.due_date < today;
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5">
      <span className="text-sm flex-1 min-w-0">{project.title}</span>
      {project.due_date && (
        <span
          className="mono text-[11px] shrink-0"
          style={{ color: late ? "var(--bad)" : "var(--faint)" }}
        >
          {project.due_date}
        </span>
      )}
      <span className="mono text-[11px] text-[var(--muted)] shrink-0 w-16 text-right">
        {percent == null ? "no tasks" : `${percent}%`}
      </span>
      <button className="btn ghost" disabled={busy} onClick={onDone}>
        {busy ? "…" : "Done"}
      </button>
    </div>
  );
}

function AddProject({
  goalId,
  pillarId,
  busy,
  onAdd,
  onCancel,
}: {
  goalId: string;
  pillarId: string | null;
  busy: boolean;
  onAdd: (title: string, due: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <form
      className="flex gap-2 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onAdd(title.trim(), due);
      }}
    >
      <input
        className="input flex-1 min-w-[180px]"
        autoFocus
        placeholder="What has to get built?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="date"
        className="input"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <button className="btn" disabled={!title.trim() || busy}>
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" className="btn ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
