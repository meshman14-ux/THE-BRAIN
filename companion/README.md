# THE BRAIN · Companion

Stage two of the Samsung Health ingest path: **zero taps after setup.**
Samsung Health syncs into Health Connect on the phone; this app reads
Health Connect twice a day and upserts `health_days` in Supabase —
**as Jay, through his own session, against RLS. No service keys.**

Verified on the build machine: compiles clean (Gradle 8.9 · AGP 8.6.1 ·
Kotlin 2.0.20 — the same toolchain as `../android/`), 11 JVM unit tests
green on the aggregation and payload rules, debug APK builds.
**Never yet run on a phone** — that first run is the remaining
verification, and this file is honest about it.

## One-time setup

### 1 · Supabase (once, in the dashboard)
Add the app's landing scheme to **Authentication → URL Configuration →
Redirect URLs**:

    thebrain://auth

Same move as adding `http://localhost:3000/**` for local web sign-in.
Without it the magic link cannot come back to the app.

### 2 · Install on the phone
Open `companion/` in Android Studio, plug the phone in (USB debugging
on), press Run. Or from a terminal:

    cd companion
    gradlew assembleDebug
    adb install app/build/outputs/apk/debug/app-debug.apk

### 3 · In Samsung Health
Settings → Health Connect → turn syncing ON for steps, sleep, weight
(and anything else wanted). Samsung Health only shares what it is told
to.

### 4 · In the app (once)
1. Enter the email → **Send magic link** → open the email **on the
   phone** → tap the link. It lands straight back in the app.
2. **Grant Health Connect access** → tick the data types.
3. **Sync now** to prove the pipe. After that, it syncs itself twice a
   day (WorkManager, last-7-days window, idempotent).

## What it writes

One row per local day into `health_days`, `source = "health_connect"`,
carrying **only the fields observed** — the same no-clobber guarantee as
the web CSV importer: a hand-typed weight survives a sync that only
brought steps. Rules (mirrored from `web/src/lib/samsung.ts`, both
halves tested):

- steps and active minutes via Health Connect's own per-day aggregate
  (it de-duplicates multiple source apps natively)
- a night belongs to the morning it ends in; fragments sum; backwards
  sessions are refused
- the last weight of the day wins
- meals sum
- **rMSSD** — the field the readiness band has been waiting for —
  averages the day's samples; only written when the watch actually
  measured it
- resting HR takes the last explicit reading, never a derivation from
  raw samples

## What it deliberately does not do

- No writes to Health Connect. Read-only, one direction.
- No service keys, no server. Four HTTP calls, all as Jay's session.
- No foreground service, no battery drama — WorkManager's twice-daily
  window is enough for numbers that are read at most once a day.
