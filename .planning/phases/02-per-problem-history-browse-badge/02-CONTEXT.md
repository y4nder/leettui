# Phase 2: Per-Problem History & Browse Badge - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface submission data that Phase 1 already stores in SQLite — nothing here adds
new data collection or API calls. Two deliverables: (1) a focusable per-problem
**history panel** in ProblemView listing every attempt (any verdict) newest-first,
with a best-vs-latest AC runtime comparison and subtle inline percentile, and
(2) a richer **attempt-count badge** in the browse question list, replacing the
existing binary solved/attempted signal's informational ceiling.

Discussion clarified the **presentation and layout decisions** — row content and
styling, the best/latest comparison's presentation, where the new panel sits
among existing ProblemView panels, and the badge's meaning/placement in the
browse list. The data layer (schema, CRUD, backfill) was locked in Phase 1 and
is carried forward, not re-decided.
</domain>

<decisions>
## Implementation Decisions

### History Panel — Row Content & Percentile
- **D-01:** Rows are a **compact single line**, all fields abbreviated to
  maximize rows visible over per-field readability — target shape like
  `✓ py3 45ms 18mb 2d ago` (status, language, runtime, memory, relative
  timestamp).
- **D-02:** The verdict (AC/WA/TLE/CE/RE/MLE) is **color-coded like difficulty**
  — consistent with the existing difficulty-color and status-icon conventions
  already used elsewhere in the app (AC=green-family, WA/RE/MLE=red-family,
  TLE=yellow/orange, CE=gray/dim — exact tokens are Claude's discretion).
- **D-03:** Percentile is a **dim inline parenthetical right after runtime**
  (e.g. `45ms (top 82%)`), and is **omitted entirely** (no dash/placeholder)
  when null — which is always true for backfilled rows, per HIST-03's
  "present but never a headline."
- **D-04:** The panel **always renders**, even with zero submissions — shows a
  plain dim "No attempts yet" message rather than hiding/collapsing the panel
  (keeps the 4-panel layout and focus-cycling order stable regardless of data).

### Best-vs-Latest Runtime Surfacing (HIST-02)
- **D-05:** Surfaced as a **single summary line above the scrollable row
  list** (not inline markers on individual rows), computed from AC rows only.
- **D-06:** The summary line is **hidden entirely until 2+ accepted
  submissions exist** — avoids a redundant "Best: 42ms · Latest: 42ms" (1 AC)
  or an empty comparison (0 AC).
- **D-07:** The line includes a **color/arrow indicator** for whether the
  latest AC improved, regressed, or matched the best (e.g.
  `Best: 42ms · Latest: 38ms ↓` in a positive color) — direct visual feedback
  on whether a re-solve helped.

### History Panel Placement in ProblemView
- **D-08:** Added as a **new 4th panel below Related** in the existing
  right-column stack: Solutions → Result → Related → **History**. Related
  keeps its current position and visual weight; nothing existing moves.
- **D-09:** With 4 panels now sharing the right column, **all four shrink
  their row budget roughly equally** as terminal height shrinks — extends
  RelatedPanel's existing shared-viewport `maxRows` computation to 4 panels
  rather than protecting or deprioritizing any single one.
- **D-10:** The panel is **read-only/navigate-only in this phase** (j/k,
  gg/G like RelatedPanel) — **Enter is reserved** for a future
  "view submission detail" action but that view is not built now (see
  Deferred Ideas).

### Browse Attempt-Count Badge (BROWSE-01)
- **D-11:** The badge is a **raw attempt count** (e.g. `×3`), shown whenever
  count > 0, omitted entirely for never-attempted problems (no `×0` clutter).
- **D-12:** The count includes **every submission regardless of verdict**
  (AC+WA+TLE+...) — consistent with Phase 1's D-08 (store every attempt).
  A problem with several failed attempts before an eventual AC will show the
  larger raw number; this was a deliberate choice over an AC-only count.
- **D-13:** The badge **reuses/extends the existing ◆ solution-file-marker
  slot** in `QuestionList` rows, rather than adding a new column or replacing
  the last-accepted-runtime column.
- **D-14:** Within that shared slot, the two signals are **mutually
  exclusive per row**: the attempt count wins whenever attempts > 0; ◆ only
  shows as a fallback when a solution file exists locally but zero
  submissions have been made yet.

### Claude's Discretion
- Exact glyph spacing/abbreviation format for the compact single-line row
  (language abbreviation, exact relative-timestamp format — reuse
  `relativeTime.ts`'s `formatRelative`).
- Tie-breaking display order when multiple AC submissions share the same
  displayed runtime bucket (LeetCode reports runtime in coarse ms buckets) —
  most-recent-among-ties is the sane default.
- Exact color/theme tokens for the newly-needed verdict colors (TLE, RE, MLE,
  CE) beyond the already-established AC/WA convention.
- Focus-cycling order (Tab/Shift+Tab) and spatial neighbors (Ctrl+h/j/k/l)
  for the new 4th panel — follow the established `PROBLEM_PANEL_ORDER` /
  `PROBLEM_PANEL_NEIGHBORS` pattern, extended by one slot.
- The exact new aggregate query needed in `src/db/submissions.ts` for the
  browse badge's per-question count (none exists yet — `getSubmissionsForQuestion`
  returns full rows, not a count; a new lightweight count query or a
  computed-in-JS approach is planner's call).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning docs
- `.planning/PROJECT.md` — Core value, milestone scope; badge/achievement
  gamification is explicitly out of scope (informs D-11/D-12: count is
  practical info, not a trophy/decoration).
- `.planning/REQUIREMENTS.md` §History (Per-Problem) — HIST-01, HIST-02,
  HIST-03; §Browse Integration — BROWSE-01 (full requirement text).
- `.planning/ROADMAP.md` §"Phase 2: Per-Problem History & Browse Badge" —
  goal, 4 success criteria, the 2 pre-scoped plans (02-01 history
  slice/panel, 02-02 browse badge).
- `.planning/phases/01-submission-store-backfill/01-CONTEXT.md` — Phase 1
  decisions, especially **D-08** (store all submissions regardless of
  verdict), which directly grounds this phase's D-02 (every verdict shown)
  and D-12 (count includes every verdict).

### Codebase maps (brownfield — read before touching code)
- `.planning/codebase/ARCHITECTURE.md` — layered flow, UI-vs-domain Zustand
  slice split (needed for the new `submissionsSlice`).
- `.planning/codebase/CONVENTIONS.md`, `STRUCTURE.md` — code style, directory
  layout, co-located test pattern.
- `.planning/codebase/STACK.md` — OpenTUI/React/Bun/Drizzle stack.

### Code seams to mirror (paths verified during codebase scout)
- `src/db/schema.ts:64-84` — `submissions` table: `submissionId` PK,
  `questionId`, `titleSlug`, `lang`, `statusDisplay`, `runtime`/`memory`
  (nullable text), `submittedAt`, `runtimePercentile`/`memoryPercentile`
  (nullable real).
- `src/db/submissions.ts` — `DbSubmission` interface;
  `getSubmissionsForQuestion(questionId)` already returns rows newest-first —
  the history panel's direct data source. **No aggregate count query exists
  yet** — needed for the browse badge.
- `src/ui/components/RelatedPanel.tsx` — closest analog: windowed scroll
  (`scrollOffset` tracks `focusedIndex`), fixed `maxRows` viewport budget,
  `flexShrink={0}`.
- `src/views/problem/ProblemView.tsx:158-225` — right-column panel stack
  layout, `maxRows` computation, `RelatedPanel` instantiation — the History
  panel slots in here.
- `src/ui/store/slices/problemSlice.ts` — `PROBLEM_PANEL_ORDER` (lines
  21-26) and `PROBLEM_PANEL_NEIGHBORS` (lines 35-43) drive Tab/Shift+Tab and
  Ctrl+h/j/k/l cycling; extend both for the new panel.
- `src/views/problem/handlers.ts:95-121` — `handleEnterProblemView`,
  `Promise.all` fetch-then-populate-store pattern. Submissions are local DB
  reads (synchronous), unlike Related's GraphQL fetch — no async loading
  state needed for History.
- `src/ui/store/slices/questionsSlice.ts` (`// type: domain`) — template for
  the new `submissionsSlice`; its `solutionFileIds` `Set`-based
  computed-on-refresh pattern is the analog for a badge-count `Map`.
- `src/ui/components/QuestionList.tsx:77-96` — per-row rendering order:
  status icon, `◆` solution-file marker (line 85), id, title, paid lock,
  acceptance rate, difficulty color, last-accepted runtime. The badge slot
  sits at/replaces the `◆` marker per D-13/D-14.
- `src/api/types.ts:130-131` — `CheckResponse.runtime_percentile` /
  `memory_percentile` (optional numbers).
- `src/core/submission.ts:50-71` — `appendSubmissionRecord`, percentile
  mapping (`?? null`).
- `src/core/backfill.ts:101-102` — percentiles explicitly nulled for
  backfilled rows (confirms D-03's null-handling is the common case, not an
  edge case).
- `src/ui/components/RecentPopup.tsx` — reuses `QuestionList`-style rows and
  `relativeTime.ts`'s `formatRelative` for timestamps — reference for D-01's
  relative-timestamp formatting.

No external ADRs/specs beyond the planning docs and codebase maps above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getSubmissionsForQuestion(questionId)` (`src/db/submissions.ts`) — already
  newest-first; feeds the history panel directly, no new query needed for
  HIST-01/02/03 row data itself (only the badge needs a new count query).
- `RelatedPanel.tsx`'s windowing (`scrollOffset` + `maxRows`) — directly
  reusable for the History panel's scrollable row list.
- `relativeTime.ts`'s `formatRelative` — reusable for row timestamps.
- `questionsSlice.ts`'s `solutionFileIds` `Set`-based computed-on-refresh
  pattern — template for a new attempt-count `Map` for the browse badge.

### Established Patterns
- UI-vs-domain slice split: new `submissionsSlice` (domain) for per-problem
  reads/aggregate counts; `problemSlice` (UI) owns focus/scroll state for
  the new panel.
- `PROBLEM_PANEL_ORDER` / `PROBLEM_PANEL_NEIGHBORS` extension pattern for
  adding a 4th focusable panel to ProblemView.
- Shared/recomputed `maxRows` viewport budget across panels (D-09 extends
  this from 3 to 4 panels).

### Integration Points
- New History panel wires into `ProblemView.tsx` alongside
  Solutions/Result/Related, sharing the `maxRows` budget computation.
- Browse badge wires into `QuestionList.tsx` row rendering plus a new
  count `Map`/`Set` computed in `questionsSlice`'s init/refresh, backed by a
  new aggregate query added to `src/db/submissions.ts`.
- The Enter binding on History rows is reserved (unbound in this phase) via
  a scoped `useBindings` layer like `relatedPanelBindings`, to leave the key
  free for the deferred submission-detail view.

</code_context>

<specifics>
## Specific Ideas

- Row format target: `✓ py3 45ms 18mb 2d ago` — compact, abbreviated,
  color-coded status.
- Best/latest summary line target: `Best: 42ms · Latest: 38ms ↓` with color
  signaling whether the latest AC improved.
- Browse badge target: `×3` sitting where the `◆` solution-file marker
  currently is, `◆` only showing when there's a solution file but no
  submissions yet.

</specifics>

<deferred>
## Deferred Ideas

- **Submission detail view** (full code/diff for a past submission), opened
  via Enter on a History panel row. Enter is reserved for this in Phase 2
  (D-10) but the detail view itself is a new capability — belongs in a
  later phase, not this one.

None of the above is scope creep into this phase — discussion stayed within
the Phase 2 history-panel/browse-badge boundary.

</deferred>

---

*Phase: 2-Per-Problem History & Browse Badge*
*Context gathered: 2026-07-01*
