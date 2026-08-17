"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type ComplianceQuestion,
  type Venture,
  type VentureStage,
  COMPLIANCE_KEY,
  FUNDING_ROUTES,
  ONBOARDED_AT_KEY,
  ONBOARD_STEPS,
  STAGE_CONFIRMED_KEY,
  STAGE_LABEL,
  STAGE_MEANING,
  VENTURE_STAGES,
} from "@/lib/types";
import {
  complianceInboxText,
  complianceQuestions,
  isConcerningAnswer,
  nextStepProjectTitle,
  readComplianceAnswers,
  toNumberOrNull,
  toTextOrNull,
  ventureOnboarding,
  NEXT_STEP_ROLE,
} from "@/lib/logic";
import { Bar } from "@/components/ui";

/**
 * The division questionnaire.
 *
 * Eighteen divisions will not be done in one sitting, so two things are
 * non-negotiable here:
 *
 *   1. **Every answer saves the moment it is given.** Not on a final submit.
 *      A form that loses answers on exit is a form that never gets finished,
 *      and this one is the only thing standing between eighteen divisions
 *      and eighteen empty dashboards.
 *
 *   2. **Nothing is required, and skipping writes NULL.** Never zero, never
 *      an empty string. A skipped budget must not make a division look free —
 *      the same discipline the debts and vehicles screens hold.
 *
 * Everything arrives pre-filled from what is already stored, and nothing is
 * overwritten silently: the four costed divisions open with their figures in
 * the boxes, and moving past a question leaves its answer exactly as it was.
 */

type ProjectRow = { id: string; venture_id: string | null; meta?: unknown };

export default function Onboard({
  venture,
  home,
  nextStepProject,
  openNextSteps,
}: {
  venture: Venture;
  /**
   * Where this division's dashboard lives. Passed in rather than derived
   * here so the slug rule stays in one place and this component does not
   * pull the whole reference library into the browser bundle for it.
   */
  home: string;
  /** The division's next-steps project, if one has been made before. */
  nextStepProject: ProjectRow | null;
  /** Open tasks already sitting in it — his previous next steps. */
  openNextSteps: { id: string; title: string; do_date: string | null }[];
}) {
  const router = useRouter();
  const supabase = createClient();

  /* -- what is stored, mirrored locally so saves are instant ------- */
  const [oneLiner, setOneLiner] = useState(venture.one_liner ?? "");
  const [stage, setStage] = useState<VentureStage>(venture.stage);
  const [budget, setBudget] = useState(
    venture.budget == null ? "" : String(venture.budget)
  );
  const [monthly, setMonthly] = useState(
    venture.monthly_cost == null ? "" : String(venture.monthly_cost)
  );
  const [funding, setFunding] = useState(venture.funding_route ?? "");
  const [plan, setPlan] = useState(venture.plan ?? "");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [steps, setSteps] = useState(openNextSteps);
  const [projectId, setProjectId] = useState<string | null>(
    nextStepProject?.id ?? null
  );

  /**
   * `ventures.meta` holds three things at once: the onboarding stamp, the
   * stage confirmation and his compliance answers. Every write below merges
   * into this object rather than replacing it — a write that replaced it
   * would quietly drop the other two.
   */
  const [meta, setMeta] = useState<Record<string, unknown>>(venture.meta ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [i, setI] = useState(0);

  /**
   * What is actually in the database, as opposed to what is currently in the
   * boxes. The count below is computed from this and never from the typing —
   * a question is answered when it is *saved*, and a tick that appeared
   * while he was still typing would be the form flattering itself.
   */
  const [saved, setSaved] = useState({
    one_liner: venture.one_liner,
    budget: venture.budget ?? null,
    monthly_cost: venture.monthly_cost ?? null,
    funding_route: venture.funding_route,
    plan: venture.plan,
  });

  const questions = complianceQuestions(venture.profile);
  const answers = readComplianceAnswers(meta);

  /** The seven questions, then the researched ones, then the summary. */
  const total = ONBOARD_STEPS.length + questions.length + 1;
  const onSummary = i >= total - 1;

  const progress = ventureOnboarding(
    { ...saved, meta },
    { hasNextStep: steps.length > 0 }
  );

  /* -- saving ------------------------------------------------------ */

  async function patchVenture(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("ventures")
      .update(patch)
      .eq("id", venture.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    setFlash("Saved.");
    router.refresh();
    return true;
  }

  /**
   * Stamp `onboarded_at` once every question has an answer.
   *
   * The stamp records *when*, never *whether* — completeness is always
   * recomputed from the answers themselves, so clearing one takes the
   * division back out of the count instead of leaving a flag behind.
   */
  async function stampIfComplete(
    answersNow: typeof saved,
    metaNow: Record<string, unknown>,
    hasNextStep: boolean
  ) {
    const done = ventureOnboarding(
      { ...answersNow, meta: metaNow },
      { hasNextStep }
    );
    if (!done.complete || metaNow[ONBOARDED_AT_KEY] != null) return;
    const next = { ...metaNow, [ONBOARDED_AT_KEY]: new Date().toISOString() };
    setMeta(next);
    // Carries the EMPIRE placement keys (parent, proving, operated,
    // pipeline) through, because `next` spreads the meta this component was
    // handed rather than rebuilding it.
    const { error: metaErr } = await supabase
      .from("ventures")
      .update({ meta: next })
      .eq("id", venture.id);
    if (metaErr) {
      setError(metaErr.message);
      return;
    }
    router.refresh();
  }

  /* -- the one question that writes somewhere else ----------------- */

  /**
   * The next step becomes a real open task. A task reaches a venture through
   * its project — there is no `tasks.venture_id` — so the division gets one
   * next-steps project, created on demand and reused forever after.
   */
  async function saveNextStep() {
    const title = toTextOrNull(nextStep);
    if (title == null) return;
    setBusy(true);
    setError(null);

    let pid = projectId;
    if (!pid) {
      const { data, error: perr } = await supabase
        .from("projects")
        .insert({
          title: nextStepProjectTitle(venture.name),
          venture_id: venture.id,
          pillar_id: venture.pillar_id,
          description:
            "Holds the next step named during onboarding. A task reaches a division through a project, so this is that project.",
          meta: { role: NEXT_STEP_ROLE },
        })
        .select("id")
        .single();
      if (perr || !data) {
        setBusy(false);
        setError(perr?.message ?? "Could not create the project.");
        return;
      }
      pid = data.id as string;
      setProjectId(pid);
    }

    const { data: task, error: terr } = await supabase
      .from("tasks")
      .insert({
        title,
        project_id: pid,
        pillar_id: venture.pillar_id,
        status: "open",
        priority: "Med",
        // No do_date unless he gave one. Due is a fact about the world; do is
        // a decision, and this form is not entitled to make it for him.
        do_date: toTextOrNull(nextStepDate),
      })
      .select("id, title, do_date")
      .single();

    setBusy(false);
    if (terr || !task) {
      setError(terr?.message ?? "Could not create the task.");
      return;
    }
    const added = [...steps, task as { id: string; title: string; do_date: string | null }];
    setSteps(added);
    setNextStep("");
    setNextStepDate("");
    setFlash("Saved as an open task.");
    router.refresh();
    await stampIfComplete(saved, meta, true);
  }

  /* -- compliance: a concern goes to the inbox, never to the plan -- */

  async function answerCompliance(q: ComplianceQuestion, value: string) {
    setBusy(true);
    setError(null);
    const nextAnswers = { ...readComplianceAnswers(meta), [q.key]: value };
    const nextMeta = { ...meta, [COMPLIANCE_KEY]: nextAnswers };
    setMeta(nextMeta);

    const { error: err } = await supabase
      .from("ventures")
      .update({ meta: nextMeta })
      .eq("id", venture.id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }

    if (isConcerningAnswer(q, value)) {
      const text = complianceInboxText(venture.name, q, value);
      // Answering twice must not put the same prompt in the inbox twice.
      const { data: existing } = await supabase
        .from("inbox")
        .select("id")
        .eq("raw_text", text)
        .eq("status", "open")
        .limit(1);
      if ((existing ?? []).length === 0) {
        const { error: inboxErr } = await supabase
          .from("inbox")
          .insert({ raw_text: text, source: "onboarding" });
        if (inboxErr) {
          setError(inboxErr.message);
          return;
        }
        setFlash("Added to your inbox to triage.");
      } else {
        setFlash("Already in your inbox.");
      }
    } else {
      setFlash("Saved.");
    }
    setBusy(false);
    router.refresh();
  }

  /* -- navigation -------------------------------------------------- */

  function go(n: number) {
    setFlash(null);
    setError(null);
    setI(Math.max(0, Math.min(total - 1, n)));
  }

  const step = i < ONBOARD_STEPS.length ? ONBOARD_STEPS[i] : null;
  const question =
    !step && !onSummary ? questions[i - ONBOARD_STEPS.length] : null;

  return (
    <div className="sys-empire max-w-[640px] mx-auto grid gap-5 pt-2">
      {/* -- where you are ---------------------------------------- */}
      <header className="grid gap-2.5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link
            href={home}
            className="text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--sys)" }}
          >
            ← {venture.name}
          </Link>
          <span className="mono text-[0.7rem] text-[var(--faint)] ml-auto">
            {Math.min(i + 1, total)} / {total}
          </span>
        </div>
        <Bar percent={Math.round((i / (total - 1)) * 100)} colour="var(--sys)" />
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          {progress.done} of {progress.total} answered · nothing is required,
          and every answer saves as you give it. Leave whenever you like.
        </p>
      </header>

      {/* -- the question ------------------------------------------ */}
      <section className="card p-5 grid gap-4">
        {step && (
          <>
            <div className="grid gap-1.5">
              <h1 className="text-[1.25rem] font-semibold leading-snug m-0">
                {step.question}
              </h1>
              <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed m-0">
                {step.hint}
              </p>
            </div>

            {step.key === "one_liner" && (
              <input
                // Keyed by step so React remounts the box on every question.
                // Without it the same element is reused and `autoFocus` only
                // ever fires once — you would land on question four with the
                // cursor still on question three.
                key={step.key}
                className="input"
                value={oneLiner}
                onChange={(e) => setOneLiner(e.target.value)}
                placeholder="Buys and sells stock — the first thing that pays."
                aria-label={step.question}
                autoFocus
              />
            )}

            {step.key === "stage" && (
              <div className="grid gap-1.5">
                {VENTURE_STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded-[10px] border px-3.5 py-2.5 text-left card-hover"
                    style={{
                      borderColor:
                        s === stage ? "var(--sys)" : "var(--border)",
                      background: s === stage ? "var(--empire-soft)" : "transparent",
                    }}
                    disabled={busy}
                    onClick={async () => {
                      setStage(s);
                      const nextMeta = { ...meta, [STAGE_CONFIRMED_KEY]: true };
                      setMeta(nextMeta);
                      const ok = await patchVenture({ stage: s, meta: nextMeta });
                      if (ok) await stampIfComplete(saved, nextMeta, steps.length > 0);
                    }}
                  >
                    <span className="text-[0.9rem] font-semibold">
                      {STAGE_LABEL[s]}
                      {s === venture.stage && (
                        <span className="text-[0.7rem] font-normal text-[var(--faint)]">
                          {" "}
                          · stored
                        </span>
                      )}
                    </span>
                    <span className="block text-[0.78rem] text-[var(--muted)] leading-snug mt-0.5">
                      {STAGE_MEANING[s]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {(step.key === "budget" || step.key === "monthly_cost") && (
              <div className="flex items-center gap-2">
                <span className="mono text-[1.1rem] text-[var(--muted)]">£</span>
                <input
                  key={step.key}
                  className="input mono flex-1"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={step.key === "budget" ? budget : monthly}
                  onChange={(e) =>
                    step.key === "budget"
                      ? setBudget(e.target.value)
                      : setMonthly(e.target.value)
                  }
                  placeholder="leave blank if you do not know"
                  aria-label={step.question}
                  autoFocus
                />
              </div>
            )}

            {step.key === "funding_route" && (
              <div className="grid gap-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  {FUNDING_ROUTES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="chip"
                      data-active={funding === r}
                      onClick={() => setFunding(r)}
                    >
                      {funding === r ? "✓ " : ""}
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  className="input"
                  value={funding}
                  onChange={(e) => setFunding(e.target.value)}
                  placeholder="or type something else"
                  aria-label={step.question}
                />
              </div>
            )}

            {step.key === "next_step" && (
              <div className="grid gap-2.5">
                {steps.length > 0 && (
                  <ul className="grid gap-1.5 list-none p-0 m-0">
                    {steps.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-[10px] border border-[var(--border)] px-3.5 py-2 text-[0.84rem]"
                      >
                        {t.title}
                        <span className="mono text-[0.68rem] text-[var(--faint)]">
                          {t.do_date ? ` · ${t.do_date}` : " · no day set"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  key={step.key}
                  className="input"
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="Ring the council about the empty-home premium"
                  aria-label={step.question}
                  autoFocus
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-[0.76rem] text-[var(--muted)]">
                    Do it on
                  </label>
                  <input
                    className="input mono w-auto"
                    type="date"
                    value={nextStepDate}
                    onChange={(e) => setNextStepDate(e.target.value)}
                    aria-label="Day to do the next step"
                  />
                  <span className="text-[0.72rem] text-[var(--faint)]">
                    optional — a task with no day is still a task
                  </span>
                </div>
                <button
                  type="button"
                  className="btn justify-self-start"
                  disabled={busy || toTextOrNull(nextStep) == null}
                  onClick={saveNextStep}
                >
                  {busy ? "Saving…" : "Make it a task"}
                </button>
              </div>
            )}

            {step.key === "plan" && (
              <textarea
                key={step.key}
                className="input"
                rows={7}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="How this actually gets built, in your own words."
                aria-label={step.question}
                autoFocus
              />
            )}

            <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed m-0">
              Skipped: {step.skipped}
            </p>
          </>
        )}

        {/* -- the researched questions -------------------------- */}
        {question && (
          <>
            <div className="grid gap-1.5">
              <p className="label" style={{ color: "var(--sys)" }}>
                Researched · check this
              </p>
              <h1 className="text-[1.25rem] font-semibold leading-snug m-0">
                {question.question}
              </h1>
              <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed m-0">
                {question.because}
              </p>
            </div>
            <div className="grid gap-1.5">
              {question.options.map((o) => {
                const chosen = answers[question.key] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    className="rounded-[10px] border px-3.5 py-2.5 text-left card-hover flex items-center gap-2"
                    style={{
                      borderColor: chosen ? "var(--sys)" : "var(--border)",
                      background: chosen ? "var(--empire-soft)" : "transparent",
                    }}
                    disabled={busy}
                    onClick={() => answerCompliance(question, o.value)}
                  >
                    <span className="text-[0.9rem] font-medium">{o.label}</span>
                    {chosen && (
                      <span
                        className="text-[0.7rem] ml-auto"
                        style={{ color: o.concern ? "var(--warn)" : "var(--good)" }}
                      >
                        {o.concern ? "in your inbox" : "nothing to do"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed m-0">
              A &quot;no&quot; or a &quot;not sure&quot; puts a prompt in your
              inbox to triage. It never becomes a task on its own — that is
              your decision to make, not the system&apos;s.
            </p>
          </>
        )}

        {/* -- done ---------------------------------------------- */}
        {onSummary && (
          <div className="grid gap-3">
            <h1 className="text-[1.25rem] font-semibold leading-snug m-0">
              {progress.complete
                ? `${venture.name} is onboarded.`
                : `${progress.done} of ${progress.total} answered.`}
            </h1>
            <p className="text-[0.85rem] text-[var(--muted)] leading-relaxed m-0">
              {progress.complete
                ? "Its dashboard now has something real to draw. Every answer stays editable — come back whenever the division changes."
                : "That is a fine place to stop. What you answered is saved, and the dashboard shows exactly what it knows and no more. The rest is here when you want it."}
            </p>
            {!progress.complete && (
              <ul className="grid gap-1 list-none p-0 m-0">
                {progress.missing.map((k) => {
                  const s = ONBOARD_STEPS.find((x) => x.key === k);
                  return (
                    <li
                      key={k}
                      className="text-[0.8rem] text-[var(--muted)] flex gap-2"
                    >
                      <span className="text-[var(--faint)]">◦</span>
                      <button
                        type="button"
                        className="text-left no-underline"
                        style={{ color: "var(--accent)" }}
                        onClick={() =>
                          go(ONBOARD_STEPS.findIndex((x) => x.key === k))
                        }
                      >
                        {s?.question ?? k}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex gap-2 flex-wrap">
              <Link href={home} className="btn no-underline">
                See the dashboard
              </Link>
              <Link href="/empire" className="btn btn-ghost no-underline">
                Next division
              </Link>
            </div>
          </div>
        )}

        {/* -- moving on ----------------------------------------- */}
        {!onSummary && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => go(i - 1)}
              disabled={i === 0}
            >
              ← Back
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                // The typed answers commit on the way out. The choice
                // questions — stage, and the researched ones — have already
                // written themselves the moment they were tapped.
                const patch: Record<string, unknown> = {};
                if (step?.key === "one_liner") patch.one_liner = toTextOrNull(oneLiner);
                if (step?.key === "budget") patch.budget = toNumberOrNull(budget);
                if (step?.key === "monthly_cost")
                  patch.monthly_cost = toNumberOrNull(monthly);
                if (step?.key === "funding_route")
                  patch.funding_route = toTextOrNull(funding);
                if (step?.key === "plan") patch.plan = toTextOrNull(plan);

                if (Object.keys(patch).length > 0) {
                  if (!(await patchVenture(patch))) return;
                  const next = { ...saved, ...patch } as typeof saved;
                  setSaved(next);
                  await stampIfComplete(next, meta, steps.length > 0);
                }
                go(i + 1);
              }}
            >
              {busy ? "Saving…" : "Save and next →"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                // Skipping leaves the stored answer exactly as it was, which
                // means putting the box back to it too. Anything typed and
                // not saved is discarded rather than left looking answered.
                if (step?.key === "one_liner") setOneLiner(saved.one_liner ?? "");
                if (step?.key === "budget")
                  setBudget(saved.budget == null ? "" : String(saved.budget));
                if (step?.key === "monthly_cost")
                  setMonthly(
                    saved.monthly_cost == null ? "" : String(saved.monthly_cost)
                  );
                if (step?.key === "funding_route")
                  setFunding(saved.funding_route ?? "");
                if (step?.key === "plan") setPlan(saved.plan ?? "");
                if (step?.key === "next_step") {
                  setNextStep("");
                  setNextStepDate("");
                }
                go(i + 1);
              }}
              title="Leaves this answer exactly as it is"
            >
              Skip
            </button>
            {flash && (
              <span className="text-[0.76rem]" style={{ color: "var(--good)" }}>
                {flash}
              </span>
            )}
            {error && (
              <span className="text-[0.76rem]" style={{ color: "var(--bad)" }}>
                Didn&apos;t save: {error}
              </span>
            )}
          </div>
        )}
      </section>

      {/* -- the rail: every question, jump to any of them --------- */}
      <nav className="flex gap-1.5 flex-wrap">
        {ONBOARD_STEPS.map((s, n) => (
          <button
            key={s.key}
            type="button"
            className="chip"
            data-active={n === i}
            onClick={() => go(n)}
            title={s.question}
          >
            {progress.answered.includes(s.key) ? "✓ " : ""}
            {n + 1}
          </button>
        ))}
        {questions.map((q, n) => (
          <button
            key={q.key}
            type="button"
            className="chip"
            data-active={ONBOARD_STEPS.length + n === i}
            onClick={() => go(ONBOARD_STEPS.length + n)}
            title={q.question}
          >
            {answers[q.key] ? "✓ " : ""}
            {ONBOARD_STEPS.length + n + 1}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          data-active={onSummary}
          onClick={() => go(total - 1)}
        >
          Done
        </button>
      </nav>
    </div>
  );
}
