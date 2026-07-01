# Phase 2: Per-Problem History & Browse Badge - Research

**Researched:** 2026-07-01
**Domain:** OpenTUI/React panel UI + Drizzle/SQLite aggregate queries (brownfield — no new libraries)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**History Panel — Row Content & Percentile**
- D-01: Rows are a compact single line, all fields abbreviated to maximize rows visible — target shape like `✓ py3 45ms 18mb 2d ago` (status, language, runtime, memory, relative timestamp).
- D-02: The verdict (AC/WA/TLE/CE/RE/MLE) is color-coded like difficulty — consistent with existing difficulty-color/status-icon conventions (AC=green-family, WA/RE/MLE=red-family, TLE=yellow/orange, CE=gray/dim — exact tokens are Claude's discretion).
- D-03: Percentile is a dim inline parenthetical right after runtime (e.g. `45ms (top 82%)`), omitted entirely (no dash/placeholder) when null — always true for backfilled rows.
- D-04: The panel always renders, even with zero submissions — plain dim "No attempts yet" message, keeps the 4-panel layout and focus-cycling order stable.

**Best-vs-Latest Runtime Surfacing (HIST-02)**
- D-05: Surfaced as a single summary line above the scrollable row list (not inline row markers), computed from AC rows only.
- D-06: The summary line is hidden entirely until 2+ accepted submissions exist.
- D-07: The line includes a color/arrow indicator for whether the latest AC improved, regressed, or matched the best (e.g. `Best: 42ms · Latest: 38ms ↓` in a positive color).

**History Panel Placement in ProblemView**
- D-08: Added as a new 4th panel below Related in the right-column stack: Solutions → Result → Related → History. Nothing existing moves.
- D-09: With 4 panels sharing the right column, all four shrink their row budget roughly equally as terminal height shrinks — extends RelatedPanel's shared-viewport `maxRows` computation to 4 panels.
- D-10: The panel is read-only/navigate-only in this phase (j/k, gg/G like RelatedPanel) — Enter is reserved for a future "view submission detail" action, not built now.

**Browse Attempt-Count Badge (BROWSE-01)**
- D-11: The badge is a raw attempt count (e.g. `×3`), shown whenever count > 0, omitted entirely for never-attempted problems.
- D-12: The count includes every submission regardless of verdict (AC+WA+TLE+...), consistent with Phase 1's D-08.
- D-13: The badge reuses/extends the existing `◆` solution-file-marker slot in `QuestionList`, rather than adding a new column.
- D-14: Within that shared slot, the two signals are mutually exclusive per row: attempt count wins whenever attempts > 0; `◆` only shows as a fallback when a solution file exists locally but zero submissions have been made.

### Claude's Discretion
- Exact glyph spacing/abbreviation format for the compact single-line row (language abbreviation, exact relative-timestamp format — reuse `relativeTime.ts`'s `formatRelative`).
- Tie-breaking display order when multiple AC submissions share the same displayed runtime bucket — most-recent-among-ties is the sane default.
- Exact color/theme tokens for the newly-needed verdict colors (TLE, RE, MLE, CE) beyond the already-established AC/WA convention.
- Focus-cycling order (Tab/Shift+Tab) and spatial neighbors (Ctrl+h/j/k/l) for the new 4th panel — follow the established `PROBLEM_PANEL_ORDER`/`PROBLEM_PANEL_NEIGHBORS` pattern, extended by one slot.
- The exact new aggregate query needed in `src/db/submissions.ts` for the browse badge's per-question count (none exists yet) — a new lightweight count query or a computed-in-JS approach is planner's call.

### Deferred Ideas (OUT OF SCOPE)
- Submission detail view (full code/diff for a past submission), opened via Enter on a History panel row. Enter is reserved for this in Phase 2 (D-10) but the detail view itself belongs in a later phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| HIST-01 | ProblemView shows a per-problem submission-history panel listing every attempt with status, language, runtime, memory, timestamp | §Architecture Patterns (History Panel), §Code Examples (row data source, lang abbreviation gap), §Common Pitfalls (verdict-color mapping doesn't exist yet, 4-panel viewport math) |
| HIST-02 | History panel surfaces best (fastest AC) vs. latest AC runtime | §Common Pitfalls (runtime string parsing — no existing utility), §Code Examples (best/latest derivation) |
| HIST-03 | Per-attempt runtime/memory percentile shown inline, present but not prominent | §Code Examples (percentile formatting/rounding), D-03 already fully specifies placement |
| BROWSE-01 | Browse question list shows an attempt-count badge, richer than binary solved/attempted | §Architecture Patterns (aggregate query design), §Common Pitfalls (backfill never refreshes browse state today — a real gap this phase must close) |
</phase_requirements>

## Summary

This phase is pure brownfield extension work: every mechanism it needs (windowed focusable panel, shared-viewport row budgeting, domain/UI slice split, raw-SQL aggregate queries via Drizzle, relative-time formatting) already has a working precedent in this exact codebase. No new npm packages, no new external APIs — Phase 1 already stores every submission verdict in SQLite. The job is almost entirely "extend an established pattern by one instance," which the CONTEXT.md canonical refs already scope precisely (file:line accuracy verified against the current source during this research pass — all references are current).

The two areas that are **not** simple copy-paste from an existing analog, and where this research adds value beyond CONTEXT.md: (1) verdict → color mapping is a genuinely new 6-way function — the codebase's only existing status-color helpers (`statusColor()` in `theme.ts`, `ResultKind` in `resultView/types.ts`) are both 2-3-way and keyed on different data (`question.status` / a run-result kind), not on `submissions.statusDisplay` free text; and (2) the best/latest comparison requires parsing a display string like `"52 ms"` into a comparable number — no such parser exists anywhere in the codebase today. Both are small, but a planner who assumes "just reuse `statusColor`" or "just compare the strings" will ship a bug.

A third, higher-stakes finding: the existing backfill command (`handleStartBackfill` in `src/views/browse/handlers/backfill.ts`) **never calls `refreshQuestions()` or any store refresh on completion**. Phase 1 didn't need it to (nothing in browse read submission data yet). Phase 2 changes that — the new browse badge reads a submission-count map that must be recomputed after a backfill run, or the badge will silently show stale (zero) counts until the user manually re-syncs or restarts. This must be added as an explicit task in plan 02-02.

**Primary recommendation:** Implement History panel + summary line as new pure-JS derivations over the already-available `getSubmissionsForQuestion()` rows (no new DB query needed there); add exactly one new aggregate query (`getSubmissionCountsByQuestion()`, GROUP BY) for the badge, own its result as a `Map<number, number>` living beside `solutionFileIds` in `questionsSlice` (not a new domain slice, despite one CONTEXT.md phrasing suggesting otherwise — see Architecture Patterns for the resolution), and wire its refresh into every place `solutionFileIds` already refreshes, **plus** the backfill completion path, which today refreshes nothing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-problem submission history read | Local Storage (SQLite via Drizzle) | UI Store (Zustand domain slice) | Data already persisted by Phase 1; UI layer only reads and formats — no business logic beyond derivation (best/latest, percentile display) |
| History panel rendering + focus/scroll | UI Component (React/OpenTUI) | UI Store (problemSlice) | Mirrors `RelatedPanel` exactly — windowed list, no new architectural concept |
| Best/latest AC runtime comparison | UI Component (derived at render or in a selector) | — | Pure computation over already-fetched rows; no new query, no persistence |
| Browse attempt-count badge | Local Storage (aggregate SQL) | UI Store (questionsSlice) | Needs a GROUP BY query the History panel's per-question read doesn't provide; owned by the same slice/lifecycle as `solutionFileIds` since both refresh on the same events |
| Backfill-triggered badge refresh | UI Store (questionsSlice refresh) | View handler (`handleStartBackfill`) | The handler currently has no store side-effect on completion; this phase must add one |

## Standard Stack

No new dependencies. This phase reuses:

| Library | Version (confirmed in `package.json`) | Purpose | Why Standard (here) |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.44.4 [VERIFIED: repo `package.json`] | Raw-SQL aggregate query (`sql` template + `.groupBy()`) for the badge count | Already used identically in `getStatusCounts()` (`src/db/questions.ts:149`) |
| `@opentui/react` / `@opentui/core` | ^0.2.16 [VERIFIED: repo `package.json`] | `<box>`/`<text>`/windowed list rendering | `RelatedPanel.tsx` is the direct template |
| `zustand` | already in `package.json` | `submissionsSlice` (new, per-problem) + extension of `questionsSlice` (badge map) | UI-vs-domain slice split is an established, documented convention (`src/ui/CLAUDE.md`) |

**Installation:** none — no `npm install` / `bun add` required for this phase.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new external packages. Every capability is built on `drizzle-orm`, `@opentui/*`, and `zustand`, all already present and used in the exact same way elsewhere in the codebase.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ ProblemView enters (Enter    │        │ Browse question list renders  │
│ on a question / Related)     │        │ (QuestionList.tsx)             │
└──────────────┬────────────────┘        └───────────────┬────────────────┘
               │                                          │
               ▼                                          ▼
   handleEnterProblemView()                    questionsSlice.init() /
   (existing — unchanged fetch                 refreshQuestions() /
   for description/related)                    refreshSolutionFiles()
               │                                          │
               ▼                                          ▼
   NEW: getSubmissionsForQuestion(id)          NEW: getSubmissionCountsByQuestion()
   (src/db/submissions.ts — EXISTS,            (src/db/submissions.ts — NEW,
   already newest-first, no query needed)      GROUP BY questionId, sql`count(*)`)
               │                                          │
               ▼                                          ▼
   problemSlice / NEW submissionsSlice          questionsSlice.attemptCounts:
   stores rows + derives best/latest            Map<questionId, number>
   (pure JS, in a selector or on enter)                    │
               │                                          ▼
               ▼                                QuestionList row render:
   HistoryPanel.tsx (NEW, mirrors                attemptCounts.get(q.id) > 0
   RelatedPanel.tsx) renders rows +               ? `×{n}` : hasSolution
   the best/latest summary line                  ? `◆` : " "  (D-14 precedence)
               │
               ▼
   ProblemView.tsx right column:
   Solutions → Result → Related → History
   (relatedMaxRows-style budget split 4 ways)

   ── Separately, a gap this phase must close ──
   handleStartBackfill() (src/views/browse/handlers/backfill.ts)
   currently: writes DB rows, shows a result message, NEVER refreshes
   any store slice → badge would show stale counts after a backfill
   until next init(). This phase adds a refresh call in its finally block.
```

### Recommended Project Structure

No new top-level directories. Additions land in existing locations:

```
src/
├── db/
│   └── submissions.ts        # ADD: getSubmissionCountsByQuestion() (GROUP BY)
├── ui/
│   ├── components/
│   │   └── HistoryPanel.tsx  # NEW — mirrors RelatedPanel.tsx
│   ├── store/slices/
│   │   ├── submissionsSlice.ts  # NEW (domain) — per-problem row reads for History
│   │   ├── questionsSlice.ts    # EXTEND — add attemptCounts: Map<number, number>
│   │   └── problemSlice.ts      # EXTEND — PROBLEM_PANEL_ORDER/NEIGHBORS + focusedHistoryIndex
│   ├── format/ or verdict.ts    # NEW small pure util — verdictColor(statusDisplay), parseRuntimeMs(str)
│   └── keymap/
│       ├── bindings.ts          # EXTEND — historyPanelBindings (mirrors relatedPanelBindings)
│       └── commands/problem.ts  # EXTEND — problem.focusHistory ("5"), problem.historyNext/Prev
├── views/problem/
│   └── handlers.ts              # EXTEND — refreshProblemSubmissions() analog to refreshProblemSolutions()
└── views/browse/handlers/
    └── backfill.ts              # EXTEND — refresh badge map on completion (all exit paths, see Pitfalls)
```

### Pattern 1: Windowed focusable panel (History mirrors Related)

**What:** A `flexShrink={0}` bordered box with a title row, a `scrollOffset` that tracks a focused index, and a `maxRows` prop computed by the parent from remaining terminal height.
**When to use:** Exactly this case — a 4th panel in the same right column.
**Example (existing code, `RelatedPanel.tsx:32-37`, the pattern to copy verbatim for History):**
```typescript
// Source: src/ui/components/RelatedPanel.tsx (in-repo, verified)
const visibleCount = Math.max(1, Math.min(maxRows, related.length));
let scrollOffset = 0;
if (focusedIndex >= scrollOffset + visibleCount) scrollOffset = focusedIndex - visibleCount + 1;
if (focusedIndex < scrollOffset) scrollOffset = focusedIndex;
const visible = related.slice(scrollOffset, scrollOffset + visibleCount);
```
D-04 requires History to *always* render (even 0 rows) with a "No attempts yet" message — this differs from Related only in that Related's empty state ("No related questions") already exists as the same pattern, so no new empty-state mechanism is needed, just new copy.

### Pattern 2: Shared 4-way viewport budget (extends D-09)

**What:** `ProblemView.tsx:158-160` currently computes `relatedMaxRows` as `mainHeight − solutionsRows − RESULT_FLOOR − 8` (a single fixed chrome constant, `8`, baked in as "3 panels' worth of borders/titles").
**Risk:** Simply keeping the same formula and giving History the same `relatedMaxRows` value would double-count vertical space that doesn't exist — Related and History would both compute a `maxRows` that assumes only 3 panels' chrome is being subtracted, when 4 now are. The `8` constant needs to become a per-panel chrome cost (border+title ≈ 2 rows each) multiplied by the panel count, then whatever remains split (roughly) evenly across Related + History, not handed identically to both.
**Recommendation:** Introduce a single `RIGHT_COLUMN_CHROME_PER_PANEL` constant (empirically ~2: one border-inclusive title row + one border edge shared with siblings) and compute:
```typescript
const chromeRows = 2 /* solutions title+border overhead already counted separately */
  + 2 * 2; // Related + History each add one bordered box
const sharedMaxRows = Math.max(
  2,
  Math.floor((mainHeight - solutionsRows - RESULT_FLOOR - chromeRows) / 2),
);
```
passing `sharedMaxRows` to both `RelatedPanel` and `HistoryPanel`. The exact constant is a tuning detail (verify visually against a real terminal, as the original `8` clearly was), but the *shape* — divide remaining rows by the panel count sharing the budget, not copy the same total to each — is the structural fix D-09 requires. A planner who copies `relatedMaxRows` unchanged into two props will under-shrink on short terminals (rows silently overflow past `mainHeight`, since `RelatedPanel`/`HistoryPanel` are `flexShrink:0`).

### Pattern 3: Domain aggregate query via raw `sql` template (Drizzle, GROUP BY)

**What:** The exact idiom already used in `getStatusCounts()` (`src/db/questions.ts:149-163`), extended with `.groupBy()`. Drizzle's official docs confirm both the `count()` helper and the `sql` template approach for grouped aggregates [CITED: orm.drizzle.team/docs/guides/count-rows].
**Example (new code to add to `src/db/submissions.ts`):**
```typescript
// Source: pattern verified against src/db/questions.ts:149-163 (in-repo)
// and Drizzle ORM's own count-rows guide [CITED: orm.drizzle.team/docs/guides/count-rows]
import { count } from "drizzle-orm"; // already importable — drizzle-orm 0.44.4 exports it

export function getSubmissionCountsByQuestion(): Map<number, number> {
  const rows = getDb()
    .select({ questionId: submissions.questionId, n: count() })
    .from(submissions)
    .groupBy(submissions.questionId)
    .all();
  return new Map(rows.map((r) => [r.questionId, r.n]));
}
```
This hits the existing `idx_sub_question_time` index (leading column `questionId`) — no new index/migration needed for BROWSE-01.

### Pattern 4: Best/latest AC comparison is pure JS over already-fetched rows

**What:** `getSubmissionsForQuestion(id)` already returns newest-first. AC rows are `rows.filter(r => r.statusDisplay === "Accepted")`. `latest` = `acRows[0]` (already newest since the whole list is newest-first); `best` = `Math.min(...acRows.map(parseRuntimeMs).filter(n => n != null))`.
**Example:**
```typescript
// NEW — no existing utility does this anywhere in the codebase
function parseRuntimeMs(runtime: string | null): number | null {
  if (!runtime) return null;
  const m = /^([\d.]+)\s*ms$/.exec(runtime.trim());
  return m ? Number(m[1]) : null; // unrecognized unit/format -> null, never throws
}
```
Verified format from Phase 1's live spike: `status_runtime` is `"52 ms"` (space before unit) [VERIFIED: Phase 1 live spike, `01-RESEARCH.md` line 454, `scripts/spike-submission-list.ts`]. The regex above is deliberately narrow (only `ms`) — LeetCode runtime is always sub-second for accepted submissions on the problems this tool targets; a broader parser is unneeded scope. Memory strings (`"16.4 MB"`) follow the same shape if a memory-based comparison is ever wanted, but HIST-02 only asks for runtime.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Relative timestamp formatting | A new date-diff formatter | `relativeTime.ts`'s `formatRelative(ms)` | Already handles the exact "just now / Nm / Nh / Nd / Nw / Nmo / Ny" ladder used by `RecentPopup`; History rows want the identical style |
| Windowed scroll-follows-cursor math | A new scroll-offset algorithm for HistoryPanel | Copy `RelatedPanel.tsx`'s inline scrollOffset block (Pattern 1) or the shared `useScrollOffset` hook used by `QuestionList`/`RecentPopup` | Two nearly-identical implementations exist in the codebase already (inline in `RelatedPanel`, hook-based in `useScrollOffset.ts`) — pick the hook-based one for consistency with `QuestionList`/`RecentPopup` if a fresh choice is being made, since it's the more reused form |
| Difficulty-style color coding | A bespoke switch statement duplicated per component | One new `verdictColor(statusDisplay: string): ThemeColor` helper, analogous to `difficultyColor()`/`statusColor()` in `theme.ts` | Keeps the AC/WA/TLE/CE/RE/MLE → color mapping in one place so History rows and any future reuse (e.g. a submission-detail view) stay consistent |

**Key insight:** Nothing here is genuinely novel engineering — the risk in this phase is *not* under-building, it's assuming an existing helper covers a case it doesn't (verdict colors, runtime parsing, backfill refresh) and skipping it.

## Common Pitfalls

### Pitfall 1: Verdict color mapping does not exist yet — do not reach for `statusColor()`
**What goes wrong:** `theme.ts`'s `statusColor(status)` only understands `question.status` (`"ac" | "notac" | null`) — a completely different field from `submissions.statusDisplay` (free text: `"Accepted"`, `"Wrong Answer"`, `"Time Limit Exceeded"`, `"Compile Error"`, `"Runtime Error"`, `"Memory Limit Exceeded"`, `"Output Limit Exceeded"`, `"Timeout"`, `"Unknown"` — see `statusDisplayFromCode()` in `src/core/submission.ts:22-43`). Likewise `resultView/types.ts`'s `ResultKind` collapses TLE/MLE/CE/RE/OLE all into a single `"error"` kind — it was never designed to color-differentiate them. A planner or implementer who assumes one of these already does what D-02 wants will produce a panel where every non-AC/WA row renders the same color.
**Why it happens:** Both existing helpers were built for narrower purposes (browse row status, run/submit result banner) before per-verdict color-coding was a requirement.
**How to avoid:** Build one new `verdictColor(statusDisplay: string): ThemeColor` (or accept a normalized code instead of the free-text string, see Pitfall 2) that maps to `colors.success` (AC), `colors.error` (WA/RE/MLE), `colors.warn` (TLE), `colors.subtle`/`colors.fgDim` (CE and anything unmapped). Add a fallback branch for unrecognized strings that dims rather than throws or defaults to accent.
**Warning signs:** A History panel where WA and TLE render identically, or where a backfilled row with an unexpected `statusDisplay` string (e.g. `"Internal Error"`) shows the accent/white color as if it were a "special" state rather than gracefully falling through.

### Pitfall 2: `statusDisplay` is free text from two different sources — match defensively, not by exact enum
**What goes wrong:** Live-submit rows get `statusDisplay` from `data.status_msg ?? statusDisplayFromCode(...)` (`src/core/submission.ts:64`) — LeetCode's own `status_msg` string. Backfilled rows get it verbatim from the `submissionList` API's `statusDisplay` field (`src/core/backfill.ts:97`) — a *different* API endpoint. Phase 1's research treated these as "the same enum of strings" but never exhaustively diffed the two sources against each other; only `"Accepted"`/`"Wrong Answer"`/etc. were spot-checked, not guaranteed byte-identical across both endpoints for every code path (e.g. does the live endpoint ever say "Time Limit Exceeded" while the historical one says "TLE"? Unverified either way).
**Why it happens:** Two different unofficial API surfaces, reverse-engineered independently, feeding one column.
**How to avoid:** Write the verdict-color/verdict-grouping function to match on **substrings** or a small explicit lookup table with a documented default branch (`includes("Accepted")`, `includes("Wrong Answer")`, `includes("Time Limit")`, `includes("Memory Limit")`, `includes("Compile")`, `includes("Runtime")`), not `===` exact equality against a hardcoded literal set — and always have a "known-unmapped" fallback (dim, no crash) rather than assuming exhaustiveness. Best/latest computation (Pitfall filters on `"Accepted"` exactly) should get the same substring-match defensiveness for consistency, though `"Accepted"` is the single most load-bearing string in the whole feature (drives `markAccepted`, `WHERE status = 'ac'` elsewhere too) and is HIGH confidence.
**Warning signs:** A live-submitted TLE/RE row rendering with the "unmapped/dim" fallback color while a backfilled TLE row of the same problem renders correctly (or vice versa) — a sign the two sources' strings diverged for that verdict.

### Pitfall 3: No existing utility parses `"52 ms"` / `"16.4 MB"` into a number
**What goes wrong:** HIST-02's best-vs-latest comparison needs numeric runtime to compute `Math.min` and improved/regressed/matched. Grepping the codebase (`resultView/builders.ts`, `ResultBody.tsx`) shows every existing runtime/memory display path treats these fields as opaque display strings — none of them ever parses the number back out. A planner reaching for "surely there's a runtime-parsing helper already" will find nothing and may improvise something fragile inline in a render function.
**Why it happens:** Until this phase, runtime/memory were purely presentational (shown, never compared).
**How to avoid:** Add one small, unit-tested pure function (e.g. `parseRuntimeMs(runtime: string | null): number | null`) in a sensible shared location (`src/core/submission.ts` alongside `statusDisplayFromCode`, or a new tiny `src/ui/format.ts` if it's UI-only) — regex on the confirmed `"<number> ms"` shape [VERIFIED: Phase 1 live spike]. Return `null` (never throw) on anything unrecognized, per the codebase's never-throws convention for parsing external/API-sourced strings, and exclude `null` results from the `Math.min`/comparison rather than letting `NaN` poison it.
**Warning signs:** `Best: NaNms` or a crash if a malformed/unexpected runtime string ever reaches the comparison unfiltered.

### Pitfall 4: Backfill never refreshes any store state today — the badge will show stale counts
**What goes wrong:** `handleStartBackfill()` (`src/views/browse/handlers/backfill.ts:21-86`) writes rows to SQLite via `backfillSubmissions()`, then only calls `showResult(...)` with a text summary. It never calls `refreshQuestions()`, `refreshSolutionFiles()`, or (post-Phase-2) whatever refreshes the new attempt-count map. This was a correct, harmless omission in Phase 1 (nothing in browse read submission data), but Phase 2 makes it a real bug: a user who runs "Import submission history" from the command palette will see zero badges until they navigate away and back (which doesn't itself trigger a refresh either — only `handleExitProblemView` and `init()` refresh `questionsSlice`) or restart the app.
**Why it happens:** Phase 1 had no consumer of submission data in the always-visible browse view; this dependency is new to Phase 2 and easy to miss since it lives in a file this phase's canonical refs don't mention (backfill.ts isn't in CONTEXT.md's file:line list).
**How to avoid:** Add a store refresh call in `handleStartBackfill`'s `finally` block (so it fires regardless of `ok`/error/cancel outcome, since even a partial/cancelled/rate-limited run may have imported rows — `result.imported > 0` in every non-`ok` branch too). The cheapest correct fix is calling the same recompute the badge map's owning slice exposes (e.g. `refreshSubmissionCounts()` on `questionsSlice`), not a full `refreshQuestions()` re-fetch of the question list (unnecessary — questions themselves didn't change).
**Warning signs:** UAT step "run backfill, check the browse badge without restarting" fails silently (badge shows nothing) even though the DB has the rows (verifiable via `bun run db:studio`).

### Pitfall 5: CONTEXT.md's two mentions of where the badge Map lives are in tension — resolve before coding
**What goes wrong:** CONTEXT.md's `<code_context>` "Established Patterns" section says a new `submissionsSlice` (domain) owns "per-problem reads/aggregate counts," but its own "Integration Points" section two paragraphs later says the badge's count Map is "computed in `questionsSlice`'s init/refresh." A planner who reads only the first sentence may create the count map inside a brand-new `submissionsSlice` that browse's `QuestionList` render path has no natural reason to subscribe to, duplicating `questionsSlice`'s existing refresh lifecycle instead of reusing it.
**Why it happens:** The two mentions describe two different concerns (per-problem row list for the History panel vs. all-questions aggregate count for the badge) using overlapping language ("aggregate counts").
**Recommendation (resolves the tension):** Split cleanly — `submissionsSlice` (new, domain) owns **only** the per-problem submission rows + derived best/latest for the currently-open problem (feeds `HistoryPanel`, populated in `handleEnterProblemView`-adjacent logic, analogous to how `related` is populated there today). The badge's `attemptCounts: Map<number, number>` lives as a **new field directly on `questionsSlice`**, refreshed at exactly the same call sites `solutionFileIds` already refreshes (`init()`, `refreshQuestions()`, `refreshSolutionFiles()` — or a dedicated sibling action if those three diverge) plus the backfill completion path from Pitfall 4. This keeps the badge's data lifecycle identical to the marker it shares a UI slot with (D-13/D-14), which matters because both are read together in the same `QuestionList` row render.
**Warning signs:** Badge counts and the `◆` fallback marker becoming visibly out of sync (e.g. badge shows stale `×2` after a solution file is deleted, because the two now refresh on different triggers).

### Pitfall 6: Focus-cycling extension touches four files, not one
**What goes wrong:** Adding History as a focusable panel isn't just `PROBLEM_PANEL_ORDER.push("history")`. It requires coordinated edits across: `problemSlice.ts` (`ProblemPanel` union type, `PROBLEM_PANEL_ORDER`, `PROBLEM_PANEL_NEIGHBORS` — currently `related: { left: "description", up: "result" }` needs a `down: "history"` added, and a new `history: { left: "description", up: "related" }` entry), `keymap/bindings.ts` (a new `historyPanelBindings` mirroring `relatedPanelBindings` but with **no** `return`/Enter binding per D-10, plus a new `"problem.focusHistory": "5"` key binding), `keymap/commands/problem.ts` (a new `problem.focusHistory` command + `problem.historyNext`/`problem.historyPrev` commands, mirroring the `related` ones at lines 199-203 and 283-294), and `keymap/format.ts`'s `problemPanelBindings(panel)` switch (needs a `case "history": return historyPanelBindings;` arm, or the Help popup's Local Keys section will silently show the generic `scrollPanelBindings` for History instead of its real j/k-only bindings).
**Why it happens:** The keymap is intentionally spread across a few files by concern (state, bindings, commands, static-lookup-for-help) — that's a documented, deliberate architecture (`src/ui/CLAUDE.md`), not a design flaw, but it means "add a panel" is a 4-file checklist, easy to under-scope as "just extend the two arrays CONTEXT.md mentions" (which only covers `problemSlice.ts`).
**Warning signs:** Tab cycling reaches History and it looks focused (border color changes) but `?` help shows the wrong/no local keys for it, or `5` doesn't focus it at all.

## Code Examples

### Row format target (D-01), with a new language-abbreviation gap
No existing map produces `"py3"` from the langSlug `"python3"` stored in `submissions.lang`. `LANGUAGE_EXTENSIONS` (`src/api/types.ts:201-229`) maps `python3 → "py"` (a file extension, not a display abbreviation) — reusing it verbatim would render `py`, not the `py3` CONTEXT.md's row-format example shows. A small new abbreviation table (or accepting the langSlug verbatim, or a truncation heuristic) is Claude's discretion per CONTEXT.md, but the planner should not assume `getExtension()`/`LANGUAGE_EXTENSIONS` already produces the right string — it produces a related-but-different value.

```typescript
// Source: src/api/types.ts:201-229 (in-repo, verified) — shows what EXISTS,
// which is NOT the same as the row-format target string:
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python3: "py", // -> "py", not "py3"
  javascript: "js",
  csharp: "cs",
  // ...
};
```

### Percentile rounding (D-03)
`runtimePercentile`/`memoryPercentile` are `real` (float) columns, e.g. `82.53`. Round for display (`Math.round(p)`); decide once whether the phrasing is "top X%" (beats X% of others, i.e. display `p` directly) or "bottom (100-X)%" — CONTEXT.md's target `45ms (top 82%)` implies displaying the raw percentile value directly as "top N%", which matches LeetCode's own "beats N%" semantics without needing a `100 - p` inversion.

## State of the Art

Not applicable in the traditional sense (no external ecosystem to be behind on) — this is 100% internal-pattern extension. The one relevant "current approach" note: Drizzle ORM 0.44.4 (pinned per `src/db/CLAUDE.md` — do not bump without also bumping `drizzle-kit`) fully supports `.groupBy()` + `count()` the same way `getStatusCounts()` already uses raw `sql` templates for non-grouped aggregates [CITED: orm.drizzle.team/docs/guides/count-rows].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `statusDisplay` strings are consistent enough between the live-submit path and the backfill path to color/group by simple substring match (not guaranteed byte-identical across both unofficial API surfaces) | Common Pitfalls #2 | A verdict from one source renders with the "unmapped" fallback color while the same verdict from the other source renders correctly — cosmetic only, not a crash, since the recommended mitigation (substring match + safe fallback) already absorbs this risk |
| A2 | LeetCode runtime strings are always `"<number> ms"` with no cases of `"<number> s"` or other units for problems this tool targets | Code Examples (Pattern 4, `parseRuntimeMs`) | An edge-case runtime string fails to parse and is excluded from the best/latest comparison (degrades gracefully to "not shown" rather than crashing, given the `null`-safe design) |

## Open Questions

1. **Exact `RIGHT_COLUMN_CHROME_PER_PANEL` constant for the 4-panel viewport split (Pattern 2)**
   - What we know: The existing 3-panel formula bakes in a `8` constant empirically tuned for 3 panels; D-09 requires equal shrinkage across 4.
   - What's unclear: The precise per-panel chrome cost (border rows, title row) wasn't derived from first principles in the original code — it was tuned by eyeballing a terminal.
   - Recommendation: Planner/implementer should treat the exact constant as a small tunable, verify visually against a real terminal at a few heights (mirroring how the original `8` was presumably chosen), and keep the "divide remaining rows across N panels" *shape* fixed regardless of the exact number.

2. **Should `attemptCounts` recompute on every submit (live, while still in ProblemView), or only on `exitProblemView`?**
   - What we know: `handleProblemSubmit` already triggers `markAccepted`/`markAttempted` and updates `question.status`/`last_runtime` synchronously, but the browse question list isn't visible while inside ProblemView, so there's no *visible* staleness if the badge map only refreshes on `handleExitProblemView` (which already calls `refreshQuestions()`).
   - What's unclear: Whether a future feature (e.g. a status bar counter) might read `attemptCounts` while still inside ProblemView.
   - Recommendation: Refresh only on `handleExitProblemView` + `init()` + backfill-completion (Pitfall 4) for this phase — matches `solutionFileIds`' existing lifecycle exactly, avoids an unnecessary per-submit DB query, and nothing in this phase's scope needs mid-ProblemView-session badge freshness.

## Security Domain

`security_enforcement` is enabled (ASVS level 1) per `.planning/config.json`, but this phase introduces no new external attack surface: no new network calls, no new auth, no new user-supplied input paths. The one relevant category:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V5 Input Validation | yes (narrow) | New parsing of `runtime`/`memory`/`statusDisplay` strings — all ultimately sourced from an unofficial, reverse-engineered LeetCode API (already true of Phase 1's ingestion). New code (`parseRuntimeMs`, `verdictColor`) must follow the codebase's established never-throws-on-malformed-external-data convention (return `null`/fallback, never throw) — consistent with `mapSubmission()`'s existing guards in `core/backfill.ts` (`Number.isNaN` checks before use) |

No other ASVS categories apply — no auth, session, or access-control surface is touched by this phase.

## Project Constraints (from CLAUDE.md)

- `bun run check` (Biome lint + `tsc --noEmit` + `bun test`) is the zero-tolerance gate — any new helper (`verdictColor`, `parseRuntimeMs`, `getSubmissionCountsByQuestion`) needs a co-located `*.test.ts` per the established convention (`src/db/CLAUDE.md`, `.planning/codebase/TESTING.md`) to keep the gate meaningful, and must pass Biome with zero warnings.
- New DB reads must go through `src/db/*.ts` following the existing `Db`-singleton/query-builder style (no ad-hoc `bun:sqlite` calls in UI code).
- UI-vs-domain slice split is enforced by convention (`// type: ui` / `// type: domain` header) — the new `submissionsSlice` must be domain-only (no cursor/focus state), while `problemSlice`'s new `focusedHistoryIndex` stays UI-only, per the split Pitfall 5 resolves.
- OpenTUI intrinsics use `backgroundColor` on `<box>`, `fg`/`bg` on `<text>` (not `bg`/`color`) — `HistoryPanel.tsx` must follow `RelatedPanel.tsx`'s exact prop conventions.

## Sources

### Primary (HIGH confidence)
- In-repo source (read directly during this research pass, all line numbers current): `src/db/schema.ts`, `src/db/submissions.ts`, `src/db/questions.ts`, `src/ui/components/RelatedPanel.tsx`, `src/ui/components/QuestionList.tsx`, `src/ui/components/RecentPopup.tsx`, `src/views/problem/ProblemView.tsx`, `src/views/problem/handlers.ts`, `src/views/browse/handlers/backfill.ts`, `src/ui/store/slices/problemSlice.ts`, `src/ui/store/slices/questionsSlice.ts`, `src/ui/theme.ts`, `src/ui/themes/index.ts`, `src/ui/themes/tokyo-night.ts`, `src/ui/relativeTime.ts`, `src/ui/keymap/bindings.ts`, `src/ui/keymap/format.ts`, `src/core/submission.ts`, `src/core/backfill.ts`, `src/api/types.ts`, `src/views/browse/resultView/*.ts`
- Phase 1 artifacts: `.planning/phases/01-submission-store-backfill/01-RESEARCH.md` (live-spike-verified `runtime`/`memory` string format), `.planning/STATE.md` (spike confirmation record)
- `.planning/codebase/TESTING.md`, `src/ui/CLAUDE.md`, `src/db/CLAUDE.md`, `src/core/CLAUDE.md` (project conventions)

### Secondary (MEDIUM confidence)
- [Drizzle ORM — Count rows guide](https://orm.drizzle.team/docs/guides/count-rows) — confirms `count()`/`groupBy()` idiom matches the in-repo `getStatusCounts()` pattern

### Tertiary (LOW confidence)
- None — every claim in this document is grounded in in-repo source or the cited official Drizzle doc; the two items in the Assumptions Log are flagged, not treated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all reused patterns verified against live source
- Architecture: HIGH — every pattern has a working in-repo analog; the one genuinely new query (GROUP BY count) is confirmed against official Drizzle docs
- Pitfalls: HIGH — all six pitfalls were found by tracing actual current code paths (backfill handler, statusColor/ResultKind scope, LANGUAGE_EXTENSIONS content), not speculation

**Research date:** 2026-07-01
**Valid until:** Stable — no expiry pressure (internal codebase patterns, pinned dependency versions). Re-verify only if `drizzle-orm`/`@opentui/*` are bumped before this phase is planned.
