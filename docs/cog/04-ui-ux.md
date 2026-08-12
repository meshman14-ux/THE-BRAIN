# THE COG — UI/UX
### Wireframes, microcopy, interaction spec

Design rule inherited from the v2 dashboard: **the dash is the input**. THE COG adds one card to
the *Now* tab and one feed — no new screens except the 10-second check-in. Palette B "Two
Machines" applies; COG elements use the existing channel colours, EMPIRE flip included.

## 1. Wireframes (ASCII — translate 1:1 into the existing tab layout / Figma)

**Dashboard block (Now tab, top card)**

```
┌─ MOMENTUM ────────────────────────────────────────────────┐
│  ● 73 · rolling                    season: quiet          │
│  ▍▍▍▍▍▍▍▍▍▍▍▍▍▍▍░░░░░   (bar = indicator, channel colour) │
│                                                           │
│  TOP 3                                                    │
│  1 ◻ Train — gym session                 ⓘ  ✓  ✎  ✕     │
│  2 ◻ Chase supplier invoice (overdue)    ⓘ  ✓  ✎  ✕     │
│  3 ◻ Write quarterly reset spec          ⓘ  ✓  ✎  ✕     │
│                                                           │
│  FOCUS  09:00–10:40 · prime · → #3            [start ▸]  │
│  ⚠ running without: sleep — advice adapts, nothing guessed│
└───────────────────────────────────────────────────────────┘
   ⓘ = expand rationale + ruleTrace   ✓ accept  ✎ modify  ✕ reject
```

**Advisor feed (pulse card — one live at a time, below the block)**

```
┌─ DO THIS NEXT ────────────────────────────────────────────┐
│  Keystone first: Train — gym session                      │
│  “Training is the keystone and it isn't done — this       │
│   protects it before the day interferes.”         (N5)   │
│                                                           │
│         [ do it ✓ ]   [ swap ✎ ]   [ not now ✕ ]         │
└───────────────────────────────────────────────────────────┘
```

**Morning check-in (PWA, local-first; raws never leave the device)**

```
┌─ TEN SECONDS ─────────────────────────────┐
│  Energy   ○ ○ ● ○ ○      (1–5)           │
│  Sleep    ○ ● ○ ○ ○      (optional)      │
│  Intent   [ one line, optional        ]   │
│                              [ done ▸ ]   │
└───────────────────────────────────────────┘
```

## 2. Interaction spec — accept / modify / reject

| Action | Gesture | What happens | Events |
|---|---|---|---|
| **Accept** | tap ✓ / "do it" | POST `/cog/feedback {verdict: accepted}` → write-back `tasks.do_date/priority/meta.cog` → card collapses to a ✓ line | `cog.pulse.accepted`, `cog.task.writeback` |
| **Modify** | tap ✎ → inline picker (different task / different time) | POST verdict=modified with `modification` → engine treats the *choice* as the recommendation; no write to the rejected item | `cog.pulse.modified` |
| **Reject** | tap ✕ / "not now" | POST verdict=rejected → next pulse after 30 min; 3rd rejection today silences pulses (N2/FB-5) | `cog.pulse.rejected` |
| **Expand ⓘ** | tap | reveals rationale + fired rules ("why this?") — the explainability contract, one tap deep | — |
| **Ignore** | none for `expiresAt` | verdict=expired (counts toward the acceptance metric denominator) | — |

Latency budgets: verdict tap → visual confirm < 150 ms (optimistic UI), write-back ≤ 2 s.
Offline (PWA): verdicts queue in IndexedDB, flush on reconnect — same queue as capture.

## 3. Daily script templates & microcopy

Tone: **quartermaster, not cheerleader.** Short, concrete, no exclamation marks, no streak-shaming.
The engine reports and suggests; it never scolds. Full rationale templates: `lib/cog/explain.ts`.

- Morning (post check-in): "Momentum {score} — {band}. {top3 count} on the board. Big block at {slot}."
- Low day: "Momentum {score} — low day. Shrink the target, keep the streak."
- Minimum season: "Minimum season: one thing only, and it holds the floor."
- Missing inputs: "Running without: {list}. Advice adapts; nothing is guessed."
- Day won (N8): "Day's won. Bank it — anything more is a bonus, not a debt."
- Pulse fatigue (N2): "Three passes in a row — noted. The report stays; the nudges stop for today."
- Identity drift (I2): "{done} of your last {total} completions touched {pillar} — your stated standard implies more."

Never write: "You failed to…", "Only X% …", "You're behind." Drift is *observed*, not judged —
that principle already runs through the finishes and watchtower features; COG keeps it.
