# Phase 2: Per-Problem History & Browse Badge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 2-Per-Problem History & Browse Badge
**Areas discussed:** History row content & percentile styling, Best-vs-latest runtime surfacing, History panel placement in ProblemView, Browse badge design

---

## History row content & percentile styling

| Option | Description | Selected |
|--------|-------------|----------|
| Status + runtime + timestamp first | Status icon, runtime, and relative timestamp always visible; language/memory truncate first | |
| Status + language first | Status and language lead each row | |
| Compact single-line, all fields abbreviated | Squeeze all 5 fields onto one abbreviated line, maximizing rows visible | ✓ |

**User's choice:** Compact single-line, all fields abbreviated

| Option | Description | Selected |
|--------|-------------|----------|
| Color-coded like difficulty | AC=green, WA/RE/MLE=red, TLE=yellow/orange, CE=gray/dim | ✓ |
| Symbol-only, no color | Distinct glyph per verdict, no color | |
| Color + symbol combined | Colored glyph + abbreviated text label | |

**User's choice:** Color-coded like difficulty

| Option | Description | Selected |
|--------|-------------|----------|
| Dim inline parenthetical, omitted when null | e.g. '45ms (top 82%)' dimmed; nothing shown for backfilled/null rows | ✓ |
| Dim inline parenthetical, dash when null | Same styling, explicit '—' placeholder when null | |
| Separate trailing column, blank when null | Percentile gets its own fixed-width column | |

**User's choice:** Dim inline parenthetical, omitted when null

| Option | Description | Selected |
|--------|-------------|----------|
| Plain empty-state message | Panel always renders; shows 'No attempts yet' | ✓ |
| Panel hidden/collapsed entirely | Panel doesn't appear until 1+ submission exists | |

**User's choice:** Plain empty-state message
**Notes:** None.

---

## Best-vs-latest runtime surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| Summary line above the list | Compact line at top, e.g. 'Best: 42ms · Latest: 58ms', from AC rows only | ✓ |
| Inline markers on the rows themselves | Mark the best-AC and latest-AC rows directly in the list | |
| Both — summary line + marker on the best row | Summary line plus a subtle marker on the best-AC row | |

**User's choice:** Summary line above the list

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the line until 2+ ACs exist | No summary line with 0 or 1 accepted submissions | ✓ |
| Always show, single value collapses gracefully | Shows 'Best: 42ms' only with 1 AC, 'No accepted runs yet' with 0 | |

**User's choice:** Hide the line until 2+ ACs exist

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — color/arrow indicator | Colored arrow shows improved/regressed/matched | ✓ |
| No — plain numbers only | Just show both numbers, no judgment | |

**User's choice:** Yes — color/arrow indicator
**Notes:** None.

---

## History panel placement in ProblemView

| Option | Description | Selected |
|--------|-------------|----------|
| New 4th panel, added below Related | Stack becomes Solutions → Result → Related → History, all always visible | ✓ |
| Replace Related with History as the default 4th slot | History takes Related's visual weight/position | |
| History takes priority above Related | Solutions → Result → History → Related | |

**User's choice:** New 4th panel, added below Related

| Option | Description | Selected |
|--------|-------------|----------|
| Equal shrink across all 4 | All 4 panels get roughly the same reduced row budget as height shrinks | ✓ |
| History gets a guaranteed minimum, others shrink first | History always keeps ~3-4 rows minimum | |
| History is the last to get space, others protected first | Existing 3 panels keep current budgets untouched | |

**User's choice:** Equal shrink across all 4

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only, navigate only | j/k scroll only, no Enter action | |
| Enter opens submission detail (future-scoped now) | Reserve Enter for a future detail view, not built now | ✓ |

**User's choice:** Enter opens submission detail (future-scoped now)
**Notes:** Detail view itself deferred to a future phase; only the keybinding is reserved in Phase 2.

---

## Browse badge design

| Option | Description | Selected |
|--------|-------------|----------|
| Raw attempt count, next to existing icon | e.g. '✓ ×3' right after status icon | ✓ |
| Attempt count only when it adds info (>1) | Badge only appears when attempts ≥ 2 | |
| Count + best-verdict color fused into one badge | Replace binary icon with one glyph encoding verdict+count | |

**User's choice:** Raw attempt count, next to existing icon

| Option | Description | Selected |
|--------|-------------|----------|
| Every submission, any verdict | Raw total row count, all verdicts count | ✓ |
| Accepted submissions only | Only count AC attempts | |

**User's choice:** Every submission, any verdict

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse/extend the ◆ solution-file marker slot | Extend that slot to show the count | ✓ |
| New slot right after the status icon | Dedicated spot after AC/notac icon | |
| Replace the last-accepted-runtime column | Swap out 'last runtime' column for the count | |

**User's choice:** Reuse/extend the ◆ solution-file marker slot

| Option | Description | Selected |
|--------|-------------|----------|
| Count wins when present, ◆ only as fallback | Count shown whenever attempts > 0; ◆ only when solution file exists but zero submissions | ✓ |
| Keep ◆ and count as two independent marks in the same slot | Both signals shown simultaneously | |

**User's choice:** Count wins when present, ◆ only as fallback
**Notes:** None.

---

## Claude's Discretion

- Exact glyph spacing/abbreviation format for the compact single-line row (language abbreviation, relative-timestamp format reuse from `relativeTime.ts`).
- Tie-breaking display order when multiple AC submissions share the same displayed runtime bucket.
- Exact color/theme tokens for the newly-needed verdict colors (TLE, RE, MLE, CE).
- Focus-cycling order (Tab/Shift+Tab) and spatial neighbors (Ctrl+h/j/k/l) for the new 4th panel.
- The exact new aggregate query needed in `src/db/submissions.ts` for the browse badge's per-question count.

## Deferred Ideas

- Submission detail view (full code/diff for a past submission), opened via Enter on a History panel row — Enter reserved in Phase 2, detail view itself belongs in a later phase.
