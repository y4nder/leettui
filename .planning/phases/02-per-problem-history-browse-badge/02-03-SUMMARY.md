---
phase: 02-per-problem-history-browse-badge
plan: 03
subsystem: ui
tags: [zustand, opentui, react, submissions, question-list]

# Dependency graph
requires:
  - phase: 02-per-problem-history-browse-badge (02-01, 02-02)
    provides: submissionsSlice.loadProblemSubmissions, questionsSlice.attemptCounts, the ×N/◆ browse marker
provides:
  - In-session History panel refresh after a live submit (no exit/re-enter needed)
  - Fixed-width browse attempt-count badge so question-list columns stay aligned
affects: [per-problem-history, browse-question-list, uat-gap-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutation handlers re-invoke their originating load action immediately after the mutating call resolves (mirrors handleConfirmDeleteSolution's refreshProblemSolutions()/refreshSolutionFiles() pattern)"
    - "Fixed-width row cells use .padStart(N) on a locally-computed string alongside sibling columns (idStr/acStr/runtimeStr/markerStr) rather than relying on layout width"

key-files:
  created: []
  modified:
    - src/views/problem/handlers.ts
    - src/ui/components/QuestionList.tsx

key-decisions:
  - "loadProblemSubmissions(p.question.id) is called before setProblemResult in handleProblemSubmit's success callback, not after — order doesn't affect correctness (both are synchronous store writes) but keeps the data-refresh anti-stale write conceptually before the display-facing one"
  - "markerStr width is 3 (fits ×1–×99 plus ◆/blank); a hypothetical ×100+ overflows by one column, accepted as an edge case not worth widening the common rows for"

requirements-completed: [HIST-03, BROWSE-01]

coverage:
  - id: D1
    description: "handleProblemSubmit re-loads submissions (loadProblemSubmissions) after submitSolution resolves, so the History panel shows the new row in-session without exiting and re-entering the problem"
    requirement: "HIST-03"
    verification:
      - kind: unit
        ref: "bun run typecheck && bun run lint (pass); grep -c 'loadProblemSubmissions' src/views/problem/handlers.ts == 2"
        status: pass
    human_judgment: true
    rationale: "The plan's own verify block requires a human-check on a real LeetCode account: submit a live solution and observe the History panel updating in-session. No automated test harness exercises the live submit + in-session render path."
  - id: D2
    description: "Browse attempt-count badge (×N/◆/blank) is pre-padded to a fixed width (markerStr, padStart(3)) so idStr/acStr/runtimeStr and all other columns stay vertically aligned regardless of badge digit count"
    requirement: "BROWSE-01"
    verification:
      - kind: unit
        ref: "bun run typecheck && bun run lint (pass); grep -q 'markerStr' and grep -q 'padStart(3' in src/ui/components/QuestionList.tsx"
        status: pass
    human_judgment: true
    rationale: "Vertical column alignment across mixed-badge rows is a visual layout property; the plan's verify block specifies a human-check in a live terminal render, which automated typecheck/lint/grep cannot confirm."

duration: 5min
completed: 2026-07-01
status: complete
---

# Phase 02 Plan 03: Gap-Closure — History Panel Refresh + Fixed-Width Browse Badge Summary

**Closed both remaining Phase 02 UAT gaps: live-submit now re-populates the in-session History panel, and the browse `×N` attempt badge is now fixed-width so question-list columns stay aligned.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-01T12:27:00+08:00
- **Completed:** 2026-07-01T12:27:58+08:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `handleProblemSubmit` now calls `loadProblemSubmissions(p.question.id)` immediately after `submitSolution` resolves, refreshing `submissionsSlice` so `HistoryPanel` shows the new attempt row (with its percentile) without leaving the problem view (HIST-03).
- `QuestionList`'s per-row marker cell is now a fixed-width `markerStr` (`.padStart(3, " ")`), matching the `idStr`/`acStr`/`runtimeStr` idiom, so `×N`/`◆`/blank badges no longer push trailing columns out of vertical alignment (BROWSE-01).

## Task Commits

Each task was committed atomically:

1. **Task 1: Refresh the History panel after a live submit (Gap 1, HIST-03)** - `d300905` (fix)
2. **Task 2: Make the browse attempt-count badge fixed-width (Gap 2, BROWSE-01)** - `5c35f7e` (fix)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified
- `src/views/problem/handlers.ts` - `handleProblemSubmit`'s success callback now re-invokes `loadProblemSubmissions(p.question.id)` right after `submitSolution` resolves, before `setProblemResult`
- `src/ui/components/QuestionList.tsx` - New `markerStr` const (D-14 precedence, `.padStart(3, " ")`) computed alongside `idStr`/`acStr`/`runtimeStr`; the marker `<text>` now renders `markerStr` instead of the previous inline unpadded conditional

## Decisions Made
- Placed `loadProblemSubmissions` before `setProblemResult` in the submit success callback — both are synchronous store writes so ordering has no behavioral effect, but this keeps the domain-data refresh conceptually ahead of the display update.
- Chose a fixed width of 3 for `markerStr`: right-aligns `◆`/blank/`×1`–`×9` while still exactly fitting `×99` (a realistic per-problem attempt ceiling); a hypothetical `×100+` overflows by one column, accepted as an edge case per the plan's own scope guidance rather than widening the common rows further.

## Deviations from Plan

None - plan executed exactly as written. Both fixes were localized to the two named files with no file overlap, matching the plan's design.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Both Phase 02 UAT gaps (test 5 / HIST-03, test 6 / BROWSE-01) are closed. `bun run check` (Biome + tsc + full test suite, 378 tests) passes clean. This was the final plan for Phase 02 — phase-level re-verification (re-running UAT tests 5 and 6 against the live TUI) is the natural next step, followed by transition to Phase 03 (global progress dashboard).

---
*Phase: 02-per-problem-history-browse-badge*
*Completed: 2026-07-01*

## Self-Check: PASSED

- FOUND: src/views/problem/handlers.ts
- FOUND: src/ui/components/QuestionList.tsx
- FOUND commit: d300905
- FOUND commit: 5c35f7e
