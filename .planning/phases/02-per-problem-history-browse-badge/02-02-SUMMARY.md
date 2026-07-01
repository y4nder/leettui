---
phase: 02-per-problem-history-browse-badge
plan: 02
subsystem: ui
tags: [zustand, opentui, react, sqlite, drizzle, submission-history]

# Dependency graph
requires:
  - phase: 01-submission-store-backfill
    provides: submissions SQLite table + DbSubmission CRUD, backfill/append-on-submit
  - phase: 02-per-problem-history-browse-badge (plan 01)
    provides: submissions domain slice pattern (not directly reused, but same phase context)
provides:
  - "getSubmissionCountsByQuestion() in src/db/submissions.ts — GROUP BY aggregate over every verdict"
  - "attemptCounts Map + refreshAttemptCounts() action on questionsSlice"
  - "×N attempt-count badge in the browse question list, reusing the ◆ solution-marker slot"
  - "Backfill-completion refresh so badges never go stale until restart"
affects: [03-progress-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aggregate read-only queries (count()/groupBy()) mirror the existing getStatusCounts() idiom in db/questions.ts — no new query style introduced"
    - "attemptCounts follows the exact same three-set()-call refresh lifecycle as solutionFileIds (init/refreshQuestions/refreshSolutionFiles), plus a dedicated refreshAttemptCounts() for cheap targeted recomputes (backfill completion)"

key-files:
  created: []
  modified:
    - src/db/submissions.ts
    - src/db/submissions.test.ts
    - src/ui/store/slices/questionsSlice.ts
    - src/ui/components/QuestionList.tsx
    - src/views/browse/BrowseView.tsx
    - src/views/browse/handlers/backfill.ts

key-decisions:
  - "attemptCounts lives on questionsSlice (domain), not the Phase 2 Plan 1 submissionsSlice — the aggregate is a per-question count for the browse list, not per-problem detail rows (RESEARCH Pitfall 5)"
  - "The badge reuses the existing ◆ marker slot rather than adding a new column, with the D-14 precedence: ×N wins whenever attempts > 0, ◆ is the fallback only when a solution file exists with zero submissions"
  - "refreshSolutionFiles() also recomputes attemptCounts (not just refreshQuestions/init) so the two markers that share the same render slot never drift out of sync on any of their three common refresh triggers"

patterns-established:
  - "getSubmissionCountsByQuestion as the canonical per-question aggregate — Phase 3's dashboard breakdown-by-topic/difficulty work can follow the same count()/groupBy() shape over submissions"

requirements-completed: [BROWSE-01]

coverage:
  - id: D1
    description: "getSubmissionCountsByQuestion() returns a questionId->count Map counting every verdict (AC/WA/TLE/...), with never-submitted questions absent from the Map, and an empty Map for an empty submissions table"
    requirement: "BROWSE-01"
    verification:
      - kind: unit
        ref: "src/db/submissions.test.ts#getSubmissionCountsByQuestion — counts every verdict per question, omits never-submitted questions, empty table -> empty Map"
        status: pass
    human_judgment: false
  - id: D2
    description: "The browse question list shows a ×N badge in the ◆ slot for any problem with 1+ stored submission, with no badge for never-attempted problems, and ◆ shown only as a zero-submission fallback when a solution file exists"
    requirement: "BROWSE-01"
    verification:
      - kind: unit
        ref: "bun run typecheck / bun run lint — full pre-commit gate confirms the D-14 precedence branch compiles and the prop threading is exhaustive"
        status: pass
    human_judgment: true
    rationale: "Row rendering shape, badge legibility, and the ◆-vs-×N slot precedence in a real terminal need visual confirmation — no automated_ui harness exists for OpenTUI panels in this repo (mirrors 02-01's D1/D2/D4/D5 pattern)"
  - id: D3
    description: "Running 'Import submission history' from the command palette refreshes the browse badges without restarting the app, on every exit path (success, auth-error, rate-limited, network-error, cancelled)"
    requirement: "BROWSE-01"
    verification:
      - kind: unit
        ref: "bun run typecheck / bun run lint / bun test (378 pass) — full pre-commit gate; grep confirms refreshAttemptCounts is called inside the finally block"
        status: pass
    human_judgment: true
    rationale: "The live no-restart refresh against a real LeetCode account's backfill run is a visual/behavioral confirmation in a live TUI, not unit-testable in isolation"

duration: 3min
completed: 2026-07-01
status: complete
---

# Phase 2 Plan 2: Browse Attempt-Count Badge Summary

**Browse question list now shows a raw ×N submission-attempt badge (every verdict counted) in the existing ◆ solution-marker slot, backed by a new `getSubmissionCountsByQuestion()` GROUP BY aggregate, and the badge refreshes after a backfill import without an app restart.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-01T03:05:43Z
- **Completed:** 2026-07-01T03:08:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `getSubmissionCountsByQuestion()` in `src/db/submissions.ts` — a `count()`/`.groupBy()` aggregate over `submissions`, keyed by `questionId`, returning a `Map<number, number>`; counts every verdict (D-12), omits never-submitted questions (D-11), hits the existing `idx_sub_question_time` index — no schema change, no migration
- `attemptCounts: Map<number, number>` on `questionsSlice`, populated at all three of `solutionFileIds`'s refresh sites (`init`, `refreshQuestions`, `refreshSolutionFiles`) plus a new dedicated `refreshAttemptCounts()` targeted recompute
- `QuestionList` renders `×N` in the existing ◆ column when `attemptCount > 0`, falling back to `◆` only when a solution file exists locally with zero submissions, and a blank space otherwise (D-13/D-14 precedence) — no new column added, acceptance-rate/difficulty/runtime columns unmoved
- `BrowseView` threads `attemptCounts` from the store into `QuestionList`, mirroring the existing `solutionFileIds` wiring
- `handleStartBackfill`'s `finally` block now calls `refreshAttemptCounts()` on every exit path (success, auth-error, rate-limited, network-error, cancelled), closing RESEARCH Pitfall 4 — previously the badge stayed stale at zero until an app restart

## Task Commits

Each task was committed atomically:

1. **Task 1: getSubmissionCountsByQuestion aggregate query + test** - `cd1fc26` (feat)
2. **Task 2: attemptCounts on questionsSlice + badge render in QuestionList** - `a7c9d7f` (feat)
3. **Task 3: Refresh the badge after a backfill import** - `7fc4e65` (fix)

## Files Created/Modified

- `src/db/submissions.ts` - `getSubmissionCountsByQuestion(): Map<number, number>` GROUP BY aggregate
- `src/db/submissions.test.ts` - test block covering mixed-verdict counting (D-12), never-submitted absence (D-11), and empty-table case
- `src/ui/store/slices/questionsSlice.ts` - `attemptCounts` field + `refreshAttemptCounts()` action, populated in `init`/`refreshQuestions`/`refreshSolutionFiles`
- `src/ui/components/QuestionList.tsx` - `attemptCounts` prop, D-14 precedence render in the existing ◆ slot
- `src/views/browse/BrowseView.tsx` - reads `attemptCounts` from the store, passes it to `QuestionList`
- `src/views/browse/handlers/backfill.ts` - `refreshAttemptCounts()` called in the `finally` block

## Decisions Made

- `attemptCounts` was added to `refreshSolutionFiles()` as well as `init`/`refreshQuestions` (all three of `solutionFileIds`'s refresh sites, per the plan's explicit instruction) so the two markers sharing one render slot can never drift out of sync on any of their common refresh triggers
- The badge uses `×{n}` (no leading space tweak beyond the existing single-character column width) to stay visually consistent with the ◆ glyph it replaces in that exact slot

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 (per-problem-history-browse-badge) is now feature-complete: Plan 01 (History panel) and Plan 02 (browse badge) both shipped
- **Manual visual verification deferred:** the plan's `<verification>` section specifies 4 manual checks (×N badge matches real attempt count, no-badge on never-attempted problems, ◆-fallback-only-with-zero-submissions, live badge refresh after a real backfill import) against a real LeetCode account in a live TUI — none of these were run in this automated execution session. Recommend a `bun src/index.tsx` walkthrough before considering BROWSE-01 fully UAT-verified (reflected in `human_judgment: true` on D2/D3 above)
- `getSubmissionCountsByQuestion` establishes the canonical count()/groupBy() aggregate shape over `submissions` that Phase 3's dashboard (breakdown by difficulty/topic, solve streak) can reuse directly

---
*Phase: 02-per-problem-history-browse-badge*
*Completed: 2026-07-01*

## Self-Check: PASSED

All 6 modified files confirmed present on disk. All 3 task commit hashes (`cd1fc26`, `a7c9d7f`, `7fc4e65`) confirmed present in `git log`.
