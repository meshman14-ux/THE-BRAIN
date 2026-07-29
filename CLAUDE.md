# THE BRAIN — working standard & architecture

## The standard (Jay's rule — always apply)
The marginal cost of completeness is near zero. Do the whole thing. Do it right.
- Ship the finished product, not a plan to build it. When Jay asks for something, deliver the working result.
- Never offer to "table it for later" when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists.
- Search before building. Test before shipping. Document as you go.
- The bar is "holy shit, that's done" — not "good enough". No excuses for time, fatigue, or complexity.

## What THE BRAIN is
A single front-door OS unifying Jay's personal life (LIFE_OS) and business (EMPIRE_OS). One app, two modes: light theme = LIFE, dark = EMPIRE, toggled from the top bar. Built as one Design Component: `THE BRAIN.dc.html`.

## Views (state.view)
`brain` (Command Centre) · `report` (Daily Sheet, ☀) · `weekly` (Weekly Report, ▦) · `reminders` · `review` (Weekly Review) · `diag` (My Profile) · `docs` · `command` (Life/Empire Command, per mode) · `board` · `cash` · `inbox` (Paper Inbox) · `tasks` · `property` · phone-fast view.

## Data — all localStorage, one store per concern
- `lifeos-tasks-v1` — tasks `{id,title,tag,when('today'|'week'),priority,due,done,doneAt,reason}`
- `brain-reminders-v1` — reminders `{id,text,kind,date,time,recurDays,taskId,billId,done}`
- `brain-inbox-v1` — bills `{id,payee,amount,due,paid}`
- `brain-settings-v1` — real numbers `{debtStart,debtBalance,debtPayment,rentBed,rentTre,constraint}`
- `brain-checkin-v1` (per date: steps/sleep/weight/trained/dev, plus Samsung-imported activeMin/actCal/totalCal/distKm), `brain-habits-v1`, `brain-moods-v1`, `brain-water-v1` (per date: glasses, goal 8), `brain-mindful-v1` (per date: focus minutes, +25 per completed session), `brain-shealth-v1` (imported Samsung Health screenshots: {date, steps, activeMin, actCal, totalCal, distKm, thumb}), `brain-ritual-v1` (streak/energy/three), `brain-dayplan-v1`, `brain-diary-v1` (per date, per hour), `brain-profile-v1`, `brain-docs-v1`, `brain-coach-v1`, `brain-reviews-v1`, `brain-cash-v1`, `brain-prodlog-v1`.
- Backup/restore (`exportBackup`/`importBackup`, sidebar footer) exports/imports **every** store above as one JSON — keep the `keys` array in `exportBackup` in sync when adding a store.
- **Samsung Health import** (`importSamsung`): the "⤓ Import Samsung Health" button on the Life health board accepts screenshot images (multi-select) OR csv/json. Images are OCR'd with Tesseract.js (loaded from CDN in the helmet), parsed by `_parseSHealth` (date + steps/active-min/activity-cal/total-cal/distance), filed to the screenshot's own date via `setCheckinFor`, and thumbnailed into the `brain-shealth-v1` gallery. Requires network once to load the OCR engine; csv/json path works offline.

## Cross-system links (keep bidirectional)
- Reminder ↔ Task (`taskId`): ticking either completes the other; task rows show 🔔, reminder rows show a task chip.
- Reminder ↔ Bill (`billId`): ticking a bill's reminder marks it paid; marking a bill paid closes its reminders.
- Bills auto-create a FIN task when filed.

## Bhagavad Gita layer
Single source: `GITA` array + `_verse(offset)` = deterministic verse-of-the-day (rotates daily). Surfaced (offset-varied so they differ) on: Command Centre, Life & Empire command hero lines + the inspiration widget (`↻ NEXT` cycles via `state.qIx`), phone NOW tab, and both printable reports' footers. To add verses, extend `GITA` only.

## Reports (print to A4, black-on-white)
- **Daily Sheet** (`_reportVals`): daily-only — clear-this-first (binding constraint), coach line, Today's Three + overload warning, due-today reminders/bills, full 06:00–22:00 hour-by-hour diary (priorities auto-placed, open slots writable & persisted to `brain-diary-v1`), verse footer.
- **Weekly Report** (`_weeklyReportVals`): completed-this-week (by `doneAt` within Mon–Sun), upcoming, goals & progress bars, habits 7-day, health week averages, verse footer.
Print CSS lives in the helmet `@media print` block; `.print-report` is the printable sheet, `.noprint` hides screen chrome.

## Conventions
- Inline styles only; theme via CSS vars (`--bg/--card/--line/--tx1..4/--tint*`). Mono labels use `.bMono`.
- Tag→system/colour maps: `TAGSYS`, `TAGCOL`. Priority map: `PRI`.
- Respect Jay's rules: no beef in any recipe/food suggestion; GBP £ everywhere; faith/Gita content is welcome.
