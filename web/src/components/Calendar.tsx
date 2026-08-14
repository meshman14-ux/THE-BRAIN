"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Pillar, type Task, PRIORITY_COLOUR, DAY_LABELS } from "@/lib/types";
import {
  BRAIN_CALENDAR_NAME,
  monthAgenda,
  monthGrid,
  monthLabel,
  shiftMonth,
  tasksByDay,
  type CalendarLink,
  type ConnectionState,
} from "@/lib/calendar";
import { formatDayLong } from "@/lib/logic";
import { Panel, Empty, Tag } from "@/components/ui";

/**
 * The calendar page.
 *
 * Three things, in the order they matter: anything waiting on a decision,
 * the state of the connection, and the month itself. Conflicts come first
 * because a conflict is the one thing here that will not resolve itself —
 * everything else is either already synced or will be on the next pass.
 */
export default function Calendar({
  state,
  missing,
  calendarName,
  lastSyncAt,
  lastError,
  today,
  tasks,
  links,
  pillars,
  notice,
  error,
}: {
  state: ConnectionState;
  missing: string[];
  calendarName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  today: string;
  tasks: Task[];
  links: CalendarLink[];
  pillars: Pick<Pillar, "id" | "name" | "emoji" | "system">[];
  notice: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(`${today.slice(0, 7)}-01`);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const grid = useMemo(() => monthGrid(anchor, today), [anchor, today]);
  // The phone's view of the same month. Built from the same anchor as the
  // grid, so the two can never end up showing different days.
  const agenda = useMemo(
    () => monthAgenda(anchor, today, tasks),
    [anchor, today, tasks]
  );
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const pillarById = useMemo(
    () => new Map(pillars.map((p) => [p.id, p])),
    [pillars]
  );
  const linkByTask = useMemo(() => {
    const m = new Map<string, CalendarLink>();
    for (const l of links) if (l.task_id) m.set(l.task_id, l);
    return m;
  }, [links]);
  const conflicts = useMemo(() => links.filter((l) => l.conflict), [links]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const connected = state === "connected" || state === "error";

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setFailure(null);
    setLine(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFailure(json.error ?? `That didn't work (${res.status}).`);
        return null;
      }
      if (json.line) setLine(json.line);
      if (Array.isArray(json.errors) && json.errors.length > 0) {
        setFailure(json.errors.join(" · "));
      }
      router.refresh();
      return json;
    } catch (e) {
      setFailure((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">Calendar</p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">
            {formatDayLong(today)}
          </p>
          <Link
            href="/week"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            PLAN THE WEEK →
          </Link>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          Two-way sync
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          Tasks with a <b>do</b> date appear in a calendar of their own called
          “{BRAIN_CALENDAR_NAME}”. Move one there and it moves here; delete one
          there and the task is unscheduled, never deleted. THE BRAIN never
          writes to your main calendar.
        </p>
      </header>

      {/* -- what is waiting on a decision ------------------------- */}
      {conflicts.length > 0 && (
        <Panel
          title="Waiting on you"
          hint={`${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}`}
        >
          <p className="text-[0.8rem] text-[var(--muted)] leading-relaxed">
            Both sides moved since they last agreed, so nothing has been
            changed. Pick the one that is right — the system will not guess.
          </p>
          <div className="grid gap-1.5">
            {conflicts.map((l) => {
              const t = l.task_id ? taskById.get(l.task_id) : null;
              return (
                <div
                  key={l.id}
                  className="rounded-[10px] border px-3.5 py-3 grid gap-2"
                  style={{ borderColor: "var(--warn)" }}
                >
                  <p className="text-[0.88rem] font-medium leading-snug">
                    {t?.title ?? "A task that has since gone"}
                  </p>
                  <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
                    {l.conflict_note ?? "Both sides changed."}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        post("/api/calendar/resolve", {
                          linkId: l.id,
                          choice: "keep_mine",
                        })
                      }
                    >
                      Keep {t?.do_date ?? "mine"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        post("/api/calendar/resolve", {
                          linkId: l.id,
                          choice: "keep_google",
                        })
                      }
                    >
                      Keep Google&apos;s
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* -- the connection ---------------------------------------- */}
      <Panel
        title="Connection"
        hint={connected ? (calendarName ?? BRAIN_CALENDAR_NAME) : "not connected"}
        action={
          connected ? (
            <button className="btn" disabled={busy} onClick={() => post("/api/calendar/sync")}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
          ) : undefined
        }
      >
        {state === "unconfigured" && (
          <div className="grid gap-2.5">
            <p className="text-[0.85rem] leading-relaxed">
              The server has no Google client configured, so there is nothing
              to connect to yet. This is the one part of THE BRAIN that cannot
              be built without something only you can create.
            </p>
            <ol className="text-[0.82rem] text-[var(--muted)] leading-relaxed grid gap-1.5 pl-5 list-decimal">
              <li>
                In Google Cloud Console: make a project, enable the{" "}
                <b>Google Calendar API</b>, and create an <b>OAuth client ID</b>{" "}
                of type <i>Web application</i>.
              </li>
              <li>
                Add the redirect URI{" "}
                <code className="mono text-[0.78rem]">
                  &lt;your site&gt;/api/calendar/callback
                </code>{" "}
                — both the live URL and{" "}
                <code className="mono text-[0.78rem]">http://localhost:3000</code>{" "}
                if you want it working locally.
              </li>
              <li>
                Put the three values below in Vercel (and{" "}
                <code className="mono text-[0.78rem]">.env.local</code>), then
                redeploy.
              </li>
            </ol>
            <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-3.5 py-3">
              <p className="label">Still missing</p>
              <ul className="grid gap-1 mt-1.5">
                {missing.map((k) => (
                  <li key={k} className="mono text-[0.8rem]">
                    {k}
                    {k === "CALENDAR_TOKEN_SECRET" && (
                      <span className="text-[var(--faint)]">
                        {" "}
                        — any long random string; it encrypts the stored tokens
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
              Nothing is broken until then. The rules that drive the sync are
              built and tested; this is the key to the door.
            </p>
          </div>
        )}

        {state === "disconnected" && (
          <div className="grid gap-3">
            <p className="text-[0.85rem] leading-relaxed">
              Configured and ready. Connecting sends you to Google&apos;s own
              consent screen — THE BRAIN never sees your password, and it asks
              only for permission to manage calendars it created itself.
            </p>
            {/* A real navigation, not a client-side one: this is a ROUTE
                HANDLER that 302s to Google's consent screen. <Link> would
                intercept it and never leave the app. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/calendar/connect" className="btn no-underline justify-self-start">
              Connect Google Calendar
            </a>
          </div>
        )}

        {connected && (
          <div className="grid gap-2.5">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[0.82rem]">
              <span className="text-[var(--muted)]">
                Writing to{" "}
                <b className="text-[var(--text)]">
                  {calendarName ?? BRAIN_CALENDAR_NAME}
                </b>
              </span>
              <span className="text-[var(--muted)]">
                Last sync{" "}
                <b className="mono text-[var(--text)]">
                  {lastSyncAt ? lastSyncAt.slice(0, 16).replace("T", " ") : "never"}
                </b>
              </span>
              <span className="text-[var(--muted)]">
                {links.length} event{links.length === 1 ? "" : "s"} mapped
              </span>
            </div>
            {state === "error" && lastError && (
              <p className="text-[0.8rem] leading-relaxed" style={{ color: "var(--bad)" }}>
                Last sync reported: {lastError}
              </p>
            )}
            <form action="/api/calendar/disconnect" method="post">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => post("/api/calendar/disconnect")}
              >
                Disconnect
              </button>
            </form>
            <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
              Disconnecting withdraws the permission and forgets the tokens. It
              leaves every event where it is and every task where it is.
            </p>
          </div>
        )}

        {(line || failure || notice || error) && (
          <div className="grid gap-1">
            {line && (
              <p className="text-[0.8rem]" style={{ color: "var(--good)" }}>
                {line}
              </p>
            )}
            {notice && (
              <p className="text-[0.8rem]" style={{ color: "var(--good)" }}>
                {notice === "new"
                  ? `Connected, and a calendar called “${BRAIN_CALENDAR_NAME}” was created for it.`
                  : `Connected to the existing “${BRAIN_CALENDAR_NAME}” calendar.`}
              </p>
            )}
            {(failure || error) && (
              <p className="text-[0.8rem]" style={{ color: "var(--bad)" }}>
                {failure ?? noticeForError(error!)}
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* -- the month --------------------------------------------- */}
      <Panel
        title={monthLabel(anchor)}
        hint={`${tasks.length} scheduled`}
        action={
          <span className="flex gap-1.5">
            <button
              className="chip"
              onClick={() => setAnchor(shiftMonth(anchor, -1))}
              aria-label="Previous month"
            >
              ←
            </button>
            <button className="chip" onClick={() => setAnchor(`${today.slice(0, 7)}-01`)}>
              Today
            </button>
            <button
              className="chip"
              onClick={() => setAnchor(shiftMonth(anchor, 1))}
              aria-label="Next month"
            >
              →
            </button>
          </span>
        }
      >
        {tasks.length === 0 ? (
          <Empty cta={{ href: "/week", label: "Give something a day" }}>
            Nothing has a do-date inside the sync window. A task with a day on
            it is a plan; a task without one is an intention, and the calendar
            only carries plans.
          </Empty>
        ) : (
          <>
            {/* -- the phone's month: the days that carry work ------- *
             *
             * Seven readable columns need about 560px. Below that the grid
             * was scrolling sideways inside its own box, which put Friday,
             * Saturday and Sunday behind a swipe nobody would guess was
             * there. Squeezing the cells instead would have given him a
             * month he could see and not read. So the phone gets the same
             * days as a list — same span, same tasks, same dots — and the
             * grid returns the moment there is room for it.
             */}
            <div className="sm:hidden grid gap-3.5">
              {agenda.map((day) => (
                <div key={day.iso} className="grid gap-1.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p
                      className="label"
                      style={{ color: day.isToday ? "var(--accent)" : undefined }}
                    >
                      {formatDayLong(day.iso)}
                    </p>
                    {day.isToday && (
                      <span
                        className="mono text-[0.64rem]"
                        style={{ color: "var(--accent)" }}
                      >
                        today
                      </span>
                    )}
                    {!day.inMonth && (
                      <span className="mono text-[0.64rem] text-[var(--faint)]">
                        {monthLabel(day.iso).split(" ")[0]}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1">
                    {day.tasks.map((t) => {
                      const p = t.pillar_id ? pillarById.get(t.pillar_id) : null;
                      const synced = linkByTask.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className="rounded-[9px] border px-3 py-2 flex items-baseline gap-2"
                          style={{ borderColor: PRIORITY_COLOUR[t.priority] }}
                        >
                          {!synced && (
                            <span
                              aria-hidden
                              className="text-[0.7rem] shrink-0"
                              style={{ color: "var(--faint)" }}
                            >
                              •
                            </span>
                          )}
                          {/* No truncation here — there is a whole row for
                              it, and a half-read task is not a task. */}
                          <span
                            className="text-[0.85rem] leading-snug min-w-0 flex-1"
                            style={{
                              textDecoration:
                                t.status === "done" ? "line-through" : "none",
                              opacity: t.status === "done" ? 0.6 : 1,
                            }}
                          >
                            {t.title}
                          </span>
                          {p && (
                            <span className="text-[0.7rem] text-[var(--faint)] shrink-0">
                              {p.emoji} {p.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* -- the month itself, once there is room for it ------- */}
            <div className="hidden sm:block overflow-x-auto">
              <div className="min-w-[560px]">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_LABELS.map((d) => (
                  <p key={d} className="label text-center">
                    {d}
                  </p>
                ))}
              </div>
              <div className="grid gap-1">
                {grid.map((week) => (
                  <div key={week[0].iso} className="grid grid-cols-7 gap-1">
                    {week.map((day) => {
                      const on = byDay[day.iso] ?? [];
                      return (
                        <div
                          key={day.iso}
                          className="rounded-[9px] border p-1.5 min-h-[74px]"
                          style={{
                            borderColor: day.isToday
                              ? "var(--accent)"
                              : "var(--border)",
                            opacity: day.inMonth ? 1 : 0.42,
                            background: day.isToday
                              ? "var(--accent-soft)"
                              : "transparent",
                          }}
                        >
                          <p className="mono text-[0.66rem] text-[var(--faint)]">
                            {day.iso.slice(8)}
                          </p>
                          <div className="grid gap-0.5 mt-0.5">
                            {on.slice(0, 3).map((t) => {
                              const p = t.pillar_id
                                ? pillarById.get(t.pillar_id)
                                : null;
                              return (
                                <span
                                  key={t.id}
                                  title={`${t.title}${p ? ` · ${p.name}` : ""}${
                                    linkByTask.has(t.id) ? "" : " · not synced yet"
                                  }`}
                                  className="text-[0.68rem] leading-tight truncate px-1 py-[1px] rounded-[4px] border"
                                  style={{
                                    borderColor: PRIORITY_COLOUR[t.priority],
                                    textDecoration:
                                      t.status === "done" ? "line-through" : "none",
                                    opacity: t.status === "done" ? 0.6 : 1,
                                  }}
                                >
                                  {linkByTask.has(t.id) ? "" : "• "}
                                  {t.title}
                                </span>
                              );
                            })}
                            {on.length > 3 && (
                              <span className="text-[0.64rem] text-[var(--faint)]">
                                +{on.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              </div>
            </div>
          </>
        )}
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          A dot means the task has not reached Google yet — it goes on the next
          sync. Struck through means done; finished work keeps its slot,
          because the calendar is also a record of what actually happened.
        </p>
      </Panel>

      {/* -- what is mapped ---------------------------------------- */}
      {connected && links.length > 0 && (
        <Panel title="Mapped to events" hint="task ↔ event, with etag">
          <div className="grid gap-1.5">
            {links.slice(0, 12).map((l) => {
              const t = l.task_id ? taskById.get(l.task_id) : null;
              return (
                <div
                  key={l.id}
                  // `min-w-0` on the ROW. The panel above already has one and
                  // the task title below already has one, and neither helps:
                  // `truncate` is `white-space: nowrap`, so the title still
                  // contributes its entire unbroken string to THIS row's
                  // min-content, and the row is a grid item of the `div.grid`
                  // above with a default `min-width: auto`. That pushed the
                  // page 232px sideways at 390 wide.
                  className="min-w-0 flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2"
                >
                  <span className="text-[0.84rem] min-w-0 flex-1 truncate">
                    {t?.title ?? "(task outside the window)"}
                  </span>
                  {l.conflict && <Tag colour="var(--warn)">conflict</Tag>}
                  <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                    {(l.event_start ?? "").slice(0, 10) || "—"}
                  </span>
                </div>
              );
            })}
          </div>
          {links.length > 12 && (
            <p className="text-[0.72rem] text-[var(--faint)]">
              …and {links.length - 12} more.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

/** Turn a callback error code into something worth reading. */
function noticeForError(code: string): string {
  if (code === "declined") return "You declined at Google's consent screen. Nothing was connected.";
  if (code === "state") return "That connection attempt expired or did not start here. Try again.";
  if (code === "unconfigured") return "The server has no Google client configured yet.";
  return `Google said: ${code}`;
}
