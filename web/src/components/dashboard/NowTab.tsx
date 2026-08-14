import Link from "next/link";
import { daysUntil, formatDayLong } from "@/lib/logic";
import type { Task } from "@/lib/types";
import Board from "@/components/Board";
import Focus from "@/components/Focus";
import Momentum from "@/components/Momentum";
import { Panel } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * The dashboard's NOW tab — what am I doing next
 *
 * Lifted out of `page.tsx` on 2026-08-14, last of four, with no change
 * to its logic. It went last deliberately: it is the tab that opens by
 * default and therefore the most-used screen in the system, so it moved
 * once the method had been proved on the other three.
 *
 * The page still loads every row and derives every figure; this takes
 * the results as props. That is why the list below is long, and why
 * leaving it long was right: shortening it would mean moving derivation
 * too, which is a rewrite rather than a move.
 * ------------------------------------------------------------------ */

type NowProps = {
  closed: boolean;
  cogAdvice: import("@/lib/cog/types").Advice | null;
  creedLine: string | null;
  empireBoard: import("@/lib/parents").ParentReport[];
  empireShapeLine: string;
  empireTasks: import("@/lib/types").Task[];
  focus: ReturnType<typeof import("@/lib/logic").focusList<import("@/lib/types").Task>>;
  greet: { word: string; emoji: string };
  lifeTasks: import("@/lib/types").Task[];
  line: ReturnType<typeof import("@/lib/oneline").oneLine>;
  progress: ReturnType<typeof import("@/lib/logic").todayProgress>;
  reviewText: string;
  setupNeeded: string | null;
  split: ReturnType<typeof import("@/lib/logic").taskSplit>;
  streak: number;
  dormantTasks: import("@/lib/types").Task[];
  today: string;
  verse: ReturnType<typeof import("@/lib/gita").verseOfDay>;
  wk: number;
  q: ReturnType<typeof import("@/lib/logic").quarterOf>;
  board: import("@/lib/parents").ParentReport[];
  toFocusItem: (t: import("@/lib/types").Task) => import("@/components/Focus").FocusItem;
};

export default function NowTab({
  closed,
  cogAdvice,
  creedLine,
  empireBoard,
  empireShapeLine,
  empireTasks,
  focus,
  greet,
  lifeTasks,
  line,
  progress,
  reviewText,
  setupNeeded,
  split,
  dormantTasks,
  streak,
  today,
  verse,
  wk,
  q,
  board,
  toFocusItem,
}: NowProps) {
  return (
    <>
        {/* -- HERO ------------------------------------------------- *
         *
         * Three blocks, in the order they are wanted: who and when, the
         * two numbers, then the words. On a phone they simply stack in
         * that order; from 640px the first two share a row and the quotes
         * take the full width beneath.
         *
         * The greeting is `basis-full` below `sm` on purpose. It used to
         * be `flex-1` at every width, which does not wrap — it just gives
         * up whatever the streak box wants and keeps the rest. At 390px
         * that left it about 165px, so the eyebrow ran to five lines and
         * "Good afternoon, Jay" to three. Wrapping is the behaviour that
         * was wanted; `flex-1` is the one thing that prevents it.
         */}
        {/* `.panel-hero` is depth 3: the day's ground, lit from the top
            left in whichever machine is being worn. Decoration only —
            every fact here is in the text. */}
        <div className="panel-hero flex items-start gap-4 flex-wrap">
          <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
            <p
              className="text-[0.66rem] font-bold tracking-[0.16em] uppercase"
              style={{ color: "var(--accent)" }}
            >
              Brain_OS · command centre · one view, both lives
            </p>
            <h1 className="text-[1.6rem] sm:text-[1.9rem] font-semibold leading-tight mt-1.5">
              {greet.emoji} {greet.word}, Jay
            </h1>
            <p className="text-[0.82rem] text-[var(--muted)] mt-1.5">
              {formatDayLong(today)} · WK {wk} · Q{q}
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span
              className="mono text-[0.72rem] font-bold px-2.5 py-1.5 rounded-[8px]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              TODAY {progress.done}/{progress.of}
            </span>
            <div
              className="text-center rounded-[12px] px-4 py-2.5"
              style={{
                background: "var(--card-hover)",
                border: "1px solid var(--border-bright)",
              }}
            >
              <div className="text-[1.3rem] leading-none">🔥</div>
              <div
                className="mono text-[1.15rem] font-bold mt-0.5"
                style={{ color: streak > 0 ? "var(--warn)" : "var(--faint)" }}
              >
                {streak}
              </div>
              <div className="label" style={{ fontSize: "0.55rem" }}>
                day streak
              </div>
            </div>
          </div>
          {/* -- THE ONE LINE --------------------------------------- *
           *
           * One sentence, ranked by who is doing the punishing, and
           * silence is a legitimate answer — the one the whole system
           * is trying to earn. It sits above the verse because it is
           * the only thing here that might need acting on today.
           */}
          <div className="min-w-0 basis-full">
            <p
              className="text-[0.92rem] leading-relaxed font-medium"
              style={{
                color:
                  line.kind === "world"
                    ? "var(--bad)"
                    : line.kind === "floor"
                      ? "var(--warn)"
                      : line.kind === "silence"
                        ? "var(--muted)"
                        : "var(--text)",
              }}
            >
              {line.kind !== "silence" && (
                <span className="mono text-[0.62rem] uppercase tracking-[0.1em] mr-2">
                  {line.kind}
                </span>
              )}
              {line.line}
              {line.href && line.kind !== "silence" && (
                <>
                  {" "}
                  <Link
                    href={line.href}
                    className="font-semibold no-underline"
                    style={{ color: "var(--accent)" }}
                  >
                    →
                  </Link>
                </>
              )}
            </p>
          </div>

          {/* The words come last. They are the part he reads, not the part
              he acts on, so they yield the top of the card to the numbers
              and take the whole width once they get there. */}
          <div className="min-w-0 basis-full">
            <blockquote
              className="pl-3 max-w-[62ch] flex items-baseline gap-2.5 flex-wrap"
              style={{ borderLeft: "2px solid var(--accent)" }}
            >
              <span className="text-[0.82rem] italic text-[var(--muted)] leading-relaxed">
                “{verse.v}”
              </span>
              <span className="mono text-[0.62rem] text-[var(--faint)] shrink-0">
                {verse.ref}
              </span>
            </blockquote>
            {creedLine && (
              <blockquote
                className="mt-2 pl-3 max-w-[62ch] flex items-baseline gap-2.5 flex-wrap"
                style={{ borderLeft: "2px solid var(--warn)" }}
              >
                <span className="serif text-[0.88rem] leading-relaxed">
                  {creedLine}
                </span>
                <span className="mono text-[0.62rem] text-[var(--faint)] shrink-0">
                  YOUR OWN HAND
                </span>
              </blockquote>
            )}
          </div>
        </div>

        {/* -- THE BOARD -------------------------------------------- *
         *
         * Below the one line and the pulse, and that order holds: the
         * line says the single thing that needs him today, the pulse
         * says what to do next, and this says how the whole picture
         * stands. Specific first, general after. */}
        {board.length > 0 && (
          <Board
            reports={board}
            title="LIFE_OS · the board"
            href="/life"
            foot="Five areas, each answering one question."
          />
        )}

        {/* EMPIRE, grouped by HOW EACH DIVISION EARNS rather than by
            category — the only filing that can answer the sentence the
            whole thing exists to satisfy, which is printed underneath. */}
        {empireBoard.length > 0 && (
          <Board
            reports={empireBoard}
            title="EMPIRE_OS · the board"
            href="/empire"
            foot={empireShapeLine}
          />
        )}

        {/* -- setup, while anything is missing --------------------- *
         *
         * ONE line, and none at all once it is done. Every module here
         * reports "unmeasured" rather than inventing a zero, which is
         * why the numbers can be trusted — and also why a system with
         * empty tables looks broken instead of hungry. This is the
         * difference, said once.
         *
         * It sits below the advice rather than above it, because it is
         * about making the system better at its job rather than about
         * today. And it vanishes completely when the work is done: a
         * prompt that congratulates you daily for being set up is a
         * prompt you train yourself to skip, and the one line at the top
         * of this card needs that habit intact. */}
        {setupNeeded && (
          <Link
            href="/setup"
            className="panel card-hover no-underline text-[var(--text)] flex items-baseline gap-3"
          >
            <span className="mono text-[0.62rem] uppercase tracking-[0.1em] shrink-0 text-[var(--faint)]">
              Setup
            </span>
            <span className="text-[0.8rem] leading-snug flex-1 min-w-0 text-[var(--muted)]">
              {setupNeeded}
            </span>
            <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">→</span>
          </Link>
        )}

        {/* -- THE COG ---------------------------------------------- *
         *
         * Below the one line, and that order is the design. The line
         * above answers "what is wrong" and is allowed to say nothing
         * is; this answers "what next". Two different questions, two
         * different voices, and the one that reports a lapsed MOT keeps
         * the top of the screen over the one that suggests a good use
         * of the next hour.
         *
         * Behind a flag because this is the first module that writes to
         * a BRAIN table on his behalf rather than surfacing and letting
         * him decide. It fails silently: if the engine cannot read the
         * day, the dashboard is exactly what it was before. */}
        {cogAdvice && <Momentum advice={cogAdvice} />}

        {/* -- weekly review pointer ------------------------------- */}
        <Link
          href="/reviews"
          className="mono text-[0.68rem] font-bold no-underline text-center py-1"
          style={{ color: "var(--accent)" }}
        >
          {reviewText} · optional depth, today has the essentials
        </Link>

        {/* -- the daily close ------------------------------------- */}
        <Link
          href="/checkin"
          className="panel card-hover no-underline text-[var(--text)] flex items-center gap-3"
        >
          <span className="text-[1.1rem] shrink-0" aria-hidden>
            ◫
          </span>
          <span className="min-w-0 flex-1">
            <span className="label block">The daily close</span>
            <span className="text-[0.82rem] text-[var(--muted)] block mt-1 leading-snug">
              {closed
                ? "Tonight is logged. The rest is there if you want it."
                : "Two taps logs today. Everything under that line is optional."}
            </span>
          </span>
          <span
            className="mono text-[0.66rem] shrink-0"
            style={{ color: closed ? "var(--good)" : "var(--faint)" }}
          >
            {closed ? "LOGGED" : "→"}
          </span>
        </Link>

        {/* -- FOCUS · three visible, two on deck ------------------ */}
        <Panel
          title="◎ Focus"
          hint="three, and two behind a drawer"
          action={
            <Link
              href="/capture"
              className="text-[0.74rem] font-semibold no-underline"
              style={{ color: "var(--accent)" }}
            >
              + CAPTURE
            </Link>
          }
        >
          <Focus
            visible={focus.visible.map(toFocusItem)}
            onDeck={focus.onDeck.map(toFocusItem)}
            openTotal={focus.openTotal}
            beyond={focus.beyond}
          />
        </Panel>

        {/* -- TASK LIST · both systems ---------------------------- */}
        <Panel
          title="▤ Task list · what's open"
          action={
            <Link
              href="/planner"
              className="text-[0.74rem] font-semibold no-underline"
              style={{ color: "var(--accent)" }}
            >
              ALL TASKS →
            </Link>
          }
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <TaskColumn
              system="life"
              label="LIFE"
              count={split.life}
              tasks={lifeTasks}
              today={today}
            />
            <TaskColumn
              system="empire"
              label="EMPIRE"
              count={split.empire}
              tasks={empireTasks}
              today={today}
            />
          </div>
          {split.unassigned > 0 && (
            <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
              {split.unassigned} open task
              {split.unassigned === 1 ? "" : "s"} with no area — real work, but
              it has not been told which life it belongs to.
            </p>
          )}
          {dormantTasks.length > 0 && (
            <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
              {dormantTasks.length} dormant — untouched for 30 days, so
              {dormantTasks.length === 1 ? " it has" : " they have"} left the
              counts. Still in{" "}
              <Link
                href="/planner"
                className="font-semibold no-underline"
                style={{ color: "var(--accent)" }}
              >
                Tasks →
              </Link>
            </p>
          )}
        </Panel>
    </>
  );
}

/** Moved with the markup; the page had no other caller. */
function TaskColumn({
  system,
  label,
  count,
  tasks,
  today,
}: {
  system: "life" | "empire";
  label: string;
  count: number;
  tasks: Task[];
  today: string;
}) {
  const colour = system === "life" ? "var(--life)" : "var(--empire)";
  return (
    <div>
      <p
        className="mono text-[0.66rem] font-bold tracking-[0.12em]"
        style={{ color: colour }}
      >
        {label} · {count}
      </p>
      <div className="grid gap-1.5 mt-2.5">
        {tasks.length === 0 ? (
          <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
            Nothing open. Capture adds work without deciding anything.
          </p>
        ) : (
          tasks.map((t) => {
            const d = daysUntil(t.due_date, today);
            return (
              <div key={t.id} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="w-[13px] h-[13px] rounded-[4px] border shrink-0"
                  style={{ borderColor: "var(--border-bright)" }}
                />
                <span className="text-[0.8rem] flex-1 min-w-0 truncate">{t.title}</span>
                {d != null && d <= 7 && (
                  <span
                    className="mono text-[0.62rem] shrink-0"
                    style={{ color: d < 0 ? "var(--bad)" : "var(--warn)" }}
                  >
                    {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "today" : `${d}d`}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
