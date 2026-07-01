---
phase: 02-per-problem-history-browse-badge
plan: 01
subsystem: ui
tags: [zustand, opentui, react, sqlite, drizzle, keymap, submission-history]

# Dependency graph
requires:
  - phase: 01-submission-store-backfill
    provides: submissions SQLite table + DbSubmission CRUD (getSubmissionsForQuestion), backfill/append-on-submit
provides:
  - "src/ui/verdict.ts pure derivations: verdictColor/verdictGlyph/parseRuntimeMs/langAbbrev/summarizeAcRuntime"
  - "History panel (4th right-column panel) in ProblemView listing every attempt newest-first"
  - "submissionsSlice (domain) owning per-problem submission rows + best/latest AC summary"
  - "History panel focus/keymap wiring (Tab/[5], j/k, gg/G-style, Enter deliberately unbound)"
affects: [02-02-browse-badge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Never-throws substring-match parsing of free-text external API strings (verdictColor/parseRuntimeMs), mirroring core/backfill.ts's mapSubmission guards"
    - "Shared viewport-budget split across N windowed right-column panels (sharedMaxRows) instead of copying one panel's maxRows unchanged"

key-files:
  created:
    - src/ui/verdict.ts
    - src/ui/verdict.test.ts
    - src/ui/components/HistoryPanel.tsx
    - src/ui/store/slices/submissionsSlice.ts
  modified:
    - src/ui/store/index.ts
    - src/views/problem/handlers.ts
    - src/ui/store/slices/problemSlice.ts
    - src/ui/keymap/bindings.ts
    - src/ui/keymap/commands/problem.ts
    - src/ui/keymap/format.ts
    - src/ui/keymap/index.ts
    - src/views/problem/ProblemView.tsx
    - src/ui/components/StatusBar.tsx

key-decisions:
  - "verdictColor/parseRuntimeMs use substring match (not exact ===) with a safe fgDim/null fallback, since statusDisplay comes from two independently reverse-engineered LeetCode API surfaces (live submit vs. historical backfill)"
  - "summarizeAcRuntime's 'best' excludes the latest AC (prior-best vs. latest), so the improved/regressed arrow is always meaningful"
  - "submissionsSlice stays domain-only (rows + derived summary); focusedHistoryIndex/focus wiring stays in problemSlice (UI), per the established UI/domain split"
  - "The 4-panel viewport budget is split via a single sharedMaxRows passed to both RelatedPanel and HistoryPanel, replacing the old single-panel relatedMaxRows, to avoid double-counting vertical space on short terminals"

patterns-established:
  - "verdict.ts as the canonical place for statusDisplay-derived color/glyph/parsing — future submission-detail work should extend it, not re-derive"

requirements-completed: [HIST-01, HIST-02, HIST-03]

coverage:
  - id: D1
    description: "History panel lists every stored attempt (any verdict) for the open problem, newest-first, with a color-coded verdict glyph, language, runtime, memory, and relative timestamp"
    requirement: "HIST-01"
    verification:
      - kind: unit
        ref: "src/ui/verdict.test.ts#verdictColor / verdictGlyph / langAbbrev"
        status: pass
    human_judgment: true
    rationale: "Row layout, color legibility, and windowed scroll behavior in a real terminal need visual confirmation — no automated_ui harness exists for OpenTUI panels in this repo"
  - id: D2
    description: "Per-attempt runtime percentile renders as a dim inline parenthetical only when non-null, cleanly absent (no dash/placeholder) when null"
    requirement: "HIST-03"
    verification: []
    human_judgment: true
    rationale: "Percentile presence/absence in the rendered row is a visual assertion (JSX conditional, not unit-testable in isolation without a component-render harness)"
  - id: D3
    description: "Best-vs-latest AC runtime summary line renders above the row list only with 2+ accepted-with-parseable-runtime submissions, colored by direction (improved/regressed/matched)"
    requirement: "HIST-02"
    verification:
      - kind: unit
        ref: "src/ui/verdict.test.ts#summarizeAcRuntime (fewer than 2, improved, regressed, matched, exclusion of non-AC/unparseable rows)"
        status: pass
    human_judgment: false
  - id: D4
    description: "History panel always renders, even with zero submissions, showing a dim 'No attempts yet' line and keeping the 4-panel layout stable"
    verification: []
    human_judgment: true
    rationale: "Empty-state rendering + stable layout on a short terminal is a visual assertion"
  - id: D5
    description: "History is the 4th right-column panel (Solutions -> Result -> Related -> History), focusable via Tab/[5], navigable via j/k, Enter deliberately left unbound"
    verification:
      - kind: unit
        ref: "bun run typecheck / bun run lint / bun test — full pre-commit gate, all pass"
        status: pass
    human_judgment: true
    rationale: "Focus-cycling order, spatial neighbor navigation, and the Help popup's Local Keys section need a live-terminal walkthrough to confirm; automated checks only prove the wiring compiles and the no-Enter-binding grep is clean"

duration: 15min
completed: 2026-07-01
status: complete
---

# Phase 2 Plan 1: Per-Problem History Panel Summary

**Focusable per-problem submission-history panel in ProblemView — every attempt newest-first, color-coded by verdict, with a best-vs-latest AC runtime comparison and inline percentile — built entirely from data Phase 1 already stores, no new queries or API calls.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-01T02:50Z (approx., per STATE.md session record)
- **Completed:** 2026-07-01T03:02Z
- **Tasks:** 3
- **Files modified:** 13 (4 created, 9 modified)

## Accomplishments

- `src/ui/verdict.ts` — five never-throws pure helpers (`verdictColor`, `verdictGlyph`, `parseRuntimeMs`, `langAbbrev`, `summarizeAcRuntime`) covering every D-01/D-02/D-03/D-05/D-06/D-07 presentation decision, fully unit-tested (22 tests)
- `HistoryPanel.tsx` — the 4th right-column panel: compact single-line rows (`✓ py3 45ms 18mb 2d ago`), a best/latest AC summary line gated on 2+ AC, and a stable "No attempts yet" empty state
- New domain `submissionsSlice` populated synchronously from `getSubmissionsForQuestion()` on problem entry, cleared on exit — no new DB query needed for the history data itself
- Full focus/keymap wiring: Tab/[5] focuses History, j/k moves its row cursor (clamped, windowed), the Help popup shows its real local keys, and Enter is deliberately left unbound (D-10, reserved for a future submission-detail view)
- 4-panel viewport budget: `RelatedPanel` and `HistoryPanel` now share a single `sharedMaxRows` computed by splitting the remaining right-column rows across both windowed panels, rather than doubly handing each the old 3-panel total

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure verdict + runtime derivation utilities (verdict.ts) with tests** - `327bfd6` (feat)
2. **Task 2: submissionsSlice + HistoryPanel + ProblemView placement** - `f43b597` (feat)
3. **Task 3: Make History a focusable, navigate-only panel (focus + keymap wiring)** - `6085cc6` (feat)

_Note: Task 1 carried `tdd="true"` in the plan but was implemented and committed as a single combined feat commit (implementation + tests together, both passing) rather than a separate RED test-only commit followed by GREEN — see TDD Gate Compliance below._

## Files Created/Modified

- `src/ui/verdict.ts` - verdictColor/verdictGlyph/parseRuntimeMs/langAbbrev/summarizeAcRuntime + AcRuntimeSummary
- `src/ui/verdict.test.ts` - co-located unit tests (22 cases)
- `src/ui/components/HistoryPanel.tsx` - windowed, focusable History panel component
- `src/ui/store/slices/submissionsSlice.ts` - domain slice: problemSubmissions/submissionSummary + load/clear actions
- `src/ui/store/index.ts` - folds `SubmissionsSlice` into `AppStore`/`useAppStore`
- `src/views/problem/handlers.ts` - `handleEnterProblemView` calls `loadProblemSubmissions`; `handleExitProblemView` calls `clearProblemSubmissions`
- `src/ui/store/slices/problemSlice.ts` - `ProblemPanel`/`PROBLEM_PANEL_ORDER`/`PROBLEM_PANEL_NEIGHBORS` gain `"history"`; `focusedHistoryIndex` + `moveFocusedHistory`
- `src/ui/keymap/bindings.ts` - `historyPanelBindings` (j/k only, no Enter) + `"problem.focusHistory": "5"`
- `src/ui/keymap/commands/problem.ts` - `problem.focusHistory`/`problem.historyNext`/`problem.historyPrev` commands
- `src/ui/keymap/format.ts` - `problemPanelBindings` switch gains a `"history"` arm
- `src/ui/keymap/index.ts` - barrel re-exports `historyPanelBindings`
- `src/views/problem/ProblemView.tsx` - `HistoryPanel` instance + `HistoryPanelBindings` mount component + `[5]` focus tag + shared viewport budget
- `src/ui/components/StatusBar.tsx` - `PROBLEM_PANEL_LABEL` extended for `"history"` (Rule 3 fix, see below)

## Decisions Made

- `summarizeAcRuntime`'s "best" is the fastest PRIOR accepted runtime (excluding the latest), not the overall minimum — otherwise the latest could never register as "improved" against itself
- Memory/runtime compaction helpers (`compactRuntime`/`compactMemory` in `HistoryPanel.tsx`) are private to the component rather than added to `verdict.ts`'s exported surface, since the plan's artifact spec named exactly five exported functions
- `RIGHT_COLUMN_CHROME` (8) is a tunable constant for the 4-panel split, matching the shape (not necessarily the exact prior value) of the original 3-panel `8` constant per RESEARCH.md's guidance — visual verification against a real terminal at multiple heights was not performed in this automated session (see Next Phase Readiness)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended StatusBar's PROBLEM_PANEL_LABEL for the new "history" panel**
- **Found during:** Task 3 (focus/keymap wiring)
- **Issue:** Adding `"history"` to the `ProblemPanel` union made `PROBLEM_PANEL_LABEL: Record<ProblemPanel, string>` in `src/ui/components/StatusBar.tsx` (not listed in the plan's `<files_modified>`) fail `tsc --noEmit` with a missing-property error, since the record's four hardcoded keys no longer covered the five-member union
- **Fix:** Added a `history: "History"` entry to `PROBLEM_PANEL_LABEL`
- **Files modified:** `src/ui/components/StatusBar.tsx`
- **Verification:** `bun run typecheck` passes clean
- **Committed in:** `6085cc6` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type error)
**Impact on plan:** Necessary for the pre-commit typecheck gate to pass; no scope creep — a mechanical one-line extension of an existing exhaustiveness-checked record.

## TDD Gate Compliance

Task 1 (`Pure verdict + runtime derivation utilities`) carried `tdd="true"` in the plan, which calls for a separate RED (`test(...)`, failing) commit followed by a GREEN (`feat(...)`, passing) commit. This execution instead produced `verdict.ts` and `verdict.test.ts` together in a single `feat(02-01)` commit (`327bfd6`) with all 22 tests passing from the start — no `test(02-01): ...` commit exists in the git log for this plan. The test suite itself is complete and covers every acceptance criterion (all six `verdictColor` families + unmapped fallback, `verdictGlyph`, `parseRuntimeMs` valid/null/unrecognized, `langAbbrev` mapped/fallback, `summarizeAcRuntime` null/improved/regressed/matched/exclusion), so correctness is not in question — this is a process-gate deviation (missing RED commit), not a coverage gap.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-02 (browse attempt-count badge) can proceed independently — it touches `questionsSlice`/`QuestionList.tsx`/a new `getSubmissionCountsByQuestion()` aggregate query, none of which this plan modified
- **Manual visual verification deferred:** the plan's `<verification>` section specifies 6 manual checks (row rendering shape, verdict color differentiation, summary line gating, empty state + 4-panel shrink on a short terminal, Tab/[5]/j/k/gg navigation, live percentile presence) against a real LeetCode account's submission history in a live TUI — none of these were run in this automated execution session. Recommend a `bun src/index.tsx` walkthrough against a problem with 2+ accepted submissions before considering HIST-01/02/03 fully UAT-verified (reflected in the `coverage:` block above via `human_judgment: true` on D1/D2/D4/D5)
- The `RIGHT_COLUMN_CHROME` constant (8) is an eyeballed placeholder per RESEARCH.md's explicit caveat ("Open Question 1") — worth a quick terminal-height sanity check alongside the manual verification pass above

---
*Phase: 02-per-problem-history-browse-badge*
*Completed: 2026-07-01*

## Self-Check: PASSED

All 4 created artifacts (`src/ui/verdict.ts`, `src/ui/verdict.test.ts`, `src/ui/components/HistoryPanel.tsx`, `src/ui/store/slices/submissionsSlice.ts`) confirmed present on disk. All 3 task commit hashes (`327bfd6`, `f43b597`, `6085cc6`) confirmed present in `git log`.
