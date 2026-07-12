---
phase: "03"
plan: "03"
subsystem: ui
tags: [dashboard, heatmap, sparkline, analytics, tdd, opentui, theme]
status: complete

dependency_graph:
  requires:
    - "03-01: analytics.ts with FirstAcRow, DashboardStats (heatmapGrid/sparklineWeeks type declared), buildSolveDays"
    - "03-02: DashboardView.tsx with summary block + TODO(03-03) placeholder; dashboardSlice provides dashboardStats"
  provides:
    - "src/ui/analytics.ts — buildHeatmapGrid, buildWeeklyBuckets, buildSparkline exports; computeDashboardStats now fills heatmapGrid + sparklineWeeks"
    - "src/ui/analytics.test.ts — grid-indexing + sparkline unit tests (26→41 tests)"
    - "src/ui/components/DashboardView.tsx — heatmap render (7 rows × RLE-colored segments) + sparkline label + centered layout"
  affects:
    - "Phase 4+: dashboard is now feature-complete (all DASH requirements satisfied)"

tech_stack:
  added: []
  patterns:
    - "TDD RED → GREEN for pure analytics functions (separate test and feat commits)"
    - "run-length-encoding same-level heatmap cells into sibling <text fg={...}> segments (QuestionList per-segment pattern)"
    - "fixed intensity thresholds (0/1/2-3/4-6/7+) → level → theme token ramp (no hardcoded hex, D-12)"
    - "rolling 52-week heatmap anchored to Date.now() — intentional, not snapped to calendar-week boundaries"
    - "centering wrapper: <box flexGrow={1} justifyContent='center' alignItems='center'> inside scrollbox for viewport-centered but scrollable content"

key_files:
  created: []
  modified:
    - src/ui/analytics.ts
    - src/ui/analytics.test.ts
    - src/ui/components/DashboardView.tsx

key-decisions:
  - "Rolling heatmap anchor (Date.now()): columns are 7-day rolling windows from today, NOT snapped to calendar-week (Sun→Sat) boundaries — the rightmost column is always 'last 7 days from now', and the grid shifts one column per day. This matches the RESEARCH spec and was explicitly confirmed by the user at human-verify. Do NOT 'fix' this to calendar-week alignment."
  - "buildSparkline uses window-max scaling (max week always renders as tallest block): makes trend shape visible for low-volume users; minimum scale of 1 avoids div-by-zero when all weeks are 0 (all-space output)"
  - "buildSparkline is NOT called inside computeDashboardStats — stats carry raw numeric sparklineWeeks for testability; DashboardView calls buildSparkline at render time"
  - "Viewport centering: user requested centered layout during human-verify; DashboardView wraps the scrollbox body in <box flexGrow={1} justifyContent='center' alignItems='center'>; content stays left-aligned internally and top-anchors when taller than viewport (scrolls normally)"
  - "heatmapLevelColor uses colors.subtle/mutedAccent/accent/success/fgAccent (theme tokens) — no hardcoded green (D-12)"

patterns-established:
  - "Heatmap RLE pattern: for each dow row, collect 52 week-counts, map counts to levels via heatmapLevel(), run-length-encode same-level runs into <text fg={heatmapLevelColor(level)}>{CELL.repeat(runLen)}</text> segments — ~5-15 segments/row typical, worst case 52"
  - "Fixed intensity thresholds: 0→level 0, 1→1, 2-3→2, 4-6→3, ≥7→4 — stable meaning as user solves more over time"

requirements-completed:
  - DASH-05
  - DASH-06

coverage:
  - id: D1
    description: "buildHeatmapGrid returns a 52×7 grid indexed [weekIndex][dow] with correct rolling placement — solves older than 52 weeks skipped; a re-solve of an already-solved problem does not double-count (D-04)"
    requirement: DASH-05
    verification:
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildHeatmapGrid — solve lands in correct cell"
        status: pass
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildHeatmapGrid — grid is 52×7"
        status: pass
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildHeatmapGrid — solve older than 52 weeks is skipped"
        status: pass
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildHeatmapGrid — re-solve only contributes one increment (first-AC-once)"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildSparkline maps weekly counts to Unicode block glyphs: empty → '', 0-count weeks → space, max-count week → tallest block; output length equals input length"
    requirement: DASH-06
    verification:
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildSparkline — empty array returns empty string"
        status: pass
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildSparkline — all zeros returns spaces"
        status: pass
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildSparkline — window-max scaling"
        status: pass
      - kind: unit
        ref: "src/ui/analytics.test.ts#buildSparkline — output length equals input length"
        status: pass
    human_judgment: false
  - id: D3
    description: "DashboardView renders 52-week × 7-day activity heatmap: 7 RLE-colored rows using HEATMAP_CELL '■' glyph, theme token ramp (no hardcoded hex), empty days use dim track color — below the summary block (D-05 order)"
    requirement: DASH-05
    verification:
      - kind: unit
        ref: "bun run check — Biome + tsc + bun test (541 pass)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 human-verify checkpoint — user confirmed heatmap renders 7 aligned rows with intensity ramp, re-solve days dim, colors follow theme"
        status: pass
    human_judgment: true
    rationale: "Heatmap column alignment, intensity ramp correctness, and theme-follow require visual human confirmation; unit tests cover the analytics computation but not the rendered layout"
  - id: D4
    description: "DashboardView renders ~12-week trend sparkline: 'Trend (12 wk)' label + Unicode block glyphs from buildSparkline(dashboardStats.sparklineWeeks) — below the heatmap (D-05 order)"
    requirement: DASH-06
    verification:
      - kind: unit
        ref: "bun run check — Biome + tsc + bun test (541 pass)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 human-verify checkpoint — user confirmed sparkline bar heights track weekly first-solve counts"
        status: pass
    human_judgment: true
    rationale: "Sparkline bar-height fidelity requires visual confirmation against a real account with known weekly counts"
  - id: D5
    description: "Dashboard content is viewport-centered (centering wrapper around the summary+heatmap+trend block) — requested by user during human-verify, committed post-checkpoint"
    verification:
      - kind: manual_procedural
        ref: "Commit 3961358 — user requested centering, approved after re-verification"
        status: pass
    human_judgment: true
    rationale: "Layout centering is a visual property requiring human confirmation"

metrics:
  duration: "~30 min"
  completed: "2026-07-12"
  tasks: 3
  files: 3
---

# Phase 03 Plan 03: Trajectory Widgets Summary

52-week × 7-day activity heatmap and 12-week trend sparkline added to the dashboard, driven by
the same first-time-solve unit as the summary, rendered with run-length-encoded theme-token color
segments and viewport-centered layout — completing DASH-05, DASH-06, and Phase 3.

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-12
- **Tasks:** 3 (Tasks 1–2 auto/TDD, Task 3 human-verify checkpoint — approved)
- **Files modified:** 3

## Accomplishments

- `buildHeatmapGrid`, `buildWeeklyBuckets`, `buildSparkline` exported from `analytics.ts`; `computeDashboardStats` now fills `heatmapGrid` (52×7) and `sparklineWeeks` (length-12); 15 new unit tests cover grid indexing, bucket placement, sparkline scaling, and the first-AC-once invariant (D-04)
- `DashboardView` renders a 52-week × 7-day activity heatmap (7 weekday rows, each a `flexDirection="row"` box of run-length-encoded `<text fg={heatmapLevelColor(level)}>` segments using the `■` glyph; intensity thresholds 0/1/2-3/4-6/7+; theme tokens `colors.subtle/mutedAccent/accent/success/fgAccent`, D-12) below the summary block (D-05 order)
- `DashboardView` renders the `Trend (12 wk)` sparkline (accent-colored Unicode blocks from `buildSparkline`) below the heatmap (D-05 order)
- User-requested centering refinement (commit 3961358): the summary+heatmap+trend block is wrapped in `<box flexGrow={1} justifyContent="center" alignItems="center">` so it sits centered in the viewport; still left-aligned internally and scrollable when taller than the viewport
- Human-verify (Task 3) approved: real account shows heatmap intensity ramp correct, re-solve days dim, sparkline heights track weekly counts, theme repaints on switch

## Task Commits

1. **Task 1 (TDD RED): Add failing tests for buildHeatmapGrid, buildWeeklyBuckets, buildSparkline** — `e0e4d1f` (test)
2. **Task 1 (TDD GREEN): Implement buildHeatmapGrid, buildWeeklyBuckets, buildSparkline + wire into computeDashboardStats** — `d05fdd5` (feat)
3. **Task 2: Render heatmap grid + sparkline in DashboardView** — `143cdca` (feat)
4. **Task 3 post-checkpoint refinement: Center dashboard content in the viewport** — `3961358` (feat)
5. **Task 3: Human-verify — heatmap + sparkline render correctly and follow the theme** — APPROVED (checkpoint, no code commit)

## Files Created/Modified

- `src/ui/analytics.ts` (modified) — added `buildHeatmapGrid(firstAcs): number[][]`, `buildWeeklyBuckets(firstAcs, numWeeks=12): number[]`, `buildSparkline(weeklyCounts): string`; `const BLOCKS` glyph constant; `computeDashboardStats` now calls `buildHeatmapGrid` + `buildWeeklyBuckets` (previously returned empty arrays); index-convention comment on `buildHeatmapGrid` (`[weekIndex][dow]`, weekIndex 0=52w ago, 51=current; Pitfall 3 guard)
- `src/ui/analytics.test.ts` (modified) — added `describe("buildHeatmapGrid")`, `describe("buildWeeklyBuckets")`, `describe("buildSparkline")` blocks; 15 new tests covering grid indexing, correct week placement, solve >52w skipped, first-AC-once non-duplication, bucket oldest/newest placement, sparkline empty/zeros/scaling/length
- `src/ui/components/DashboardView.tsx` (modified) — added `HEATMAP_CELL` constant (`■`), `heatmapLevelColor(level)` helper (theme token mapping), `heatmapLevel(count)` helper (fixed thresholds), `buildHeatmapRow(weekCounts)` RLE segment builder; replaced the `// TODO(03-03)` placeholder with the heatmap (7 weekday rows) + sparkline (`Trend (12 wk)`) blocks; added centering wrapper `<box flexGrow={1} justifyContent="center" alignItems="center">`; imported `buildSparkline` from `../analytics`

## Decisions Made

1. **Rolling heatmap anchor (Date.now() — not calendar-week):** `buildHeatmapGrid` anchors columns to `Date.now()` as rolling 7-day windows. The rightmost column is "last 7 days from now", NOT "last Sunday-through-Saturday". The grid shifts one column per day, and the newest column can straddle two calendar weeks. This matches the RESEARCH spec ("rolling from today"). **The user was shown this behavior at human-verify and explicitly chose to keep it as-is.** Do not "fix" this to calendar-week (Sun→Sat) snapping — it would be a behavior change from the user's deliberate choice.

2. **Window-max sparkline scaling:** `buildSparkline` always makes the tallest week the `█` block, regardless of absolute count. A user with 1 problem/week still sees a meaningful trend shape. Minimum scale of 1 prevents div-by-zero when all weeks are zero (output is all spaces, consistent with `buildSparkline([0,0,...])` behavior).

3. **buildSparkline not called in computeDashboardStats:** The stats object carries raw `sparklineWeeks: number[]` so the computation remains testable in isolation. `DashboardView` calls `buildSparkline` at render time.

4. **Viewport centering (post-checkpoint refinement):** During human-verify, the user observed the dashboard content anchored top-left and requested centering. The fix wraps the scrollbox body in `<box flexGrow={1} justifyContent="center" alignItems="center">`. The content block stays left-aligned internally; when it is taller than the viewport, the centering flexbox top-anchors and normal scroll still reaches every row. `bun run check` passed after the change.

## Deviations from Plan

### Post-checkpoint Refinement (user-requested, not a rule deviation)

**Centering the dashboard block (commit 3961358)**
- **Found during:** Task 3 (human-verify checkpoint)
- **Requested by:** User during visual inspection — content was anchored top-left, user requested it be centered
- **Fix:** Added `<box flexGrow={1} justifyContent="center" alignItems="center">` wrapper inside the scrollbox body in `DashboardView.tsx`; the content block stays left-aligned internally and top-anchors + scrolls when taller than the viewport
- **Files modified:** `src/ui/components/DashboardView.tsx`
- **Commit:** `3961358`

---

**Total deviations:** 1 user-requested post-checkpoint refinement (not an auto-fix rule deviation)
**Impact on plan:** The plan stated no checkpoints were required prior to Task 3's human-verify; the refinement was applied between the checkpoint approval and finalization. No scope creep — centering improves the UX without changing any data or computation.

## Issues Encountered

None — analytics functions implemented cleanly on first attempt; the TDD RED/GREEN cycle proceeded as expected; `bun run check` was green after each commit.

## Known Stubs

None — all stubs from 03-01 (`heatmapGrid: []`, `sparklineWeeks: []`) are now fully resolved by this plan. The dashboard is feature-complete.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan adds only pure computation functions (framework-free) and OpenTUI render blocks over pre-computed local data. Consistent with T-03-05 (heatmap render budget — 52×7 cells run-length-encoded to ~50-150 segments, well within OpenTUI's render budget) and T-03-06 (local-only data, no new surface) from the plan's threat model.

## Next Phase Readiness

Phase 3 is now complete: all 3 plans done, all DASH requirements satisfied (DASH-01 through DASH-07). The dashboard is feature-complete — users can open `p` and read streak, recent counts, difficulty breakdown, consistency score, activity heatmap, and trend sparkline, all from local data, all theme-following, with correct first-time-solve accounting (D-04).

The project milestone (v1.0) has all 5 phases complete (Phases 1, 2, 2.1, 2.2, 3). Ready for milestone close / release.

---

## Self-Check

### Modified files exist:
- FOUND: src/ui/analytics.ts
- FOUND: src/ui/analytics.test.ts
- FOUND: src/ui/components/DashboardView.tsx

### Commits exist:
- FOUND: e0e4d1f test(03-03): add failing tests for buildHeatmapGrid, buildWeeklyBuckets, buildSparkline
- FOUND: d05fdd5 feat(03-03): implement buildHeatmapGrid, buildWeeklyBuckets, buildSparkline + wire into computeDashboardStats
- FOUND: 143cdca feat(03-03): render heatmap grid + sparkline in DashboardView
- FOUND: 3961358 feat(03-03): center dashboard content in the viewport

## Self-Check: PASSED

---

*Phase: 03-progress-dashboard*
*Completed: 2026-07-12*
