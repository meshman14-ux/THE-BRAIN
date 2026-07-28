# THE BRAIN — Android

The native Android app for THE BRAIN: an offline-first personal hub with
**Notes, Tasks, Habits, and Links**, built with Kotlin + Jetpack Compose.

> Status: **v1 scaffold.** All four modules are wired end-to-end (UI → ViewModel
> → Repository → Room), with example unit tests. Ledger (the AI oracle) is
> planned for the next phase.

## Open & run

1. Install **Android Studio** (latest stable — Ladybug or newer).
2. **File → Open** and select this `android/` folder (not the repo root).
3. First sync downloads Gradle 8.9, the Android SDK bits, and dependencies. If
   prompted to install SDK Platform 34, accept.
4. Android Studio generates the Gradle wrapper on first open. (From a terminal
   you can instead run `gradle wrapper` once, then `./gradlew assembleDebug`.)
5. Pick a device/emulator (Android 12 / API 31+) and press ▶ **Run**.

> This project targets **minSdk 31 / targetSdk 34** and uses **Material You**
> dynamic color, falling back to THE BRAIN's blue→violet brand palette.

## Architecture

Clean, layered MVVM with unidirectional data flow. Dependencies point downward.

```
UI (Compose)  →  ViewModel (StateFlow<UiState>)  →  Domain (models + Repository interfaces)  →  Data (Room)
```

- **Offline-first:** Room is the single source of truth. Screens observe
  `Flow`s, so the UI updates automatically on any data change. No network in v1.
- **DI:** Hilt provides the database, DAOs, and binds repository interfaces to
  their Room implementations (`core/di`).
- **Testable:** because the UI depends on repository *interfaces*, ViewModels are
  tested with hand-written fakes — no device, no database (see
  `app/src/test/...`).

### Package layout

```
com.meshman.thebrain/
├── core/
│   ├── db/          AppDatabase
│   ├── di/          Hilt modules (Database, Repository)
│   ├── navigation/  Routes, TopLevelDestination, NavHost
│   ├── ui/          theme (Material You) + shared components
│   └── util/        date + time helpers
└── feature/
    ├── notes/   { data · domain · ui }
    ├── tasks/   { data · domain · ui }
    ├── habits/  { data · domain · ui }
    ├── links/   { data · domain · ui }
    └── home/    { ui }   ← dashboard aggregating the others
```

Each feature is a vertical slice: its own entity/DAO/repository/ViewModel/screens.

## Tests

```
./gradlew test        # runs the JVM unit tests
```

Included examples:
- `HabitStreakTest` — pure streak math (current, longest, week strip).
- `TaskGroupingTest` — Today / Upcoming / Done bucketing.
- `NotesViewModelTest` — ViewModel with a fake repository + Turbine.

## What's next (later phases)

- **Ledger (AI):** a `feature/ledger` slice calling the Anthropic API, with the
  key stored **encrypted** (Android Keystore) — the safe replacement for the web
  version's plaintext key. Can later read your notes/tasks (RAG).
- **Migrations:** replace `fallbackToDestructiveMigration()` with real Room
  migrations before any release (so updates don't wipe data).
- **Widgets, reminders, cloud sync** — all slot in above the offline core.

## Note on versions

`gradle/libs.versions.toml` pins a known-good, mutually compatible dependency
set. Android Studio may suggest newer versions; upgrade deliberately, one at a
time, and re-run the build.
