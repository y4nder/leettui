---
status: diagnosed
phase: 02-per-problem-history-browse-badge
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-07-01T03:18:51Z
updated: 2026-07-01T03:52:00Z
---

## Current Test

[testing complete]

## Tests

### 1. History panel rendering, colors, and placement
expected: History renders as the 4th right-column panel below Related (Solutions unchanged); rows read like `✓ py3 45ms 18mb 2d ago`, newest-first; verdict glyph color visibly differs for AC (green) vs WA/RE/MLE (red) vs TLE (yellow/orange) vs CE (dim).
result: pass

### 2. Best/Latest AC runtime summary line
expected: `Best: {n}ms · Latest: {n}ms {arrow}` renders above the row list, colored green/red/dim for improved/regressed/matched; no such line renders under 2 AC.
result: pass

### 3. Empty state and 4-panel viewport shrink
expected: A dim 'No attempts yet' line renders inside a still-bordered/titled panel; on a short terminal no panel's rows overlap or get cut off oddly.
result: pass

### 4. History focus/navigation and Help popup
expected: Tab/[5] focuses History (accent border); j/k/gg/G move the row cursor within the windowed list; Enter does nothing (no submission-detail view, deliberately unbound); the Help popup (?) shows History's real local keys (j/k) instead of a generic scroll layer.
result: pass

### 5. Live percentile vs. backfilled-row percentile absence
expected: The live-submitted row shows a dim `(top N%)` parenthetical after the runtime; backfilled rows show no percentile text at all (no dash/placeholder).
result: issue
reported: "it does not refresh automatically the history panel after s"
severity: major

### 6. Browse attempt-count badge appearance and precedence
expected: The submitted problem shows `×N` in the marker slot (N = total attempts across all verdicts, matching your real history); the never-attempted problem shows blank (no `×0`); the solution-file-only problem shows `◆`.
result: issue
reported: "passed but I want changes for this one, because it kinda misaligned the ui"
severity: cosmetic

### 7. Live badge refresh after backfill import
expected: Badges update to reflect newly-imported submission counts immediately after the backfill finishes (or is cancelled/rate-limited/errors), with no app restart required.
result: pass

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "The live-submitted row shows a dim `(top N%)` parenthetical after the runtime; backfilled rows show no percentile text at all (no dash/placeholder)."
  status: failed
  reason: "User reported: it does not refresh automatically the history panel after s"
  severity: major
  test: 5
  root_cause: "handleProblemSubmit (src/views/problem/handlers.ts:362-376) never re-invokes loadProblemSubmissions after submitSolution resolves. submitSolution correctly persists the new submission row to SQLite via appendSubmissionRecord for every verdict, so the DB is always fresh — but submissionsSlice's in-memory problemSubmissions/submissionSummary state that HistoryPanel renders is a one-time snapshot populated only by loadProblemSubmissions, whose sole call site in the codebase is handleEnterProblemView (fires once on entering the problem view). Nothing re-fires it after a live submit."
  artifacts:
    - path: "src/views/problem/handlers.ts"
      issue: "handleProblemSubmit's success path does not call loadProblemSubmissions after submitSolution resolves"
  missing:
    - "Call useAppStore.getState().loadProblemSubmissions(p.question.id) inside handleProblemSubmit after submitSolution resolves (mirroring the refresh-after-mutation pattern used in handleConfirmDeleteSolution), placed before or alongside setProblemResult so History and Result panels update together"
  debug_session: ".planning/debug/history-panel-no-refresh-after-submit.md"

- truth: "The submitted problem shows `×N` in the marker slot (N = total attempts across all verdicts, matching your real history); the never-attempted problem shows blank (no `×0`); the solution-file-only problem shows `◆`."
  status: failed
  reason: "User reported: passed but I want changes for this one, because it kinda misaligned the ui — screenshot shows the ×N badge is not fixed-width, so rows with different attempt-count digit lengths (×1 vs ×3 vs ×32) shift the problem-number/title columns left or right relative to each other, breaking visual column alignment down the question list."
  severity: cosmetic
  test: 6
  root_cause: "QuestionList.tsx's marker cell (lines 87-90) renders `×${attemptCount}` / `◆` / ' ' as an unpadded, variable-length string. Every other data column in the same row (idStr, acStr, runtimeStr) is explicitly pre-padded to a fixed character count via .padStart() before interpolation, but the marker cell never received the same treatment. The pre-Phase-02 ◆-only marker was always exactly 1 character so it accidentally behaved like a fixed-width column; the ×N replacement is 2-4+ characters depending on digit count, so wider counts push every subsequent column rightward. The plan's must_haves specified the same column slot but never specified a fixed rendered width — a plan gap, not an implementation deviation."
  artifacts:
    - path: "src/ui/components/QuestionList.tsx"
      issue: "marker cell (lines 87-90) lacks fixed-width padding unlike idStr/acStr/runtimeStr in the same component"
  missing:
    - "Pad the badge string (×${attemptCount} / ◆ / blank) to a fixed width (matching the widest realistic badge) before interpolating into the <text> element, same pattern as idStr/acStr/runtimeStr"
  debug_session: ".planning/debug/browse-badge-alignment-misaligned.md"
