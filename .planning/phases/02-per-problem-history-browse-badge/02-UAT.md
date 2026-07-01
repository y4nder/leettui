---
status: testing
phase: 02-per-problem-history-browse-badge
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-07-01T03:18:51Z
updated: 2026-07-01T03:18:51Z
---

## Current Test

number: 1
name: History panel rendering, colors, and placement
expected: |
  History renders as the 4th right-column panel below Related (Solutions unchanged); rows read like `✓ py3 45ms 18mb 2d ago`, newest-first; verdict glyph color visibly differs for AC (green) vs WA/RE/MLE (red) vs TLE (yellow/orange) vs CE (dim).
awaiting: user response

## Tests

### 1. History panel rendering, colors, and placement
expected: History renders as the 4th right-column panel below Related (Solutions unchanged); rows read like `✓ py3 45ms 18mb 2d ago`, newest-first; verdict glyph color visibly differs for AC (green) vs WA/RE/MLE (red) vs TLE (yellow/orange) vs CE (dim).
result: [pending]

### 2. Best/Latest AC runtime summary line
expected: `Best: {n}ms · Latest: {n}ms {arrow}` renders above the row list, colored green/red/dim for improved/regressed/matched; no such line renders under 2 AC.
result: [pending]

### 3. Empty state and 4-panel viewport shrink
expected: A dim 'No attempts yet' line renders inside a still-bordered/titled panel; on a short terminal no panel's rows overlap or get cut off oddly.
result: [pending]

### 4. History focus/navigation and Help popup
expected: Tab/[5] focuses History (accent border); j/k/gg/G move the row cursor within the windowed list; Enter does nothing (no submission-detail view, deliberately unbound); the Help popup (?) shows History's real local keys (j/k) instead of a generic scroll layer.
result: [pending]

### 5. Live percentile vs. backfilled-row percentile absence
expected: The live-submitted row shows a dim `(top N%)` parenthetical after the runtime; backfilled rows show no percentile text at all (no dash/placeholder).
result: [pending]

### 6. Browse attempt-count badge appearance and precedence
expected: The submitted problem shows `×N` in the marker slot (N = total attempts across all verdicts, matching your real history); the never-attempted problem shows blank (no `×0`); the solution-file-only problem shows `◆`.
result: [pending]

### 7. Live badge refresh after backfill import
expected: Badges update to reflect newly-imported submission counts immediately after the backfill finishes (or is cancelled/rate-limited/errors), with no app restart required.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
