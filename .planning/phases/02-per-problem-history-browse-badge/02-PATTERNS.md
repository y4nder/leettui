# Phase 2: Per-Problem History & Browse Badge - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/db/submissions.ts` (add `getSubmissionCountsByQuestion`) | model | CRUD (aggregate read) | `src/db/questions.ts:149-163` (`getStatusCounts`) | exact |
| `src/ui/components/HistoryPanel.tsx` (new) | component | request-response (windowed render) | `src/ui/components/RelatedPanel.tsx` | exact |
| `src/ui/store/slices/submissionsSlice.ts` (new, domain) | store slice | CRUD (read + derive) | `src/ui/store/slices/questionsSlice.ts` (shape) + `problemSlice.ts`'s `related` population (lifecycle) | role-match |
| `src/ui/store/slices/questionsSlice.ts` (extend: `attemptCounts` Map) | store slice | CRUD | itself — extend `solutionFileIds` pattern in same file | exact |
| `src/ui/store/slices/problemSlice.ts` (extend: `ProblemPanel`, `PROBLEM_PANEL_ORDER`, `PROBLEM_PANEL_NEIGHBORS`, `focusedHistoryIndex`) | store slice | event-driven (focus state) | itself — extend `related`/`focusedRelatedIndex` pattern in same file | exact |
| `src/ui/verdict.ts` or `src/core/submission.ts` (new: `verdictColor`, `parseRuntimeMs`) | utility | transform | `src/ui/theme.ts`'s `statusColor()`/`difficultyColor()` (shape), but genuinely new logic | role-match (no direct data analog) |
| `src/ui/keymap/bindings.ts` (extend: `historyPanelBindings`) | config/route (keymap) | event-driven | `relatedPanelBindings` (lines 187-189) | exact |
| `src/ui/keymap/commands/problem.ts` (extend: `problem.focusHistory`, `problem.historyNext`, `problem.historyPrev`) | route | event-driven | `problem.focusRelated`/`problem.relatedNext`/`problem.relatedPrev` (lines 155, 199-203, 283-294) | exact |
| `src/ui/keymap/format.ts` (extend `problemPanelBindings(panel)` switch) | route | event-driven | existing `case "related": return relatedPanelBindings;` arm | exact |
| `src/views/problem/handlers.ts` (extend `handleEnterProblemView`, new `refreshProblemSubmissions`) | service | request-response | `handleEnterProblemView`'s `Promise.all` + `related` population (lines 95-121); `refreshProblemSolutions`-style refresh helper | exact |
| `src/views/browse/handlers/backfill.ts` (extend `finally` block) | service | event-driven | itself — add store refresh call, mirrors `clearSyncProgress()`'s always-run `finally` semantics | exact |
| `src/ui/components/QuestionList.tsx` (extend row render — badge slot) | component | request-response (row render) | itself — the `◆` marker line (85) is the exact slot to modify | exact |

## Pattern Assignments

### `src/db/submissions.ts` (model, CRUD aggregate)

**Analog:** `src/db/questions.ts:149-163` (`getStatusCounts`)

**Core aggregate pattern** (lines 149-163):
```typescript
export function getStatusCounts(): StatusCounts {
  const row = getDb()
    .select({
      solved: sql<number>`SUM(CASE WHEN ${questions.status} = 'ac' THEN 1 ELSE 0 END)`,
      attempted: sql<number>`SUM(CASE WHEN ${questions.status} = 'notac' THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(questions)
    .get();
  return {
    solved: row?.solved ?? 0,
    attempted: row?.attempted ?? 0,
    total: row?.total ?? 0,
  };
}
```

**Adaptation for the new grouped-count query** (per RESEARCH.md Pattern 3 — use `count()` + `.groupBy()`, not a manual `SUM(CASE...)`, since this is a per-key count not a fixed set of buckets):
```typescript
import { count } from "drizzle-orm";

export function getSubmissionCountsByQuestion(): Map<number, number> {
  const rows = getDb()
    .select({ questionId: submissions.questionId, n: count() })
    .from(submissions)
    .groupBy(submissions.questionId)
    .all();
  return new Map(rows.map((r) => [r.questionId, r.n]));
}
```
Hits `idx_sub_question_time` (leading column `questionId`) — no migration needed.

**Existing per-question row reader** (already sufficient for the History panel, no new query needed — `src/db/submissions.ts:50-57`):
```typescript
export function getSubmissionsForQuestion(questionId: number): DbSubmission[] {
  return getDb()
    .select()
    .from(submissions)
    .where(eq(submissions.questionId, questionId))
    .orderBy(desc(submissions.submittedAt))
    .all();
}
```

**Testing pattern:** co-located `*.test.ts` per `src/db/CLAUDE.md` convention — no existing `submissions.test.ts` was located in this scan; mirror `questions.test.ts`'s throwaway-DB-per-case setup (`openDatabase`/`closeDatabase`) if adding one.

---

### `src/ui/components/HistoryPanel.tsx` (component, windowed render)

**Analog:** `src/ui/components/RelatedPanel.tsx` (full file, 82 lines — copy verbatim then adapt row content)

**Imports pattern** (lines 1-3):
```typescript
import { useTerminalDimensions } from "@opentui/react";
import type { RelatedQuestion } from "../store";
import { colors } from "../theme";
```
(Swap `RelatedQuestion` for a new `DbSubmission`-derived row type; History likely doesn't need `useTerminalDimensions`/title-truncation since rows are fixed-width fields, not a free-text title — but keep the import if D-01's compact row still needs width-aware truncation for edge cases.)

**Windowed scroll pattern** (lines 32-37 — copy verbatim, this is the exact mechanism D-04/D-09 need):
```typescript
const visibleCount = Math.max(1, Math.min(maxRows, related.length));
let scrollOffset = 0;
if (focusedIndex >= scrollOffset + visibleCount) scrollOffset = focusedIndex - visibleCount + 1;
if (focusedIndex < scrollOffset) scrollOffset = focusedIndex;
const visible = related.slice(scrollOffset, scrollOffset + visibleCount);
```

**Box/border/title chrome pattern** (lines 39-52, adapt title text + tag to "History"):
```typescript
<box
  flexDirection="column"
  borderStyle="rounded"
  borderColor={focused ? colors.accent : colors.border}
  width="100%"
  flexShrink={0}
>
  <box flexDirection="row">
    <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
    <text fg={colors.fgAccent}> Related ({related.length}) </text>
  </box>
```

**Empty-state pattern** (line 53-54 — D-04's "No attempts yet" is the same mechanism, new copy only):
```typescript
{related.length === 0 ? (
  <text fg={colors.fgDim}> No related questions </text>
) : ( /* ... */ )}
```

**Row-focus-highlight pattern** (lines 27-30, 62, 67 — reuse for the selected History row):
```typescript
const selectedBg = focused ? colors.bgHighlight : colors.surface;
const selectedFg = focused ? colors.fgAccent : colors.mutedAccent;
// ...
const rowFg = isSelected ? selectedFg : navigable ? colors.fg : colors.fgDim;
```

**Row-timestamp analog** (relative time formatting) — `src/ui/relativeTime.ts` (full file, 21 lines), reuse verbatim:
```typescript
export function formatRelative(ms: number, now: number = Date.now()): string {
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
```

**No existing analog for:**
- Best/latest summary line (D-05/D-06/D-07) — genuinely new render logic, pure JS over `getSubmissionsForQuestion` rows filtered to `statusDisplay === "Accepted"`.
- Verdict color-coding per row (D-02) — see `verdict.ts` section below.

---

### `src/ui/verdict.ts` (or added to `src/core/submission.ts`) — new utility, transform

**No direct analog exists** (RESEARCH.md Pitfall 1/2/3 — confirmed by this scan). The two nearest-shaped helpers are in `src/ui/theme.ts` (do NOT reuse directly — different input domain):

```typescript
// src/ui/theme.ts:73-84 — shape to MIRROR (switch → ThemeColor), not data to reuse
export function difficultyColor(difficulty: string): ThemeColor {
  switch (difficulty) {
    case "Easy": return _currentTheme.easy;
    case "Medium": return _currentTheme.medium;
    case "Hard": return _currentTheme.hard;
    default: return _currentTheme.fg;
  }
}

// src/ui/theme.ts:97-106 — statusColor operates on question.status ("ac"/"notac"/null),
// NOT submissions.statusDisplay free text — do not extend this function for verdicts.
export function statusColor(status: string | null): ThemeColor {
  switch (status) {
    case "ac": return _currentTheme.accepted;
    case "notac": return _currentTheme.attempted;
    default: return _currentTheme.fgDim;
  }
}
```

**Build new (per RESEARCH.md Pattern/Pitfall guidance — substring match, never exact enum, always a safe fallback):**
```typescript
export function verdictColor(statusDisplay: string): ThemeColor {
  if (statusDisplay.includes("Accepted")) return colors.success;
  if (statusDisplay.includes("Wrong Answer")) return colors.error;
  if (statusDisplay.includes("Time Limit")) return colors.warn;
  if (statusDisplay.includes("Memory Limit")) return colors.error;
  if (statusDisplay.includes("Runtime")) return colors.error;
  if (statusDisplay.includes("Compile")) return colors.subtle;
  return colors.fgDim; // unmapped fallback — never throws
}

export function parseRuntimeMs(runtime: string | null): number | null {
  if (!runtime) return null;
  const m = /^([\d.]+)\s*ms$/.exec(runtime.trim());
  return m ? Number(m[1]) : null;
}
```
Never-throws convention source: `src/core/backfill.ts`'s `mapSubmission()` guards (`Number.isNaN` checks before use) — same defensive posture required here.

**Testing pattern:** co-located `verdict.test.ts` (or `submission.test.ts` extension) — Biome/`bun test` gate is zero-tolerance per `CLAUDE.md`.

---

### `src/ui/store/slices/submissionsSlice.ts` (new, domain slice)

**Analog (structure/header convention):** `src/ui/store/slices/questionsSlice.ts` header + `StateCreator` shape

**Domain-slice header + type convention** (lines 1-15):
```typescript
// type: domain
// Owns problem data sourced from the DB: ...

import type { StateCreator } from "zustand";
import type { DbQuestion, StatusCounts } from "../../../db/questions";
import { getQuestionsByTopic, getStatusCounts } from "../../../db/questions";
// ...
import type { AppStore } from "../index";

export interface QuestionsSlice {
  allQuestions: DbQuestion[];
  // ...
  init: () => void;
  refreshQuestions: (questions: DbQuestion[]) => void;
}
```

**Population lifecycle analog** — `related`/`RelatedQuestion[]` population inside `problemSlice`'s `enterProblemView` (see `problemSlice.ts:142-160`) is the closer lifecycle match than `questionsSlice.init()`, since submission rows are per-currently-open-problem, populated on `handleEnterProblemView`, not app-boot:
```typescript
// src/ui/store/slices/problemSlice.ts:142-160 — lifecycle shape to mirror
enterProblemView: ({ question, description, solutions, topicTags, related }) =>
  set({
    mode: "problem",
    problem: {
      question, description, topicTags, solutions,
      focusedSolutionIndex: 0,
      related,
      focusedRelatedIndex: 0,
      // ...
    },
  }),
```
**Resolution (Pitfall 5):** `submissionsSlice` owns only per-problem rows + derived best/latest for the *currently open* problem (feeds `HistoryPanel`); it does NOT own the browse badge's `attemptCounts` map (that stays on `questionsSlice`, see below).

---

### `src/ui/store/slices/questionsSlice.ts` (extend — `attemptCounts` Map)

**Analog:** itself — `solutionFileIds: Set<number>` is the structurally-identical sibling to extend (same file, same slice, same refresh call sites)

**Field + init + refresh pattern** (lines 24, 50, 61-62, 70-71, 74-76):
```typescript
export interface QuestionsSlice {
  // ...
  solutionFileIds: Set<number>;
  init: () => void;
  refreshQuestions: (questions: DbQuestion[]) => void;
  refreshSolutionFiles: () => void;
}

// in createQuestionsSlice:
solutionFileIds: new Set(),

init: () => {
  // ...
  set({
    // ...
    solutionFileIds: listSolutionQuestionIds(),
  });
},

refreshQuestions: (questions) => {
  set({
    // ...
    solutionFileIds: listSolutionQuestionIds(),
  });
},

refreshSolutionFiles: () => {
  set({ solutionFileIds: listSolutionQuestionIds() });
},
```
**Adaptation:** add `attemptCounts: Map<number, number>` alongside `solutionFileIds`, populated via the new `getSubmissionCountsByQuestion()` at the exact same three call sites (`init`, `refreshQuestions`, `refreshSolutionFiles`-equivalent — or a new sibling `refreshAttemptCounts()` if the trigger sites diverge from solution-file refreshes), **plus** a new call from `handleStartBackfill`'s `finally` block (see below — this is the gap RESEARCH.md Pitfall 4 flags; no existing call site covers it).

---

### `src/ui/store/slices/problemSlice.ts` (extend — 4th panel)

**Analog:** itself — the existing `related`/`focusedRelatedIndex`/`PROBLEM_PANEL_ORDER`/`PROBLEM_PANEL_NEIGHBORS` machinery is the exact pattern to replicate one more time

**Panel type + order + neighbors** (lines 16-43 — current state, to extend):
```typescript
export type ProblemPanel = "description" | "solutions" | "result" | "related";

export const PROBLEM_PANEL_ORDER: ProblemPanel[] = [
  "description",
  "solutions",
  "result",
  "related",
];

const PROBLEM_PANEL_NEIGHBORS: Record<
  ProblemPanel,
  Partial<Record<FocusDirection, ProblemPanel>>
> = {
  description: { right: "solutions" },
  solutions: { left: "description", down: "result" },
  result: { left: "description", up: "solutions", down: "related" },
  related: { left: "description", up: "result" },
};
```
**Required edits:** add `"history"` to the `ProblemPanel` union and to the end of `PROBLEM_PANEL_ORDER`; add `down: "history"` to `related`'s neighbor entry; add a new `history: { left: "description", up: "related" }` entry.

**Cursor-move action pattern** (lines 187-194, `moveFocusedRelated` — copy verbatim as `moveFocusedHistory`):
```typescript
moveFocusedRelated: (delta) =>
  set((state) => {
    if (!state.problem) return {};
    const n = state.problem.related.length;
    if (n === 0) return {};
    const next = Math.max(0, Math.min(n - 1, state.problem.focusedRelatedIndex + delta));
    return { problem: { ...state.problem, focusedRelatedIndex: next } };
  }),
```
`cycleProblemFocusedPanel`/`moveProblemFocus` (lines 208-223) are generic over `PROBLEM_PANEL_ORDER`/`PROBLEM_PANEL_NEIGHBORS` and need **no changes** — extending the two maps above is sufficient.

---

### Keymap extension (4-file checklist per RESEARCH.md Pitfall 6)

**1. `src/ui/keymap/bindings.ts`** — analog `relatedPanelBindings` (lines 187-189):
```typescript
export const relatedPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.relatedNext": ["j", "down"],
  "problem.relatedPrev": ["k", "up"],
});
```
New `historyPanelBindings` mirrors this **without** an Enter/return binding (D-10 reserves Enter — do not add a `problem.historyEnter` binding here, unlike Related which has one).

**2. `src/ui/keymap/commands/problem.ts`** — analogs at lines 155 (`"problem.focusRelated": "4"`), 199-203, 283-294:
```typescript
{
  name: "problem.focusRelated",
  title: "Focus related questions panel",
  // ...
  run: () => useAppStore.getState().setProblemFocusedPanel("related"),
},
{
  name: "problem.relatedNext",
  title: "Next related question",
  // ...
  run: () => useAppStore.getState().moveFocusedRelated(1),
},
{
  name: "problem.relatedPrev",
  title: "Previous related question",
  // ...
  run: () => useAppStore.getState().moveFocusedRelated(-1),
},
```
New: `problem.focusHistory` (key `"5"`), `problem.historyNext` (→ `moveFocusedHistory(1)`), `problem.historyPrev` (→ `moveFocusedHistory(-1)`). **Do not** add a `problem.historyEnter` command (D-10).

**3. `src/ui/keymap/format.ts`** — extend `problemPanelBindings(panel)` switch with `case "history": return historyPanelBindings;` (existing arms cover `"related"` the same way — find via grep, not read in full, since this is a small pure-lookup file).

**4. `src/views/problem/ProblemView.tsx`** — add a `HistoryPanelBindings` mount component mirroring `RelatedPanelBindings` (lines 55-58):
```typescript
function RelatedPanelBindings() {
  useBindings(() => ({ bindings: relatedPanelBindings }), []);
  return null;
}
```
and gate it the same way (`!help && !deleteConfirm && focusedPanel === "related" && <RelatedPanelBindings />`, line 171).

---

### `src/views/problem/handlers.ts` (extend)

**Analog:** `handleEnterProblemView`'s `Promise.all` fetch pattern (lines 95-121) — but History's data source is a **synchronous local DB read** (`getSubmissionsForQuestion`), not a fetch, so it does NOT belong inside the `Promise.all` (no async needed):
```typescript
export async function handleEnterProblemView(question: DbQuestion, triggerKey = "enter") {
  try {
    const [contentData, similarData] = await Promise.all([
      fetchQuestionContent(question.title_slug),
      fetchSimilarQuestions(question.title_slug).catch(() => null),
    ]);
    // ... existing description/solutions/topicTags/related derivation ...
    recordRecent(question.id);
    useAppStore
      .getState()
      .enterProblemView({ question, description, solutions, topicTags, related });
  } catch (e) { /* ... */ }
}
```
**Adaptation:** call `getSubmissionsForQuestion(question.id)` synchronously alongside the other synchronous reads (`findExistingSolutions`, `getTopicsForQuestion`) — before or after the `Promise.all`, not inside it — and pass the rows into `enterProblemView`'s init object (extend `submissionsSlice`'s populate action or extend `enterProblemView`'s signature, per the Pitfall 5 resolution above).

---

### `src/views/browse/handlers/backfill.ts` (extend — the refresh gap)

**Analog:** itself — the `finally` block's existing always-run cleanup (lines 79-85) is exactly where the new refresh call belongs:
```typescript
} finally {
  // Clears the progress bar on EVERY exit path — success, error, AND cancel
  // (Pitfall 6) — so it can never freeze/stick regardless of how the run ends.
  clearSyncProgress();
  cancelRef = null;
  releaseSync();
}
```
**Adaptation:** add a call to the new attempt-counts refresh (e.g. `useAppStore.getState().refreshAttemptCounts()` or whatever `questionsSlice` names it) inside this `finally` block, alongside `clearSyncProgress()` — fires on every exit path (`ok`, every error branch, and `cancelled`), per RESEARCH.md Pitfall 4.

---

### `src/ui/components/QuestionList.tsx` (extend — badge slot)

**Analog:** itself — line 85 is the exact slot D-13/D-14 target:
```typescript
// CURRENT (line 73, 85):
const hasSolution = solutionFileIds.has(q.id);
// ...
<text fg={colors.accent}>{hasSolution ? "◆" : " "}</text>
```
**Adaptation (D-14 precedence — attempt count wins, `◆` is the fallback):**
```typescript
const attemptCount = attemptCounts.get(q.id) ?? 0;
const hasSolution = solutionFileIds.has(q.id);
// ...
<text fg={colors.accent}>
  {attemptCount > 0 ? `×${attemptCount}` : hasSolution ? "◆" : " "}
</text>
```
Requires threading a new `attemptCounts: Map<number, number>` prop into `QuestionListProps` (mirrors the existing `solutionFileIds: Set<number>` prop, line 11) and passing `questionsSlice`'s new field from `BrowseView` the same way `solutionFileIds` is already passed today.

## Shared Patterns

### Never-throws parsing of external/API-sourced strings
**Source:** `src/core/backfill.ts`'s `mapSubmission()` (`Number.isNaN` guards before use)
**Apply to:** `verdictColor()`, `parseRuntimeMs()` — both must return a safe fallback (`colors.fgDim` / `null`) on any unrecognized input, never throw. This is the single most load-bearing convention for the two genuinely-new utilities in this phase.

### UI-vs-domain slice split
**Source:** `src/ui/CLAUDE.md` "store/" section; enforced via `// type: ui` / `// type: domain` file headers (see `questionsSlice.ts:1-4`, `problemSlice.ts:1-6`)
**Apply to:** `submissionsSlice.ts` must be domain-only (row data + pure derivations, no cursor state); `focusedHistoryIndex` and the 4th-panel focus wiring stay in `problemSlice.ts` (ui).

### Windowed scroll-follows-cursor list
**Source:** `src/ui/components/RelatedPanel.tsx:32-37` (inline) — also available as `useScrollOffset` hook (used by `QuestionList`/`RecentPopup`)
**Apply to:** `HistoryPanel.tsx`. RESEARCH.md's "Don't Hand-Roll" table suggests the hook-based form is the more-reused convention if a fresh choice is being made; either is an established pattern, but do not write a third bespoke implementation.

### Panel chrome/title/tag convention
**Source:** `src/views/problem/ProblemView.tsx`'s `PanelTitle` component (lines 89-99) and `RelatedPanel`'s inline title row (lines 49-52)
**Apply to:** `HistoryPanel.tsx`'s title row — `[5] History (N)` following the `[tag] Label (count)` shape.

### OpenTUI prop conventions
**Source:** `src/ui/CLAUDE.md` "OpenTUI prop notes" — `<box>` uses `backgroundColor` (not `bg`); `<text>` uses `fg`/`bg`.
**Apply to:** every new/edited JSX in `HistoryPanel.tsx` and `QuestionList.tsx`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Best/latest AC runtime comparison logic (wherever it lands — likely `submissionsSlice.ts` or a selector in `HistoryPanel.tsx`) | utility/derivation | transform | Genuinely new pure-JS computation over already-fetched rows; no existing runtime-comparison logic anywhere in the codebase (RESEARCH.md Pitfall 3). Use `parseRuntimeMs` + `Math.min` over AC rows, guarding nulls. |
| `verdictColor()` 6-way mapping | utility | transform | Existing `statusColor()`/`ResultKind` both operate on different, narrower data (question status / run-result kind) — see Pitfall 1/2. Build fresh per the pattern shown above. |

## Metadata

**Analog search scope:** `src/db/`, `src/ui/components/`, `src/ui/store/slices/`, `src/ui/keymap/`, `src/ui/theme.ts`, `src/views/problem/`, `src/views/browse/handlers/`
**Files scanned:** `RelatedPanel.tsx`, `QuestionList.tsx`, `questionsSlice.ts`, `problemSlice.ts`, `theme.ts`, `relativeTime.ts`, `ProblemView.tsx`, `handlers.ts` (problem), `backfill.ts`, `submissions.ts`, `questions.ts` (partial — `getStatusCounts`), keymap `bindings.ts`/`commands/problem.ts` (grep + targeted read)
**Pattern extraction date:** 2026-07-01
