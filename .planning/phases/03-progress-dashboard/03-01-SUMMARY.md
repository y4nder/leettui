---
phase: "03"
plan: "01"
subsystem: analytics
tags: [tdd, analytics, pure-module, dashboard, streak, consistency]
status: complete

dependency_graph:
  requires:
    - "src/db/schema.ts (submissions + questions tables — read-only)"
    - "src/db/index.ts (getDb)"
  provides:
    - "src/db/submissions.ts → getFirstAcSummary(): FirstAcSummaryRow[]"
    - "src/ui/analytics.ts → computeDashboardStats(), buildSolveDays(), computeStreaks(), computeRecentCounts(), computeConsistency()"
    - "src/ui/analytics.ts → DashboardStats, FirstAcSummaryRow, FirstAcRow (exported types)"
  affects:
    - "03-02: DashboardView and dashboardSlice consume DashboardStats + getFirstAcSummary()"
    - "03-03: buildHeatmapGrid / buildSparkline / buildWeeklyBuckets extend analytics.ts"

tech_stack:
  added: []
  patterns:
    - "pure/framework-free analytics module (mirrors src/ui/progress.ts)"
    - "TDD RED → GREEN (type-checking stub throws not-implemented; tests fail on assertions)"
    - "today-grace streak semantics: streak through yesterday stays current until end-of-today"
    - "Drizzle grouped aggregate with innerJoin + LIKE substring match (mirrors verdict.ts)"

key_files:
  created:
    - src/ui/analytics.ts
    - src/ui/analytics.test.ts
  modified:
    - src/db/submissions.ts

decisions:
  - "Today-grace: streak through yesterday stays current until end-of-today — grace does NOT inflate the count (1 solve yesterday → current=1, not 2), it only prevents expiration"
  - "buildSolveDays is exported (not private) to allow 03-03's buildHeatmapGrid to consume it directly without re-implementing day-key logic"
  - "computeStreaks uses real-solve-days only for counting; grace is applied at the end via daysSinceLastSolve <= 1 check, not by injecting today into the sorted array"
  - "getFirstAcSummary uses LIKE '%Accepted%' (not eq) mirroring verdict.ts:16 substring match across both API surfaces"

metrics:
  duration: "~6 min"
  completed: "2026-07-12"
  tasks: 2
  files: 3
---

# Phase 03 Plan 01: Analytics Data Layer Summary

Pure computation foundation for the progress dashboard: one new indexed read query and a
framework-free analytics module with 26 unit tests covering all streak/consistency/count/breakdown
edge cases, including the first-AC-once (D-01) and today-grace (D-03) invariants.

## What Was Built

### src/db/submissions.ts — getFirstAcSummary()

New export that reduces the full `submissions` table to one first-Accepted row per problem,
joined to `questions.difficulty`. Uses Drizzle's `min(submissions.submittedAt)` + `innerJoin` +
`like(submissions.statusDisplay, "%Accepted%")` + `groupBy(submissions.questionId)`. No schema
change, no migration — read-only join over existing `idx_sub_question_time` + `questions.id` PK.

Also added exported `FirstAcSummaryRow` interface (`{ questionId: number; difficulty: string; firstAcMs: number }`).

### src/ui/analytics.ts — pure analytics module

Framework-free module (zero imports from db/*, store, theme, react, @opentui/*) implementing:

- `buildSolveDays(firstAcs)` — collects distinct local-day keys from first-AC rows into `Set<string>` using `new Date(ms).toLocaleDateString("en-CA")`
- `computeStreaks(solveDays)` — sorts day keys (YYYY-MM-DD lexicographic = chronological), computes current/longest streak; today-grace via `daysSinceLastSolve <= 1` check (does NOT inflate count)
- `computeRecentCounts(firstAcs)` — counts first-AC rows within 7-day and 30-day windows
- `computeConsistency(solveDays)` — distinct solve-days in trailing 30-day window / 30 (0..1)
- `computeDashboardStats(rows)` — orchestrates all above; sets `heatmapGrid: []` / `sparklineWeeks: []` for 03-03

### src/ui/analytics.test.ts — 26 co-located unit tests

Covers every behavioral requirement:
- `buildSolveDays`: empty, single, same-day collapse, multiple days
- `computeStreaks`: empty → {0,0}; today; yesterday (grace); 2-day gap → current=0; N consecutive; longest > current
- `computeRecentCounts`: no solves; within 7d; within 30d; older than 30d; multiple problems
- `computeConsistency`: no solves; k days in window; solve > 30d excluded; all 30 days
- `computeDashboardStats`: empty rows; totalSolved; byDifficulty breakdown; arrays present
- First-AC-once (D-01): re-solve semantics; only one solve-day for a problem solved 3 days ago

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Zero-tolerance Biome gate] TDD RED stub needed underscore-prefixed parameters**
- **Found during:** Task 1 commit (pre-commit hook)
- **Issue:** Biome's `noUnusedFunctionParameters` and `noUnusedVariables` rules flagged stub parameters (e.g. `firstAcs`, `solveDays`, `rows`) as unused since stubs only throw. `--error-on-warnings` makes warnings into failures.
- **Fix:** Renamed stub parameters to `_firstAcs`, `_solveDays`, `_rows`; removed unused `biome-ignore` suppression comment; reformatted test fixture `Array.from` arrow functions to fit on one line (Biome formatter).
- **Files modified:** `src/ui/analytics.ts`, `src/ui/analytics.test.ts`

**2. [Rule 1 - Bug] Today-grace streak logic needed redesign**
- **Found during:** Task 2 GREEN (failing test: yesterday-only → expected {1,1} got {2,2})
- **Issue:** The RESEARCH.md algorithm injects today as a grace day into the sorted array, which caused yesterday + injected-today to produce streak=2 instead of streak=1. The "grace" is about keeping the streak alive, not extending its count.
- **Fix:** Redesigned `computeStreaks` to compute streak length from real solve-days only, then apply grace via `daysSinceLastSolve <= 1` check at the end. This correctly reports streak=1 for "one solve yesterday" (grace keeps it current) without inflating the count.
- **Files modified:** `src/ui/analytics.ts`

## Known Stubs

- `heatmapGrid: []` in `computeDashboardStats` — intentional; populated in plan 03-03 by `buildHeatmapGrid()`. Type field already declared on `DashboardStats`.
- `sparklineWeeks: []` in `computeDashboardStats` — intentional; populated in plan 03-03 by `buildWeeklyBuckets()`. Type field already declared on `DashboardStats`.

These stubs do not prevent the plan's goal (providing the analytics computation foundation). Plan 03-03 resolves them.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan adds only a read-only SQL aggregate query over existing local data. Consistent with T-03-01 / T-03-02 in the plan's threat model (accepted/mitigated).

## Self-Check

### Created files exist:
- FOUND: src/ui/analytics.ts
- FOUND: src/ui/analytics.test.ts
- FOUND: src/db/submissions.ts (modified)

### Commits exist:
- FOUND: e214593 test(03-01): add failing analytics tests
- FOUND: 50f517b feat(03-01): implement dashboard analytics + first-AC query

## Self-Check: PASSED
