# leettui

## What This Is

leettui is a terminal UI for solving LeetCode problems without leaving the terminal:
browse the problem set, solve in 10+ languages, run an offline local test harness,
run/submit to LeetCode, and git-back-up your solutions. This milestone adds a
**submission history & analytics** layer: leettui backfills your LeetCode submission
history into its local SQLite store and surfaces it as per-problem history plus a
global **progress dashboard** focused on consistency and trajectory.

## Core Value

A LeetCode user grinding in the terminal can open one view and instantly see whether
they're improving and keeping it up — solve streak, recent counts, and breakdown by
difficulty/topic — backed by their real submission history, owned locally.

## Requirements

### Validated

<!-- Inferred from the existing codebase (see .planning/codebase/). These ship and are relied upon. -->

- ✓ Browse the LeetCode problem set via a local SQLite mirror (lazygit-style panels, topics + questions) — existing
- ✓ Solve problems in 10+ languages with `$EDITOR`/workspace handoff — existing
- ✓ Offline local test harness (python/node/bun + compiled rust/csharp/java), demand-driven type support — existing
- ✓ Run/submit to LeetCode via the unofficial GraphQL + REST API, with inline results — existing
- ✓ Cookie-based auth (Firefox import → guided paste), validated and persisted to TOML config — existing
- ✓ Solution git backup/restore (lazygit delegation, `gh`-based remote wizard, clone/pull sync) — existing
- ✓ Recently-viewed history modal, daily challenge, "what's new" changelog, theming, self-update — existing
- ✓ Backfill the user's existing LeetCode submission history into the local SQLite store (status, language, runtime, memory, timestamp, per problem) — Validated in Phase 1: Submission Store & Backfill
- ✓ Persist new submissions made through leettui to the same store going forward (hybrid: backfill once, then append) — Validated in Phase 1: Submission Store & Backfill
- ✓ Backfill degrades gracefully when the unofficial API is unavailable or partial (never a crash; resumable) — Validated in Phase 1: Submission Store & Backfill
- ✓ Per-problem submission history surfaced in ProblemView (every attempt, best vs latest, runtime/memory/percentile when available) — Validated in Phase 2: Per-Problem History & Browse Badge
- ✓ Browse question list shows a "solved/attempted before" attempt-count badge derived from submission history — Validated in Phase 2: Per-Problem History & Browse Badge
- ✓ Local test-case expected outputs manageable without hand-writing files: `leettui test --save` blesses the current run's stdout into `case-NN.out` (golden snapshot) and `leettui test --add-case` writes the next sequential input from stdin/file, so offline `leettui test` grades real pass/fail — Validated in Phase 2.1: Local Test-Case Output Management
- ✓ Failing run/submit cases auto-captured into offline regression tests: a wrong-answer (or RE/TLE/MLE) verdict writes the failing LeetCode input + expected output into `tests/case-NN.txt`/`case-NN.out` (deduped, never-overwriting), completed runs bless missing `.out`s from LeetCode's authoritative outputs, and a dim capture note surfaces in both TUI and CLI result views (TCASE-04/TCASE-05) — Validated in Phase 2.2: Auto-Capture Failing Cases
- ✓ Global progress dashboard as a new top-level view (`p` from browse or problem view → full-screen `"dashboard"` mode, returns to origin), north-starred on consistency & trajectory (DASH-01) — Validated in Phase 3: Progress Dashboard
- ✓ Dashboard shows solve streak (current + longest), recent 7d/30d solve counts, a rolling 30-day consistency score, a 52-week × 7-day activity heatmap, a 12-week problems-per-week trend sparkline, and a solved-by-difficulty (Easy/Medium/Hard) breakdown — all from the local store, offline (DASH-02–DASH-07) — Validated in Phase 3: Progress Dashboard. Note: the early hypothesis's "breakdown by topic" was not part of the shipped requirement set (difficulty breakdown only); topic breakdown remains a possible later addition.

### Active

<!-- This milestone. Hypotheses until shipped and validated. -->

- _(none — all v1.0 milestone requirements are validated; see Validated above. Phase 3 was the final phase of this milestone.)_

### Out of Scope

- Beat-your-best percentile optimization as the headline experience — chosen focus is consistency/trajectory, not competitive perf chasing (percentile data is still stored per submission, just not the dashboard's north star)
- Interview-readiness / weak-topic recommendation engine — a possible later milestone, not this one
- Real-time/streaming submission sync or background polling — backfill is on-demand, consistent with leettui's no-background-timers stance (cf. git auto-commit being out of scope)
- Cross-user / social comparison (leaderboards, sharing) — leettui is a single-user local tool

## Context

- **Brownfield.** Codebase is mapped in `.planning/codebase/` (ARCHITECTURE, STACK, CONCERNS, etc.) and is healthy: zero-tolerance Biome gate, strict TS, 29 co-located test files, per-directory `CLAUDE.md`.
- **Data is mostly already reachable.** LeetCode's submit/check responses already return runtime, memory, and percentile; a `submissionList` GraphQL query exists for historical per-problem attempts; richer percentile detail is a per-submission `submissionDetails` call. This milestone is largely *surfacing and storing data leettui can already fetch*, not inventing new infrastructure.
- **Established patterns to reuse:** SQLite via Drizzle on `bun:sqlite` with versioned migrations (`drizzle/`), the Zustand UI/domain slice split, the command-catalog + per-scope `useBindings` keymap, never-throws core services, and the popup/overlay UI idiom (the recents modal is the closest analog for a new data-backed view).

## Constraints

- **Tech stack**: Bun + OpenTUI/React, SQLite/Drizzle, TOML config — non-negotiable; the new feature must fit these, not introduce a parallel stack. *(OpenTUI requires Bun.)*
- **Unofficial API dependency**: backfill leans on LeetCode's undocumented GraphQL/REST + cookie auth — schema/anti-bot changes can break it with no warning; backfill must be defensive, resumable, and survive partial/failed fetches.
- **Backfill cost**: a full history backfill (especially per-submission percentile detail) is many API calls — backfill depth vs. speed/rate-limit risk is a real scoping decision for research/planning.
- **Offline-first invariant**: browsing and the dashboard (once data is local) must work without the network; only the backfill/append needs LeetCode reachable.
- **Never-crash on missing/optional capability**: consistent with `core/git.ts` and the harness runner — a failed or unavailable backfill surfaces a clean hint, never a crash.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Scope = per-problem history feeding a global dashboard (both), not one or the other | History is the data layer; the dashboard aggregates it — they reinforce each other | Data layer shipped in Phase 1; per-problem surfacing + browse badge shipped in Phase 2; dashboard (Phase 3) still pending |
| Data source = backfill from LeetCode, then append leettui submissions (hybrid) | Day-one dashboard shows real history incl. website submissions; stays current afterward | Shipped in Phase 1 — `backfillSubmissions()` (resumable, idempotent) + append-on-submit in `core/submission.ts` |
| Dashboard north star = consistency & trajectory (streaks, counts, trends), not percentile chasing | User's stated core value is "am I improving and keeping it up?" | — Pending (Phase 3) |
| Store history in the existing SQLite/Drizzle DB via a new versioned migration | Reuse the established persistence pattern; keeps data local, owned, git-backupable | Shipped in Phase 1 — `submissions` table + `0002` migration in `questions.db` |
| Phase 2.1 test-case management = CLI-only (`--save`/`--add-case` flags on the existing `test` verb); ProblemView/TUI surface deferred (D-01) | The editor inner-loop (`:!leettui test …`) is where the flow lives; a TUI surface is a cheap later re-skin once the core writers exist | Shipped in Phase 2.1 — `saveGoldenOutputs` + `addCase`/`nextCaseName` in `core/solutions/`, flag wiring in `src/cli/` |
| Phase 2.2 auto-capture = two dir-injected never-throws writers reusing 2.1's primitives (`addCase`/`discoverCases`/`compareOutput`), hooked into `runSolution`/`submitSolution` behind a try/catch, with feedback as an optional `notes` field on the shared `ResultView` | One shared service hook (D-08) gives TUI and CLI capture for free and can never drift; capture must never destabilize a successful run/submit | Shipped in Phase 2.2 — `capture.ts` (`captureFailingCase`/`blessRunOutputs`) + `{ response, captureNotes }` from `submission.ts`, notes rendered in `ResultBody.tsx`/`present.ts` |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-12 after Phase 3 (Progress Dashboard) completion — final phase of the v1.0 milestone*
