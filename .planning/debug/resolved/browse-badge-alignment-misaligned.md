---
status: resolved
trigger: "browse-badge-alignment-misaligned"
created: 2026-07-01T00:00:00Z
updated: 2026-07-01T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the marker `<text>` cell in QuestionList.tsx (lines 87-90) renders `×${attemptCount}` / `◆` / `" "` as a raw variable-length string with no fixed-width padding, unlike every sibling column in the same row (`idStr`, `acStr`, `runtimeStr`) which are explicitly `.padStart()`/`.padEnd()` to a fixed character count. Because OpenTUI's `<text>` in a `flexDirection="row"` box sizes to its own content width (no fixed `width` prop on this cell), the cell's rendered width varies with the digit count of `attemptCount` (`◆`/blank = 1 char, `×1`/`×3` = 2 chars, `×32` = 3 chars, `×132` = 4 chars), which pushes every subsequent sibling `<text>` (idStr, title, acStr, difficulty, runtime) left/right by the delta — breaking the vertical column alignment the user reported.
test: Read src/ui/components/QuestionList.tsx in full; compared marker-cell render (line 88-90) against the three other data-driven cells in the same row that DO pad (idStr line 71, acStr line 77, runtimeStr line 78) which are then rendered as already-fixed-width strings (lines 91, 96).
expecting: n/a — root cause confirmed via direct code read, no runtime test needed (mode: find_root_cause_only)
next_action: none — diagnosis complete, returning ROOT CAUSE FOUND to caller

## Symptoms

expected: The submitted problem shows `×N` in the marker slot; the never-attempted problem shows blank (no `×0`); the solution-file-only problem shows `◆`. The marker slot should behave like a fixed-width column so subsequent columns (problem number, title, acceptance %, difficulty) stay vertically aligned regardless of what's rendered in the slot.
actual: User reported (verbatim): "passed but I want changes for this one, because it kinda misaligned the ui" — accompanied by a screenshot of the browse question list showing that rows with `×32`, `×6`, `×5` etc. push the following problem-number/title text further right than rows with `×1`, `×3`, or no badge at all, breaking column alignment.
errors: None reported
reproduction: Test 6 in UAT (.planning/phases/02-per-problem-history-browse-badge/02-UAT.md) — open browse view, look at the question list where some rows have varying attempt counts.
started: Introduced by Phase 02 Plan 02 (02-02-PLAN.md, Task 2), which replaced the previously-always-single-character `◆`-only marker with a variable-width `×N` string in the same unpadded `<text>` cell.

## Eliminated

(none — root cause found directly via code read on the first pass, no false hypotheses tested)

## Evidence

- timestamp: investigation start
  checked: src/ui/components/QuestionList.tsx (full file, 105 lines)
  found: |
    Per-row render (lines 67-99). The marker cell:
      ```
      <text fg={colors.accent}>
        {attemptCount > 0 ? `×${attemptCount}` : hasSolution ? "◆" : " "}
      </text>
      ```
    has NO padStart/padEnd and no fixed `width` prop — it is raw string interpolation.
    Compare to the three sibling data cells in the exact same row, all of which pre-pad the string to a fixed char count before interpolating it into the `<text>`:
      - `idStr = String(q.id).padStart(4, " ")` → rendered `<text> {idStr} </text>` (line 71, 91)
      - `acStr = formatAcRate(q.ac_rate).padStart(6, " ")` → rendered `<text> {acStr} </text>` (line 77, 96)
      - `runtimeStr = (q.last_runtime ?? "").padStart(8, " ")` → rendered `<text>{runtimeStr} </text>` (line 78, 98)
      - the status icon cell (`<text> {icon} </text>`, line 87) is also inherently fixed-width since `statusIcon()` always returns exactly one glyph.
    Since the box is `flexDirection="row"` with no explicit widths on the `<text>` children, each `<text>` sizes to its own content — a variable-length string cell directly shifts every subsequent sibling to the right/left by the delta in character count.
  implication: This is the root cause. Before Phase 02, the slot only ever rendered `◆` or `" "` (both exactly 1 char) — so it was accidentally fixed-width and never needed explicit padding. Phase 02 (02-02-PLAN.md Task 2) introduced `×${attemptCount}`, a string whose length is `1 + digitCount(attemptCount)` (2 chars for 1-9, 3 chars for 10-99, 4 chars for 100+), without adding the same fixed-width padding treatment given to every other data column in the row. The plan's acceptance criteria (02-02-PLAN.md lines 132-139) verified content/precedence correctness (×N vs ◆ vs blank) but never specified a fixed rendered width for the cell — a gap in the plan's `must_haves`, not an implementation deviation from what was speced.

- timestamp: investigation start
  checked: .planning/phases/02-per-problem-history-browse-badge/02-02-PLAN.md (Task 2, lines 110-140)
  found: |
    Task 2's action text (line 125) says: "replace the current ◆-only marker `<text>` with the D-14 precedence: render `×{attemptCount}` when `attemptCount > 0` ..., else `◆` ..., else a single space. Keep it in the SAME slot/column (the existing accent-colored `<text>` at the ◆ position — do not add a new column or move the runtime/acceptance columns, D-13)." No mention of fixed-width padding for the new variable-length string.
  implication: Confirms the plan itself never called for width-padding the new badge content, despite the neighboring plan for the same task explicitly requiring "the SAME slot/column" treatment — the plan conflated "same column position" with "same rendered width," which are different guarantees. The `◆`-vs-space precedent was accidentally fixed-width; `×N` is not.

- timestamp: investigation start
  checked: .planning/phases/02-per-problem-history-browse-badge/02-UAT.md (Test 6, lines 37-41 + Gaps section lines 68-76)
  found: User confirmed via screenshot that ×32/×6/×5 rows are visibly misaligned vs ×1/×3/blank rows, matching the hypothesis exactly (badge string length directly correlates with row-shift direction/magnitude).
  implication: Directly corroborates the code-level root cause — no alternate explanation (e.g. terminal rendering bug, unrelated column change) needed.

## Resolution

root_cause: |
  In src/ui/components/QuestionList.tsx, the attempt-count marker cell (lines 87-90) renders `×${attemptCount}` / `◆` / `" "` as an unpadded, variable-length string inside a `<text>` element that has no fixed `width`. Because the parent `<box flexDirection="row">` sizes each child `<text>` to its own content width, and every OTHER data column in the row (`idStr`, `acStr`, `runtimeStr`) is explicitly pre-padded to a fixed character count via `.padStart()`/`.padEnd()` before being interpolated, the marker cell is the only column in the row without fixed-width treatment. The previous `◆`-only marker was always exactly 1 character (or a single space when empty) so it accidentally behaved like a fixed-width column; Phase 02's `×N` replacement is 2-4+ characters depending on `attemptCount`'s digit count, so rows with larger attempt counts render a wider marker cell, pushing every subsequent column (problem ID, title, acceptance %, difficulty, runtime) to the right relative to rows with a 1-digit count or no badge — breaking vertical column alignment down the list.
fix: (not applied — find_root_cause_only mode; suggested direction below)
verification: (not applicable — diagnosis only)
files_changed: []
