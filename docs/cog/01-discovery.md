# THE COG — Discovery Artifacts
### Daily Momentum Engine · lives inside THE BRAIN
*Discovery pass — 12 August 2026. Decisions confirmed with Jay in session.*

---

## 1. Decisions locked in discovery

| # | Question | Decision |
|---|---|---|
| 1 | Data sources (pilot) | **All four**: BRAIN tables · Google Calendar · Samsung Health (sleep) · manual morning check-in. Samsung Health is *designed for but degraded-to-fallback* until its data flows. |
| 2 | Privacy | **Local-only sensitive fields.** Raw sleep, mood and energy values stay on-device (IndexedDB in the PWA, optional encryption). Only derived **bands** (`low / medium / high`, 1–5) sync to Supabase. |
| 3 | Stack | **TypeScript inside THE-BRAIN repo** — `lib/cog/*` + Next.js API routes, same Vercel + Supabase deploy, same vitest suite. |
| 4 | ML | **Deterministic only for v1.** Readable rules + configurable weighted scoring. Schema leaves room for learned weights later; nothing depends on them. |
| 5 | Pilot success | All four metrics: usage streak, advice acceptance rate, Top-3 completion rate, keystone + finishes lift. Thresholds in `docs/07-roadmap.md`. |

**Governing principle (inherited from THE BRAIN):** *the command centre reads, the subsystems
write.* THE COG follows it: it **reads** widely, **writes narrowly** — only to its own tables and,
on explicit acceptance, to `tasks` (do_date / priority / meta.cog). It never mutates journal,
habits, season, ventures or reviews.

---

## 2. Inputs inventory & data mapping

| Input | Source | Format | Frequency | Sensitivity | Exists today? |
|---|---|---|---|---|---|
| Tasks | Supabase `tasks` (do_date, due_date, energy, priority, status, project_id, pillar_id) | rows | on demand (advise-time) | normal | ✅ live |
| Habits + keystone | Supabase `habits`, `habit_logs` (`keystone` flag; others `tracked=false`) | rows | daily | normal | ✅ live |
| Journal mood/energy | Device-local raw → synced **band** in `cog_checkins.energy_band` | int band 1–5 | daily (morning) | **sensitive → local-only raw** | ✅ journal live; band split is new |
| Sleep | Samsung Health → device → **band** (`sleep_band` 1–5, derived on device) | int band | daily | **sensitive → local-only raw** | 🔶 structure exists, no data flows |
| Morning check-in | New `/checkin`-style 10-second form (energy, sleep quality, intent) | band ints + one line | daily | sensitive → bands only | 🆕 build in pilot; the reliable fallback |
| Calendar | Google Calendar (read) + day-planner `meta.time` blocks | events (start, end, busy) | advise-time, cached 15 min | normal (titles never stored, only busy/free intervals) | ✅ sync exists |
| Season | `lib/season.ts` — quiet · busy · minimum (declared, not inferred) | enum | on change | normal | ✅ live |
| Workload | Derived: open tasks due ≤7d, calendar load %, active projects | computed | advise-time | normal | ✅ derivable |
| Identity profile | `pillars.standard` + `vision` + new `cog_identity` statements | rows | rarely changes | normal | ✅ pillars/vision live; `cog_identity` new |
| EMPIRE_OS signals | `ventures` (health, dormancy at read time), `opportunities.next_step_date`, finishes rate (`lib/finishes.ts`) | rows/computed | daily | normal | ✅ live |
| Feedback | New `cog_feedback` (accept / modify / reject per recommendation) | rows | per interaction | normal | 🆕 |

**Data-flow rule:** raw sensitive values never cross the device boundary. The PWA computes bands
locally; the server only ever sees `energy_band: 2`. Deleting the local store loses nothing the
engine needs — bands are already synced, raws were never required server-side.

---

## 3. Acceptance criteria (functional)

1. **Daily momentum report** renders by 07:00 local from whatever inputs exist; missing inputs are
   named in the report, never silently guessed.
2. **Top 3 priorities** — each with a 1–2 line rationale citing the rule(s) and signals that put it
   there. In `minimum` season the list caps at 1 (the floor never flexes).
3. **Main focus slot** — the largest free calendar interval ≥ 50 min inside Jay's deep-work window,
   matched to the highest-energy-fit priority. If no such interval: says so and offers a 25-min
   fallback.
4. **Advisor pulse** ("Do this next") — exactly one card at a time, always with rationale, always
   with accept / modify / reject.
5. **Identity alignment check** — compares the last 7 days of completed work against pillar
   standards and identity statements; flags at most 2 drifts, phrased as observations not verdicts.
6. **Micro-actions** — offered when energy band ≤ 2 or free gap < 15 min; each ≤ 5 minutes, drawn
   from real open tasks or keystone support.
7. **Explainability** — `GET /cog/advise` responses carry `rationale` and `ruleTrace[]` on every
   recommendation. No recommendation without a trace.
8. **Two-way sync** — accepting a priority writes `tasks.do_date`/`priority`/`meta.cog` back to
   THE BRAIN within 2 s; BRAIN-side edits are reflected on next advise call (≤ 15 min cache).
9. **Fallbacks** — engine produces a valid (labelled degraded) report with *any* subset of inputs,
   down to tasks-only.
10. **Config** — all scoring weights readable/writable via `cog_config` without redeploy.

## 4. Privacy constraints

- Raw sleep, mood, energy: **device only** (IndexedDB, optional AES-GCM with a locally held key).
- Server stores: bands (1–5), task/calendar *intervals* (busy/free, no titles from Google), rule
  traces, feedback verdicts. Nothing else new.
- Retention: `cog_pulses` and `cog_feedback` kept 180 days then pruned (pilot metrics need 90);
  `cog_checkins` bands kept indefinitely (they are the momentum history). Prune job in migration.
- RLS single-owner policy on every new table, same as the rest of THE BRAIN. Signups remain off.
- No third-party analytics. Telemetry = counts and latencies in `cog_telemetry`, no content.
- Export/delete: `cog_*` tables included in any future export; `DELETE` cascade from user id.

## 5. Risk assessment & fallback rules

| Risk | Likelihood | Impact | Mitigation / fallback rule |
|---|---|---|---|
| Samsung Health never flows during pilot | High | Medium | **FB-1:** `sleep_band` missing → use morning check-in's self-reported sleep; if that's missing too → weight redistributed pro-rata, report labelled "no sleep signal". |
| Morning check-in skipped | Medium | Medium | **FB-2:** energy defaults to yesterday's band decayed toward 3 (neutral); pulse leads with the 10-second check-in as its own first suggestion. |
| Calendar API down / token expired | Medium | Low | **FB-3:** focus slot falls back to day-planner `meta.time` blocks; if none, propose the historical best window (config `fallback_focus_window`, default 09:00–10:30). |
| No tasks with `do_date <= today` | Medium | Low | **FB-4:** advise from due-soon + stale-project tasks and say why; suggest triage as the pulse. |
| Advice fatigue (pulses ignored) | Medium | High | **FB-5:** if 3 consecutive pulses rejected/ignored, engine goes quiet for the day except the report; logged for the pilot's acceptance metric. |
| Two-way sync conflict (task edited both sides) | Low | Medium | Reconciliation policy in `docs/05-integration.md`: field-level, BRAIN wins on content fields, COG wins only on `meta.cog.*`, every conflict logged. |
| Over-engineering vs. Jay's "perfect the system first" | High | High | v1 ships behind one dashboard card + one API; no new required rituals beyond the 10-second check-in. |
| Local-only raws lost (device reset) | Low | Low | Bands are already synced; engine never needed raws. Document clearly. |

**Missing-input degradation ladder** (worst → still works):
`all inputs` → `no sleep` → `no check-in` (decayed energy) → `no calendar` (planner blocks) →
`tasks only` (priorities + pulse, no focus slot, report labelled *degraded: tasks-only*).
