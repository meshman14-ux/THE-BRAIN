# THE BRAIN — Capture Engine (Module Specification)

**Version:** v1.0 · **Filed:** 17 August 2026 · **Author:** Jay, via the working session
**Status:** OPERATING (conversational), with the sheet path live and the API path deliberately future

This is Jay's module specification, recorded as given, with one addition the system's own
discipline requires: a state-of-implementation table, so the spec never claims more than
exists — stated and actual, kept separate, exactly as `/goals` keeps them.

---

## Purpose

A universal ingestion module that accepts images, documents, handwritten sheets and raw
notes, then processes them into structured Brain entries.

## Inputs

- Photos (handwritten notes, printed sheets, whiteboards)
- Documents (PDF, DOCX, TXT, screenshots)
- Typed notes
- Voice-to-text dumps
- Scanned pages

## Processing pipeline (Claude-powered)

1. **OCR extraction** — all readable text; headings, lists, tasks, dates, numbers, names.
2. **Semantic understanding** — classify what the content relates to.
3. **Entity extraction** — people, dates, money, metrics, locations, document references.
4. **Mapping to Brain fields** — area, module, title, type, description, tasks, dates,
   people, numbers, documents, tags, priority, status.
5. **Structured output** — a clean JSON-like structure per entry.
6. **Confirmation step** — the mapping is shown and confirmed before anything is stored.
   **This step is load-bearing and permanent** — see Security, and §A3 decision 6's law:
   advisory, never autonomous.

## Mapping: spec vocabulary → the real schema

The spec names generic modules; the implementation maps to the tables that actually exist,
because a mapping to a module that does not exist is a capture that goes nowhere.

| Spec says | Actually lands in |
|---|---|
| Life Area | one of the 13 `pillars` |
| Project / Task / Goal | `projects` / `tasks` / `goals` (hierarchy optional — decision 2) |
| Habit | `habits` + `habit_logs` |
| Property | a division (`ventures`) and/or an asset (`assets`) |
| Finance | `debts`, `assets`, `investments`, `opportunities`, or a `metric_readings` row |
| Health | `workouts`, `journal`, `meals`/cooked, `health_days` (companion only) |
| Learning / Knowledge Base / Document | the vault (`notes`), or `inbox` when raw |
| People | `people` (+ `people_contacts`) |

Anything ambiguous goes to the **inbox**, never guessed into a table — the inbox is the
system's own clarify-later queue and captures survive their routing.

## Printable capture sheets — v1, built 17 Aug 2026

Seven A4 sheets, generated pre-filled from the live database so only figures need writing:

| Code | Sheet | Pre-filled with |
|---|---|---|
| BRAIN-D1 | Daily | capture lines · today's three · the close (circle mood/energy) |
| BRAIN-M1 | Money | the 6 real closable creditors by name · the 3 monthly metric boxes |
| BRAIN-V1 | Vehicles | all 4 vehicles + registrations · lapsed-MOT rows shaded |
| BRAIN-H1 | What You Own | the 3 properties · blank investment and deal rows |
| BRAIN-P1 | People | the current roster · blank rows to grow it |
| BRAIN-T1 | Training Week | 8 session rows · deliberately no printed target |
| BRAIN-X1 | Brain Dump | 16 one-thought lines |

Sheet design rules (they are parsing rules as much as print rules):
- The **corner code** identifies sheet + version from the photo before handwriting is read.
- **Blank means not known, never zero** — printed on every sheet; a blank box writes NULL.
- **No passwords, logins or PINs on paper** — printed on every sheet.
- Write-in rows ≥ 10 mm; circle-the-answer wherever possible (circles photograph better
  than digits).
- Regenerate the sheets when entities change (a new creditor, a sold vehicle) and bump the
  corner code version.

## Security rules

- Sensitive data flagged on sight; passwords / bank logins / PINs **rejected, never stored**.
- Redaction requested before processing continues.
- Precedent for sensitive documents already in the family: private storage bucket,
  short-lived signed URLs, never public.

## State of implementation (the honest column)

| Spec section | State | Notes |
|---|---|---|
| Conversational capture (typed/photo/PDF in chat) | **OPERATING** | First guided session ran 17 Aug: 2 vehicle tasks captured, confirmed, written, verified |
| **In-app capture doors** (photo / upload / questionnaire) | **BUILT v1.1, 17 Aug** | `/capture` has four doors: the box, take a photo, upload a document, answer the `/setup` questions. Files land in the private `captures` bucket (owner-only RLS, path prefixed by user id) and an inbox row points at each, so a file joins the same triage queue as a typed thought. Triage shows a 5-minute signed URL — the cog-docs rule. What the app does NOT do is read the file's contents: OCR and mapping remain the conversational engine's job |
| Printable sheets | **BUILT v1** | PDF delivered 17 Aug; photograph-back parsing ready |
| Structured output + confirmation | **OPERATING** | Confirmation before every write, without exception |
| Writes into THE BRAIN | **OPERATING, via the assistant** | Direct database writes with explicit ownership (the `auth.uid()`-is-NULL trap) and a verification read after every write |
| Voice-to-text dumps | works today as typed text | No special handling needed — a dump is a Brain Dump sheet without the paper |
| Auto-create via API / auto-file / auto-tag (Automation, Future) | **DEFERRED, deliberately** | Unattended writes need either a service-role key (which this system has never had, by design) or a standing session. Same trade-off as automatic calendar sync — a conversation to have, not a default to drift into. The confirmation step is not a missing feature of the automation; it is the feature. |

## Dependencies

Claude (this working session or a successor) · the `/capture` route and `inbox` ·
the live Supabase project · the sheet PDFs (regenerable from
`scratchpad/make_capture_sheets.py`'s pattern — regenerate rather than archive).

---

*Changes to this module get a version bump and a dated entry here. v1.0 is the founding
spec as Jay wrote it, plus the implementation-state table.*

*v1.1 — 17 Aug 2026: the in-app capture doors. `/capture` gained the photo, document and
questionnaire doors beside the box; the private `captures` storage bucket was created
(migration `capture_attachments`) with owner-only policies pinned to the bucket; triage
renders each attachment through a 5-minute signed URL. Everything still lands in the inbox
— the four doors share one queue, and the confirmation-at-triage step is untouched.*
