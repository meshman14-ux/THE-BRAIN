# THE COG ↔ THE BRAIN — Two-way sync
### Event schema, webhooks, reconciliation · 12 August 2026

Because THE COG lives *inside* THE BRAIN's app and database, "sync" is not network plumbing — it is
a **contract about who may write what, carried by events** so every cross-boundary change is
auditable and replayable. Events are rows in `cog_events` (outbox pattern); a webhook dispatcher is
included for the day any part moves out-of-process.

## 1. Write ownership

| Field family | Owner | The other side may |
|---|---|---|
| `tasks.title/notes/status/due_date` | BRAIN | read |
| `tasks.do_date`, `tasks.priority` | BRAIN | **COG may write on accepted verdict only** |
| `tasks.meta.cog.*` (score, lastRank, pulseId) | COG | read |
| `habits`, `journal`, `season`, `reviews`, `ventures` | BRAIN | read only, ever |
| `cog_*` tables | COG | BRAIN dashboard reads `cog_states`, `cog_pulses` |

## 2. Event envelope (all events)

```json
{
  "id": "evt_01J...ULID",
  "type": "cog.pulse.accepted",
  "occurredAt": "2026-08-13T07:42:11.312Z",
  "correlationId": "cor_01J...",
  "causationId": "evt_01H... | null",
  "actor": "cog-engine | user | brain",
  "version": 1,
  "payload": { }
}
```

- `correlationId` threads one recommendation through its whole life:
  advise → pulse → feedback → task write-back → next-day outcome.
- `causationId` = the event that directly caused this one (audit chain).
- Events are immutable; consumers must be idempotent on `id`.

## 3. Event catalogue

**COG emits** (BRAIN dashboard / future services consume):

| type | payload |
|---|---|
| `cog.state.built` | `{date, momentumIndicator, missingInputs[]}` |
| `cog.pulse.issued` | `{pulseId, kind, refId}` |
| `cog.pulse.accepted` / `.modified` / `.rejected` | `{pulseId, verdict, modification?}` |
| `cog.task.writeback` | `{taskId, fields: ["do_date","priority","meta.cog"], before, after}` |
| `cog.microaction.done` | `{microActionId, refTaskId}` |

**BRAIN emits** (COG consumes to invalidate cached state):

| type | payload |
|---|---|
| `brain.task.updated` | `{taskId, fields[]}` |
| `brain.checkin.completed` | `{date}` (the existing /checkin daily close) |
| `brain.season.changed` | `{from, to, declaredAt}` |
| `brain.habit.logged` | `{habitId, doneOn, keystone: true|false}` |

In-process today these are Postgres rows + a `NOTIFY cog_events`; the dispatcher in
`lib/cog/events.ts` also POSTs to `COG_WEBHOOK_URL` if set:

```http
POST {COG_WEBHOOK_URL}
X-Cog-Signature: hex(hmac-sha256(body, COG_WEBHOOK_SECRET))
X-Cog-Event-Id: evt_01J...
Content-Type: application/json

{ ...envelope }
```

Retry: 3 attempts, exponential backoff (1 s/10 s/60 s), then parked in `cog_events.dead=true`.

## 4. Reconciliation algorithm

Runs at advise-time (and on `brain.task.updated`), comparing COG's last write-back intent with the
current BRAIN row:

```
for each task COG wrote back in the last 48h:
  brainRow = current tasks row
  cogIntent = last cog.task.writeback.after
  if brainRow.updated_at <= writeback.occurredAt: nothing changed → done
  else, field by field:
    content fields (title, notes, status, due_date):  BRAIN WINS unconditionally
    do_date, priority:
      if user changed them in BRAIN after the write-back → BRAIN WINS
        (that IS feedback: record implicit verdict "modified" in cog_feedback)
      COG never re-writes a field the user has touched since — a task becomes
      "user-steered" for cooldown_days (config, default 3)
    meta.cog.*: COG WINS (its own namespace)
  every divergence → cog_events: cog.reconcile.resolved {taskId, field, winner}
```

**Policy in one line:** *BRAIN (the human) wins everything except COG's own namespace, and a human
override is treated as feedback, not as a conflict.* No merge dialogs, ever — this is a
single-user system; the only "conflict" possible is Jay disagreeing with the engine, and the
engine's job then is to learn the pattern (v2) and stay quiet (v1 cooldown).

## 5. Ordering & idempotency guarantees

- Single writer per side; events carry ULIDs so ordering is sortable.
- Write-backs are conditional updates: `UPDATE tasks SET ... WHERE id=$1 AND updated_at=$2`
  (optimistic concurrency). A miss ⇒ re-run reconciliation, never blind overwrite.
- Replaying the full `cog_events` log from empty `cog_*` tables reproduces current COG state
  (tested by the simulation harness's replay mode).
