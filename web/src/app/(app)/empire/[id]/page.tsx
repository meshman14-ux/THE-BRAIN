import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type Asset,
  type Goal,
  type Pillar,
  type Project,
  type Task,
  type Venture,
  ONBOARD_STEPS,
  STAGE_COLOUR,
  STAGE_LABEL,
  STAGE_MEANING,
  VENTURE_STAGES,
} from "@/lib/types";
import {
  budgetVsSpend,
  complianceQuestions,
  daysUntil,
  formatDayLong,
  formatGBP,
  isShelved,
  readComplianceAnswers,
  readVentureProfile,
  resolveVenture,
  sortByPriority,
  spendByVenture,
  stagePathPercent,
  stagePosition,
  taskMix,
  toIso,
  ventureGoals,
  ventureOnboarding,
  ventureProjects,
  ventureRollup,
  ventureTasks,
  venturesWithNextStep,
} from "@/lib/logic";
import { divisionHref, refsForBranch, ventureSlug } from "@/lib/references";
import { readVentureMonths } from "@/lib/logic";
import { Panel, Empty, Kpi, Bar, Tag, DriftNote } from "@/components/ui";
import { parentById } from "@/lib/parents";
import EmpireParent from "@/components/EmpireParent";
import DivisionMonth from "@/components/DivisionMonth";

export const dynamic = "force-dynamic";

/**
 * One division, one page — the cockpit the branch pages always promised.
 *
 * Everything here is drawn from what the questionnaire collects, and
 * nothing else. That constraint is the point: a chart fed by data nobody
 * has entered is a chart that lies convincingly, and eighteen of those
 * would have been the whole feature.
 *
 * A division nobody has answered anything about does not get an empty
 * dashboard. It gets the invitation, because the empty state is the on-ramp.
 */
export default async function DivisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;

  /* -- an EMPIRE parent, not a division ----------------------------- *
   *
   * `/empire/property` and `/empire/kathleen-st` sit at the same level of
   * the path, and Next.js will not accept two differently-named dynamic
   * segments as siblings. So this route owns both and asks which it is.
   *
   * Parents are checked FIRST and their ids are a closed set of five, so
   * a division can only be shadowed by being named exactly "property",
   * "trade", "product", "digital" or "pipeline" — none is, and any that
   * were would be a confusing name for a division regardless. */
  const asParent = parentById(id);
  if (asParent?.layer === "empire") {
    return <EmpireParent parentId={id} tab={(await searchParams).tab} />;
  }
  const supabase = await createClient();
  const today = toIso(new Date());

  const [
    { data: ventures },
    { data: projects },
    { data: tasks },
    { data: goals },
    { data: assets },
    { data: pillars },
  ] = await Promise.all([
    supabase
      .from("ventures")
      .select(
        "id, name, pillar_id, stage, progress, one_liner, status, sort_order, external_system, external_url, plan, budget, monthly_cost, funding_route, profile, meta"
      )
      .order("sort_order"),
    supabase
      .from("projects")
      .select("id, title, description, pillar_id, goal_id, venture_id, start_date, due_date, status, meta"),
    supabase
      .from("tasks")
      .select("id, title, notes, pillar_id, project_id, do_date, due_date, priority, status"),
    supabase.from("goals").select("id, title, target_date, progress, status, pillar_id"),
    supabase
      .from("assets")
      .select("id, name, kind, venture_id, pillar_id, value, income_monthly, cost_monthly, status, acquired_on"),
    supabase.from("pillars").select("id, name, emoji, system"),
  ]);

  const allVentures = (ventures ?? []) as Venture[];
  const v = resolveVenture(allVentures, id);
  // A pointer row and an unknown id are the same answer: there is no
  // cockpit here. MAINFRAME's data lives in MAINFRAME (locked decision A1).
  if (!v) notFound();

  const allProjects = (projects ?? []) as (Project & {
    venture_id: string | null;
    meta?: Record<string, unknown> | null;
  })[];
  const allTasks = (tasks ?? []) as Task[];
  const allGoals = (goals ?? []) as Goal[];
  const allAssets = (assets ?? []) as Asset[];
  const allPillars = (pillars ?? []) as Pick<Pillar, "id" | "name" | "emoji" | "system">[];

  const slug = ventureSlug(v.name);
  const withNextStep = venturesWithNextStep(allProjects, allTasks);
  const onboarding = ventureOnboarding(v, { hasNextStep: withNextStep.has(v.id) });

  const mine = ventureProjects(allProjects, v.id);
  const myTasks = ventureTasks(allProjects, allTasks, v.id);
  const myGoals = ventureGoals(allProjects, allGoals, v.id);
  const mix = taskMix(myTasks);
  const rollup = ventureRollup(v);
  const money = budgetVsSpend(v.budget, spendByVenture(allAssets)[v.id] ?? null);
  const profile = readVentureProfile(v.profile);
  const answers = readComplianceAnswers(v.meta);
  const questions = complianceQuestions(v.profile);
  const area = v.pillar_id ? allPillars.find((p) => p.id === v.pillar_id) : null;
  const refs = refsForBranch(slug);
  const shelved = isShelved(v);
  const onboardHref = `${divisionHref(v.name)}/onboard`;

  /* -- the on-ramp ------------------------------------------------ */

  if (!onboarding.hasDashboardData) {
    return (
      <div className="sys-empire max-w-[720px] mx-auto grid gap-6 pt-4">
        <header className="text-center">
          <p className="label" style={{ color: "var(--sys)" }}>
            EMPIRE_OS · division
          </p>
          <h1 className="text-[1.8rem] font-semibold mt-2">{v.name}</h1>
          {v.one_liner && (
            <p className="text-[0.92rem] text-[var(--muted)] mt-2">
              {v.one_liner}
            </p>
          )}
          <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed max-w-[54ch] mx-auto">
            A name and a line is all this division has, so there is nothing
            honest to put on a dashboard yet. Seven questions, none of them
            required, and you can stop halfway — every answer saves as you
            give it.
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <Link href={onboardHref} className="btn no-underline">
              Start the questionnaire
            </Link>
            <Link href="/empire" className="btn btn-ghost no-underline">
              ← Divisions
            </Link>
          </div>
        </header>

        <Panel title="What it asks" hint={`${ONBOARD_STEPS.length} questions`}>
          <ol className="grid gap-1.5 list-none p-0 m-0">
            {ONBOARD_STEPS.map((s, i) => (
              <li
                key={s.key}
                className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
              >
                <span
                  className="mono text-[0.7rem] font-bold shrink-0 mt-[3px]"
                  style={{ color: "var(--sys)" }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.86rem] font-medium leading-snug">
                    {s.question}
                  </p>
                  <p className="text-[0.74rem] text-[var(--muted)] mt-0.5 leading-snug">
                    {s.hint}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        {profile.any && (
          <Panel title="Already researched" hint="waiting to be turned into questions">
            <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
              This division carries researched compliance material
              {profile.regulator ? ` on ${profile.regulator}` : ""}. The
              questionnaire ends by asking you about it, because research
              nobody is asked about is research nobody acts on.
            </p>
          </Panel>
        )}
      </div>
    );
  }

  /* -- the dashboard ---------------------------------------------- */

  return (
    <div className="sys-empire grid gap-6">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link
            href="/empire"
            className="text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--sys)" }}
          >
            ← EMPIRE_OS
          </Link>
          <p className="mono text-[0.72rem] text-[var(--faint)]">
            {formatDayLong(today)}
          </p>
          {shelved && <Tag colour="var(--faint)">backlog</Tag>}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap mt-1.5">
          <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold">{v.name}</h1>
          <Tag colour={STAGE_COLOUR[v.stage]}>{STAGE_LABEL[v.stage]}</Tag>
        </div>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-[68ch] leading-relaxed">
          {v.one_liner ?? "No one-liner yet — the questionnaire asks for one."}
        </p>
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {area && (
            <Link
              href={`/pillar/${area.id}`}
              className="text-[0.76rem] no-underline text-[var(--muted)]"
            >
              {area.emoji} {area.name} →
            </Link>
          )}
          <Link
            href={onboardHref}
            className="text-[0.76rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            {onboarding.complete ? "Review the answers" : "Finish onboarding"} →
          </Link>
        </div>
      </header>

      {/* -- onboarding state, said once and plainly ---------------- */}
      {!onboarding.complete ? (
        <section className="card p-4 sm:p-5 grid gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="label">Onboarding</p>
            <span className="mono text-[0.72rem] text-[var(--faint)]">
              {onboarding.done} of {onboarding.total} answered
            </span>
            <Link
              href={onboardHref}
              className="ml-auto text-[0.74rem] font-semibold no-underline"
              style={{ color: "var(--sys)" }}
            >
              CONTINUE →
            </Link>
          </div>
          <Bar percent={onboarding.percent} colour="var(--sys)" />
          <p className="text-[0.76rem] text-[var(--muted)] leading-relaxed">
            Still to answer:{" "}
            {onboarding.missing
              .map((k) => ONBOARD_STEPS.find((s) => s.key === k)?.question ?? k)
              .join(" · ")}
          </p>
        </section>
      ) : (
        onboarding.onboardedAt && (
          <p className="text-[0.74rem] text-[var(--faint)]">
            Onboarded {onboarding.onboardedAt.slice(0, 10)}. Every answer stays
            editable — a division that changes and a form that cannot is how a
            system starts lying.
          </p>
        )
      )}

      {/* -- the numbers ------------------------------------------- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cost to start"
          value={formatGBP(money.budget)}
          tone={money.budget == null ? "faint" : "text"}
          note={money.budget == null ? "Not answered — not free" : "One-off setup"}
        />
        <Kpi
          label="Spent so far"
          value={formatGBP(money.spent)}
          tone={money.over ? "bad" : money.spent == null ? "faint" : "text"}
          note={
            money.spent == null
              ? "Nothing recorded against it"
              : `${allAssets.filter((a) => a.venture_id === v.id).length} asset(s) recorded`
          }
        />
        <Kpi
          label="Running cost"
          value={formatGBP(v.monthly_cost ?? null)}
          tone={v.monthly_cost == null ? "faint" : "warn"}
          note={
            v.monthly_cost == null
              ? "Not answered"
              : "Every month, trading or not"
          }
        />
        {/* Not a Kpi: a funding route is a sentence, and a sentence set in
            the big tabular numeral face reads as a number that went wrong. */}
        <div className="card p-4">
          <p className="label">Funded by</p>
          <p
            className="text-[0.92rem] font-semibold leading-snug mt-2"
            style={{ color: v.funding_route ? "var(--text)" : "var(--faint)" }}
          >
            {v.funding_route ?? "Not answered"}
          </p>
          <p className="text-[0.7rem] text-[var(--faint)] mt-1.5 leading-snug">
            {v.funding_route
              ? "Where the money comes from"
              : "A cost with no source behind it"}
          </p>
        </div>
      </div>

      {/* -- this month: the three numbers it is judged by ---------- */}
      <Panel
        title="This month"
        hint="revenue · costs · hours — profit per hour follows"
      >
        <DivisionMonth
          ventureId={v.id}
          months={readVentureMonths(v.meta)}
          today={toIso(new Date())}
        />
      </Panel>

      {/* -- graphs: the path, the money, the work ------------------ */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Panel title="Path to revenue" hint="where this division actually is">
          <div className="grid gap-2.5">
            <Bar
              percent={stagePathPercent(v.stage)}
              colour={STAGE_COLOUR[v.stage]}
              height={10}
              muted={shelved}
            />
            <ol className="grid grid-cols-5 gap-1 list-none p-0 m-0">
              {VENTURE_STAGES.map((s, i) => {
                const reached = i <= stagePosition(v.stage);
                return (
                  <li key={s} className="text-center">
                    <span
                      className="block text-[0.62rem] font-bold uppercase tracking-[0.04em]"
                      style={{
                        color: reached ? STAGE_COLOUR[v.stage] : "var(--faint)",
                      }}
                    >
                      {STAGE_LABEL[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
              {STAGE_MEANING[v.stage]}
            </p>
            <div className="flex items-baseline gap-2.5 pt-1 border-t border-[var(--border)]">
              <span className="label">Progress</span>
              <span className="mono text-[0.88rem] ml-auto">{rollup.shown}%</span>
            </div>
            <Bar percent={rollup.shown} colour={STAGE_COLOUR[v.stage]} muted={shelved} />
            {rollup.drifts && rollup.stated != null && (
              <DriftNote
                stated={rollup.stated}
                derived={rollup.derived}
                what={`the ${STAGE_LABEL[v.stage].toLowerCase()} stage`}
              />
            )}
          </div>
        </Panel>

        <Panel title="Budget against spend" hint="what it was going to cost, and what it has">
          {money.state === "unknown" ? (
            <Empty cta={{ href: onboardHref, label: "Answer the cost question" }}>
              No budget and nothing spent. Both are unknown rather than zero,
              so there is nothing to draw yet.
            </Empty>
          ) : (
            <div className="grid gap-2.5">
              {/* Only drawn when both sides are known. An empty bar beside a
                  £— reads as "nothing spent", which is a different fact from
                  "nothing recorded". */}
              {money.percent != null && (
                <Bar
                  percent={Math.min(money.percent, 100)}
                  colour={money.over ? "var(--bad)" : "var(--sys)"}
                  height={10}
                />
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[0.8rem]">
                <span className="text-[var(--muted)]">
                  Budget{" "}
                  <b className="mono text-[var(--text)]">
                    {formatGBP(money.budget)}
                  </b>
                </span>
                <span className="text-[var(--muted)]">
                  Spent{" "}
                  <b className="mono text-[var(--text)]">
                    {formatGBP(money.spent)}
                  </b>
                </span>
                {money.remaining != null && (
                  <span className="text-[var(--muted)]">
                    {money.over ? "Over by" : "Left"}{" "}
                    <b
                      className="mono"
                      style={{ color: money.over ? "var(--bad)" : "var(--good)" }}
                    >
                      {formatGBP(Math.abs(money.remaining))}
                    </b>
                  </span>
                )}
              </div>
              <p className="text-[0.76rem] text-[var(--muted)] leading-relaxed">
                {money.state === "unbudgeted" &&
                  "Money has gone into this and no budget was ever set. That is a missing figure, not an overspend — the system will not call it one."}
                {money.state === "unspent" &&
                  "A budget, and nothing recorded against it yet. Spend appears here as assets get logged against the division."}
                {(money.state === "unspent" || money.state === "unbudgeted") && (
                  <>
                    {" "}
                    <Link href="/holdings" className="no-underline" style={{ color: "var(--sys)" }}>
                      Holdings
                    </Link>{" "}
                    is where they are logged.
                  </>
                )}
                {money.state === "under" &&
                  `${money.percent}% of the budget used.`}
                {money.state === "over" &&
                  `${money.percent}% of the budget used. It has cost more than it was meant to.`}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* -- the work ---------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Panel
          title="Tasks"
          hint={mix.total === 0 ? "none yet" : `${mix.total} in total`}
          action={
            <Link
              href="/planner"
              className="text-[0.74rem] font-semibold no-underline"
              style={{ color: "var(--sys)" }}
            >
              PLANNER →
            </Link>
          }
        >
          {mix.total === 0 ? (
            <Empty cta={{ href: onboardHref, label: "Name the next step" }}>
              No tasks hang off this division yet. The questionnaire&apos;s
              sixth question makes one — a single next step, small enough to
              actually do.
            </Empty>
          ) : (
            <div className="grid gap-3">
              {/* completion, as three stacked counts rather than a pie */}
              <div className="flex gap-1 h-2.5 rounded-full overflow-hidden bg-[var(--bg-2)] border border-[var(--border)]">
                {(
                  [
                    ["done", mix.done, "var(--done)"],
                    ["doing", mix.doing, "var(--doing)"],
                    ["open", mix.open, "var(--todo)"],
                  ] as const
                ).map(([k, n, c]) =>
                  n === 0 ? null : (
                    <div
                      key={k}
                      style={{
                        width: `${(n / mix.total) * 100}%`,
                        background: c,
                      }}
                      title={`${n} ${k}`}
                    />
                  )
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.78rem] text-[var(--muted)]">
                <span>
                  Done <b className="mono text-[var(--text)]">{mix.done}</b>
                </span>
                <span>
                  In progress <b className="mono text-[var(--text)]">{mix.doing}</b>
                </span>
                <span>
                  To do <b className="mono text-[var(--text)]">{mix.open}</b>
                </span>
                {mix.donePercent != null && (
                  <span className="ml-auto mono">{mix.donePercent}% complete</span>
                )}
              </div>
              <ul className="grid gap-1.5 list-none p-0 m-0">
                {sortByPriority(myTasks.filter((t) => t.status !== "done"))
                  .slice(0, 8)
                  .map((t) => {
                    const late = daysUntil(t.due_date, today);
                    return (
                      <li
                        key={t.id}
                        className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                      >
                        <span className="text-[0.86rem] leading-snug min-w-0 flex-1">
                          {t.title}
                        </span>
                        <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                          {t.priority}
                        </span>
                        {late != null && late < 0 && (
                          <span
                            className="mono text-[0.66rem] shrink-0"
                            style={{ color: "var(--bad)" }}
                          >
                            {Math.abs(late)}d late
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Projects and goals" hint="what this division is inside">
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <p className="label">Projects</p>
              {mine.length === 0 ? (
                <p className="text-[0.78rem] text-[var(--faint)] leading-relaxed">
                  None yet. A project is the unit of work a division gets done
                  through — tasks reach the division through one.
                </p>
              ) : (
                mine.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                  >
                    <p className="text-[0.86rem] font-medium leading-snug">
                      {p.title}
                    </p>
                    <p className="mono text-[0.66rem] text-[var(--faint)] mt-0.5">
                      {p.status}
                      {p.due_date ? ` · due ${p.due_date}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="grid gap-1.5">
              <p className="label">Goals</p>
              {myGoals.length === 0 ? (
                <p className="text-[0.78rem] text-[var(--faint)] leading-relaxed">
                  No goal above this division. That is allowed — a project
                  never requires one (locked decision 2).
                </p>
              ) : (
                myGoals.map((g) => (
                  <Link
                    key={g.id}
                    href="/goals"
                    className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover block"
                  >
                    <p className="text-[0.86rem] font-medium leading-snug">
                      {g.title}
                    </p>
                    <p className="mono text-[0.66rem] text-[var(--faint)] mt-0.5">
                      {g.target_date ?? "no target date"} · {g.progress}%
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* -- the plan, in his words -------------------------------- */}
      <Panel title="The plan" hint="his words, unedited">
        {v.plan ? (
          <p className="text-[0.88rem] leading-relaxed whitespace-pre-wrap">
            {v.plan}
          </p>
        ) : (
          <Empty cta={{ href: onboardHref, label: "Write the plan" }}>
            Nothing written down. The numbers above say what this costs; this
            is the only part that says what it is for.
          </Empty>
        )}
      </Panel>

      {/* -- researched, not verified ------------------------------ */}
      {profile.any && (
        <Panel
          title="Compliance · researched"
          hint={profile.regulator ?? "the rules this division sits under"}
        >
          <p
            className="text-[0.74rem] leading-relaxed rounded-[9px] px-3 py-2 border border-dashed"
            style={{ color: "var(--warn)", borderColor: "var(--border-bright)" }}
          >
            Researched on 2026-08-01 and not verified by you or by a
            professional. Treat every line as a question to check, not as
            advice you have already taken.
          </p>

          {profile.duty && (
            <Line label="The duty">{profile.duty}</Line>
          )}
          {profile.critical && (
            <Line label="What it costs to ignore" tone="var(--bad)">
              {profile.critical}
            </Line>
          )}
          {profile.money && <Line label="The money">{profile.money}</Line>}
          {profile.penalties && (
            <Line label="Penalties">{profile.penalties}</Line>
          )}
          {profile.councilTaxWarning && (
            <Line label="Council tax">{profile.councilTaxWarning}</Line>
          )}

          {profile.firstSteps.length > 0 && (
            <div className="grid gap-1.5">
              <p className="label">First steps</p>
              <ul className="grid gap-1 list-disc pl-5 m-0">
                {profile.firstSteps.map((s) => (
                  <li key={s} className="text-[0.82rem] leading-relaxed">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.alsoConsider.length > 0 && (
            <div className="grid gap-1.5">
              <p className="label">Also worth considering</p>
              <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
                {profile.alsoConsider.join(" · ")}
              </p>
            </div>
          )}

          {questions.length > 0 && (
            <div className="grid gap-1.5">
              <p className="label">Your answers</p>
              {questions.map((q) => {
                const a = answers[q.key];
                const opt = q.options.find((o) => o.value === a);
                return (
                  <div
                    key={q.key}
                    className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                  >
                    <span className="text-[0.82rem] leading-snug min-w-0 flex-1">
                      {q.question}
                    </span>
                    <span
                      className="text-[0.74rem] font-semibold shrink-0"
                      style={{
                        color: !opt
                          ? "var(--faint)"
                          : opt.concern
                            ? "var(--warn)"
                            : "var(--good)",
                      }}
                    >
                      {opt?.label ?? "not answered"}
                    </span>
                  </div>
                );
              })}
              <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
                A &quot;no&quot; or a &quot;not sure&quot; puts a prompt in your
                inbox to triage — never a task you did not decide on.
              </p>
            </div>
          )}

          {profile.sources.length > 0 && (
            <div className="grid gap-1.5">
              <p className="label">Sources</p>
              {profile.sources.map((s) => (
                <a
                  key={s}
                  href={s}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[0.72rem] break-all no-underline"
                  style={{ color: "var(--accent)" }}
                >
                  {s} ↗
                </a>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* -- the shelf the branch page used to carry --------------- */}
      {refs.length > 0 && (
        <Panel
          title="Reference shelf"
          hint="curated, UK-focused"
          action={
            <Link
              href="/library"
              className="text-[0.74rem] font-semibold no-underline"
              style={{ color: "var(--sys)" }}
            >
              FULL LIBRARY →
            </Link>
          }
        >
          <div className="grid gap-1.5">
            {refs.map((r) => (
              <a
                key={r.url}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover block"
              >
                <p className="text-[0.84rem] font-medium">
                  {r.title} <span className="text-[var(--faint)]">↗</span>
                </p>
                <p className="text-[0.74rem] text-[var(--muted)] mt-0.5 leading-snug">
                  {r.why}
                </p>
              </a>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/** One labelled paragraph of researched material. */
function Line({
  label,
  children,
  tone = "var(--text)",
}: {
  label: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="grid gap-1">
      <p className="label">{label}</p>
      <p
        className="text-[0.84rem] leading-relaxed max-w-[74ch]"
        style={{ color: tone }}
      >
        {children}
      </p>
    </div>
  );
}
