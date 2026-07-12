---
phase: 03-progress-dashboard
verified: 2026-07-12T00:00:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 03: Progress Dashboard Verification Report

**Phase Goal:** A new full-screen view: streak, recent counts, difficulty breakdown, consistency score, heatmap, and trend — a global `p`-launched progress dashboard that reads the local submission store and shows the user their solving trajectory offline.
**Verified:** 2026-07-12
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every dashboard number is computed from real submission rows; re-solving an already-solved problem changes nothing (D-01) | ✓ VERIFIED | `getFirstAcSummary()` uses `MIN(submittedAt)` + `GROUP BY questionId` — one first-AC row per problem guaranteed at the DB layer. `computeDashboardStats` receives exactly one row per solved problem and maps it to `FirstAcRow[]`. 26 unit tests in `analytics.test.ts` green (48 total after 03-03 extension), including explicit first-AC-once cases. |
| 2 | Streaks and consistency are timezone-correct against the user's local day boundaries (D-03) | ✓ VERIFIED | `toLocalDayKey(ms)` uses `new Date(ms).toLocaleDateString("en-CA")` throughout `analytics.ts`; no UTC-midnight-only math in streak/consistency paths; day-diff uses `new Date(key).getTime()` on YYYY-MM-DD keys (consistent side). Today-grace implemented via `daysSinceLastSolve <= 1` without injecting a phantom today into the count. Tests cover today, yesterday (grace), 2-day gap, and N-consecutive cases. |
| 3 | Difficulty breakdown buckets each distinct solved problem by the difficulty of the question it belongs to (D-02) | ✓ VERIFIED | `getFirstAcSummary()` does `innerJoin(questions, eq(submissions.questionId, questions.id))` and selects `questions.difficulty`; `computeDashboardStats` buckets into `{ Easy, Medium, Hard }` per row. Test "byDifficulty buckets each row" asserts `{Easy:2, Medium:1, Hard:1}` for mixed input. |
| 4 | Pressing `p` from browse OR problem view opens a full-screen progress dashboard showing real streak, total+breakdown, 7d/30d counts, and consistency from local data (DASH-01) | ✓ VERIFIED | `browseGlobalBindings` and `problemGlobalBindings` both bind `"dashboard.open": "p"`. `dashboard.open` in `system.ts` calls `loadDashboardStats()` then `showDashboard(s.mode)`. `app.tsx` routes `mode === "dashboard"` → `<DashboardView>` before the problem branch. `DashboardView` renders streak / total+breakdown / 7d-30d / consistency from `dashboardStats`. Human-verify (Task 4 of plan 03-02) approved against real account. |
| 5 | Esc/q returns to the mode the dashboard was opened from — browse→browse, problem→that same problem with its solutions/scroll state intact (D-11) | ✓ VERIFIED | `showDashboard` writes **only** `mode` + `dashboardReturnMode` — zero writes to `problem` or any other slice (confirmed by reading `uiSlice.ts:231`). `hideDashboard` restores via `set((s) => ({ mode: s.dashboardReturnMode }))`. 4 unit tests in `uiSlice.test.ts` pin this invariant (browse round-trip, problem round-trip, problem state unchanged, returnMode set correctly) — all pass. |
| 6 | The dashboard renders a 52-week × 7-day activity heatmap whose cell intensity encodes first-time solves per day, ramping dim→bright over theme tokens (DASH-05, D-12) | ✓ VERIFIED | `buildHeatmapGrid` returns a 52×7 `number[][]` indexed `[weekIndex][dow]`; `computeDashboardStats` calls it. `DashboardView` renders 7 weekday rows with `buildHeatmapRow()` (RLE into `<text fg={heatmapLevelColor(level)}>` segments using the `■` glyph). `heatmapLevelColor` maps levels 0-4 to `colors.subtle/mutedAccent/accent/success/fgAccent` — no hardcoded hex (grep confirms no `"#..."` literals in `DashboardView.tsx`). Analytics tests: 52×7 grid, correct `[weekIndex][dow]` indexing, >52-week solves skipped. Human-verify (Task 3 of plan 03-03) approved. |
| 7 | The dashboard renders a ~12-week problems-per-week trend sparkline as Unicode block glyphs (DASH-06) | ✓ VERIFIED | `buildWeeklyBuckets(firstAcs, 12)` produces `number[]` of length 12; `computeDashboardStats` populates `sparklineWeeks`. `DashboardView` renders `Trend (12 wk) {buildSparkline(dashboardStats.sparklineWeeks)}` as an accent-colored `<text>`. `buildSparkline` uses `BLOCKS = ["▁","▂","▃","▄","▅","▆","▇","█"]` with window-max scaling. Tests: empty→`""`, all-zeros→spaces, max-count gets `█`, output length = input length. Human-verify (Task 3 of plan 03-03) approved. |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/submissions.ts` | `getFirstAcSummary(): FirstAcSummaryRow[]` | ✓ VERIFIED | Lines 76-94: `innerJoin(questions)`, `like(..., "%Accepted%")`, `groupBy(questionId)`, `min(submittedAt)` as `firstAcMs`. Cast to `FirstAcSummaryRow[]`. No schema change. |
| `src/ui/analytics.ts` | Pure module: `computeDashboardStats`, `buildHeatmapGrid`, `buildWeeklyBuckets`, `buildSparkline`, supporting types | ✓ VERIFIED | 250-line pure module. Zero `import` statements from framework/db/store. All six named exports present and substantive. `DashboardStats` interface complete with all fields. |
| `src/ui/analytics.test.ts` | Co-located unit tests covering all edge cases including first-AC-once, today-grace, grid indexing, sparkline | ✓ VERIFIED | 48 tests in 7 `describe` blocks; 0 fail. Covers `buildSolveDays`, `computeStreaks`, `computeRecentCounts`, `computeConsistency`, `computeDashboardStats`, `buildSparkline`, `buildWeeklyBuckets`, `buildHeatmapGrid`. |
| `src/ui/components/DashboardView.tsx` | Full-screen scrollable view with summary + heatmap + sparkline | ✓ VERIFIED | 203 lines. Absolute overlay, `flexShrink={0}` on header+footer, `<scrollbox ref={registerPopupScroller}>`. Summary (streak/total+breakdown/7d-30d/consistency), 7-row heatmap RLE, sparkline label+glyphs. Empty-state CTA (D-13). Centering wrapper from post-checkpoint refinement. |
| `src/ui/store/slices/dashboardSlice.ts` | Domain slice owning `dashboardStats`, `loadDashboardStats()`, `clearDashboardStats()` | ✓ VERIFIED | 30 lines. `// type: domain` header. Imports `getFirstAcSummary` + `computeDashboardStats`. Registered in `store/index.ts` alongside `submissionsSlice`. |
| `src/ui/store/slices/uiSlice.ts` | `"dashboard"` AppMode + `dashboardReturnMode` + `showDashboard`/`hideDashboard` | ✓ VERIFIED | `"dashboard"` is the last entry in `AppMode` union (line 40). `dashboardReturnMode: AppMode` field with `"browse"` default. `showDashboard` writes only `mode`+`dashboardReturnMode`. `hideDashboard` restores via `s.dashboardReturnMode`. |
| `src/app.tsx` | Routes `mode === "dashboard"` → `<DashboardView>` before problem branch | ✓ VERIFIED | Lines 21-23: `if (mode === "dashboard") { return <DashboardView renderer={renderer} />; }` — comes before `if (mode === "problem")`. |
| `src/ui/keymap/commands/system.ts` | `dashboard.open` command (palette-visible, loads stats then opens) | ✓ VERIFIED | Lines 171-182: `title: "Open progress dashboard"`, `category: "View"`, `short: "Dashboard"`. Calls `loadDashboardStats()` then `showDashboard(s.mode as AppMode)`. |
| `src/ui/keymap/commands/modal.ts` | `dashboard.close` command (`group: "modal"`, hidden from palette) | ✓ VERIFIED | Lines 107-113: `group: "modal"`, calls `hideDashboard()`. |
| `src/ui/keymap/commands/index.ts` | Both commands registered in the catalog | ✓ VERIFIED | `...systemCommands` and `...modalCommands` spreads include both. `dashboard.open` is in `systemCommands`; `dashboard.close` is in `modalCommands`. |
| `src/ui/keymap/bindings.ts` | `dashboardBindings` with scroll+exit; `"p"` in `browseGlobalBindings` + `problemGlobalBindings` | ✓ VERIFIED | Lines 279-285: `dashboardBindings` with j/k+arrows, Ctrl+d/u, Esc/q. Line 58: `"dashboard.open": "p"` in `browseGlobalBindings`. Line 173: `"dashboard.open": "p"` in `problemGlobalBindings`. |
| `src/ui/keymap/index.ts` | `dashboardBindings` re-exported from barrel | ✓ VERIFIED | Line 34: `dashboardBindings` in the barrel export list. |
| `src/ui/store/slices/uiSlice.test.ts` | 4 unit tests for D-11 return-mode invariant | ✓ VERIFIED | 4 tests, all pass: browse round-trip, problem round-trip, problem state untouched, dashboardReturnMode set correctly. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dashboard.open` command | `loadDashboardStats()` then `showDashboard(currentMode)` | `system.ts` `run:` body | ✓ WIRED | Data loaded synchronously before mode flip — no null-flash on open. Stashes pre-open mode as return target before calling `showDashboard`. |
| `showDashboard` | `mode + dashboardReturnMode` only | `uiSlice.ts:231` | ✓ WIRED | `set({ mode: "dashboard", dashboardReturnMode: returnMode })` — no other fields written. Confirmed by code inspection and 4 unit tests. |
| `dashboardSlice.loadDashboardStats()` | `getFirstAcSummary()` → `computeDashboardStats()` → `set({ dashboardStats })` | `dashboardSlice.ts:22-24` | ✓ WIRED | Both imports present; call chain explicit and substantive. |
| `DashboardView` | `dashboardStats` from store | `useAppStore((s) => s.dashboardStats)` | ✓ WIRED | Subscribed at line 91. Data branch renders from `dashboardStats.*` fields directly. |
| `DashboardView` | `buildSparkline` from analytics | `import { buildSparkline } from "../analytics"` | ✓ WIRED | Line 8. Called at render time on `dashboardStats.sparklineWeeks`. |
| `computeDashboardStats` | `buildHeatmapGrid` + `buildWeeklyBuckets` | `analytics.ts:231,236` | ✓ WIRED | Both called inside `computeDashboardStats`; their results populate `heatmapGrid` and `sparklineWeeks` in the returned `DashboardStats`. |
| `app.tsx` | `DashboardView` | `mode === "dashboard"` branch | ✓ WIRED | Import at line 7; route at lines 21-23 before problem branch. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DashboardView.tsx` | `dashboardStats` | `dashboardSlice.loadDashboardStats()` → `getFirstAcSummary()` (DB query: `MIN(submittedAt) GROUP BY questionId`) | Yes — real DB aggregate over `submissions` table joined to `questions.difficulty` | ✓ FLOWING |
| `DashboardView.tsx` | `heatmapGrid` | `computeDashboardStats` → `buildHeatmapGrid(firstAcs)` | Yes — computed from same first-AC rows; 52×7 grid populated at stats load time | ✓ FLOWING |
| `DashboardView.tsx` | `sparklineWeeks` | `computeDashboardStats` → `buildWeeklyBuckets(firstAcs, 12)` | Yes — 12-length bucket array populated from same first-AC rows | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Analytics unit tests (48 tests) | `bun test src/ui/analytics.test.ts` | 48 pass, 0 fail | ✓ PASS |
| Return-mode unit tests (4 tests) | `bun test src/ui/store/slices/uiSlice.test.ts` | 4 pass, 0 fail | ✓ PASS |
| Full zero-tolerance gate | `bun run check` | 541 pass, 0 fail; Biome + tsc clean | ✓ PASS |

### Probe Execution

No phase-declared probes. Conventional `scripts/*/tests/probe-*.sh` — none found for this phase. Full gate run (`bun run check`) substitutes as the comprehensive automated verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DASH-01 | 03-02 | New top-level dashboard view, global keybinding, `mode === "dashboard"` | ✓ SATISFIED | `DashboardView` routed in `app.tsx`; `"dashboard"` in `AppMode`; `p` in both browse+problem global layers; human-verified against real account |
| DASH-02 | 03-01 | Total solved + Easy/Medium/Hard breakdown | ✓ SATISFIED | `computeDashboardStats.byDifficulty` + `totalSolved` from `getFirstAcSummary()`; rendered in `DashboardView`; unit-tested |
| DASH-03 | 03-01 | Current streak + longest streak, timezone-correct | ✓ SATISFIED | `computeStreaks(solveDays)` uses `toLocalDayKey` (en-CA locale, local day); today-grace via `daysSinceLastSolve <= 1`; 6 streak unit tests green |
| DASH-04 | 03-01 | Recent solve counts: last 7 days and last 30 days | ✓ SATISFIED | `computeRecentCounts(firstAcs)` counts first-AC rows in 7d/30d windows; 5 unit tests green; rendered as `7d: N 30d: M` in `DashboardView` |
| DASH-05 | 03-03 | 52-week × 7-day activity heatmap, OpenTUI primitives, no new dependencies | ✓ SATISFIED | `buildHeatmapGrid` + RLE render in `DashboardView`; theme-token color ramp; no new package imports; 5 heatmap unit tests + human-verify approved |
| DASH-06 | 03-03 | Problems-per-week trend sparkline (~12 weeks), Unicode block glyphs | ✓ SATISFIED | `buildWeeklyBuckets` + `buildSparkline` + `Trend (12 wk)` render; 8 sparkline+buckets unit tests; human-verify approved |
| DASH-07 | 03-01 | Rolling 30-day consistency score (solve-days / 30) | ✓ SATISFIED | `computeConsistency(solveDays)` returns `count/30`; 4 consistency unit tests green; rendered as `consistency: N%` in `DashboardView` |

All 7 requirements SATISFIED. REQUIREMENTS.md traceability table correctly marks DASH-01 through DASH-04 and DASH-07 as Complete, and DASH-05/DASH-06 as Pending — those two are now satisfied by plan 03-03 (the Pending status in REQUIREMENTS.md was written at plan-creation time and predates plan 03-03's completion; the actual code evidence confirms they are done).

No orphaned requirements: REQUIREMENTS.md maps no additional IDs to Phase 3 beyond DASH-01 through DASH-07.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | — |

No debt markers (TBD/FIXME/XXX) found in any phase-modified file. No TODO markers. No stub `return null`/`return []`/`return {}` in production paths. No hardcoded hex color literals in `DashboardView.tsx`. The `heatmapGrid: []` and `sparklineWeeks: []` stubs that existed after plan 03-01 were legitimately documented as intentional, and plan 03-03 resolves them — confirmed by `computeDashboardStats` now calling `buildHeatmapGrid` and `buildWeeklyBuckets`.

### Human Verification Required

None — both human-verify checkpoints (Task 4 of 03-02, Task 3 of 03-03) were already performed and approved by the user during this session against a real LeetCode account. Specific approvals documented in SUMMARY files:

- 03-02 Task 4: `p` opens full-screen dashboard from browse + problem; numbers matched real account (27 solved, E 14 · M 12 · H 1, 7d:1 30d:9 consistency 27%, streak 0 best 3); Esc/q returns to correct origin mode; theme colors followed active theme.
- 03-03 Task 3: Heatmap renders 7 aligned rows with correct intensity ramp; re-solve days dim; sparkline bar heights track weekly counts; theme repaints on switch; centering refinement (commit 3961358) approved.

The rolling heatmap anchor (Date.now() vs. calendar-week snapping) was explicitly shown to the user and kept by deliberate choice.

### Gaps Summary

No gaps. All 7 must-have truths verified against the actual codebase:

- The analytics engine (`analytics.ts`) is pure, framework-free, and unit-tested with 48 passing tests covering every behavioral requirement including first-AC-once semantics, today-grace streak, timezone-correct day bucketing, grid indexing, and sparkline scaling.
- The data layer (`getFirstAcSummary`) produces one first-AC row per solved problem via `MIN(submittedAt) GROUP BY questionId` with `LIKE '%Accepted%'` substring matching — no schema change required.
- The store wiring (`dashboardSlice`, `uiSlice` additions) is substantive and connected: load path, mode flip, return-mode restoration, and the D-11 non-disturbance invariant all confirmed by code inspection and unit tests.
- The view (`DashboardView`) renders all six dashboard elements in the locked D-05 order (summary → heatmap → trend), uses only theme tokens (no hardcoded hex), mounts `dashboardBindings` for scroll/exit, and routes via `app.tsx` before the problem branch.
- The keymap plumbing is complete: `dashboard.open` is palette-visible with `short: "Dashboard"`, `dashboard.close` is `group: "modal"`, `dashboardBindings` is exported from the barrel, and `p` is bound in both `browseGlobalBindings` and `problemGlobalBindings`.
- `bun run check` (Biome `--error-on-warnings` + `tsc --noEmit` + 541 tests) passes with zero failures.

---

_Verified: 2026-07-12_
_Verifier: Claude (gsd-verifier)_
