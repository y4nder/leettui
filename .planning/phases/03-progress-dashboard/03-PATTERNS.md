# Phase 3: Progress Dashboard — Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ui/analytics.ts` | utility (pure) | transform | `src/ui/progress.ts` | exact |
| `src/ui/analytics.test.ts` | test | — | `src/ui/store/slices/problemSlice.test.ts` | role-match |
| `src/db/submissions.ts` (add `getFirstAcSummary`) | service | CRUD (read) | same file — `getSubmissionCountsByQuestion` lines 76-83 | exact |
| `src/ui/store/slices/dashboardSlice.ts` | store (domain) | request-response | `src/ui/store/slices/submissionsSlice.ts` | exact |
| `src/ui/store/slices/uiSlice.ts` (modify) | store (ui) | — | same file lines 21-39, 146-216 | exact |
| `src/app.tsx` (modify) | router | — | same file lines 20-24 | exact |
| `src/ui/components/DashboardView.tsx` | component | request-response | `src/ui/components/ResultFullscreen.tsx` + `ChangelogPopup.tsx` | exact |
| `src/ui/keymap/commands/` (add commands) | config | — | `src/ui/keymap/commands/modal.ts` + `system.ts` | exact |
| `src/ui/keymap/bindings.ts` (modify) | config | — | `changelogBindings` lines 108-115; `browseGlobalBindings` line 55-56 | exact |

---

## Pattern Assignments

### `src/ui/analytics.ts` (utility, transform)

**Analog:** `src/ui/progress.ts`

**Module header pattern** (`progress.ts` lines 1-4):
```typescript
// Pure progress-bar geometry shared by the sync UIs (the full-screen `SyncStep`
// and the in-app re-sync `ProgressBar`). Framework-free so it's unit-testable;
// the components color the returned runs with theme tokens.
```
Mirror this comment explaining the pure/framework-free contract. No React, Zustand, or DB imports — plain TS functions only.

**Pure export pattern** (`progress.ts` lines 12-24):
```typescript
export function smoothBar(ratio: number, width: number): { filled: string; empty: string } {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  // ... pure computation, returns plain value
}
```
Every export in `analytics.ts` follows this shape: typed input parameters, typed return value, no side effects, no async.

**Unicode block set pattern** (`progress.ts` lines 6):
```typescript
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
```
Mirror for sparkline: `const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;`

**Specific pattern to replicate:**
- Module-level `// Pure ...` comment
- All functions exported named (no default export)
- Module has zero imports from `../store`, `../theme`, `react`, `@opentui/*`, `../db/*`
- Internal helper functions (`toLocalDayKey`, `buildSolveDays`) are NOT exported — only the public surface (`computeDashboardStats`, `buildSparkline`, `buildHeatmapGrid`, etc.)

---

### `src/ui/analytics.test.ts` (test, co-located)

**Analog:** `src/ui/store/slices/problemSlice.test.ts`

**Test file header pattern** (`problemSlice.test.ts` lines 1-6):
```typescript
import { describe, expect, test } from "bun:test";
// ... local imports only, no DB open, no network
```

**Fixture pattern** (`problemSlice.test.ts` lines 15-46):
```typescript
const QUESTION = { id: 1, ... } as DbQuestion;

function problemState(overrides: Partial<ProblemViewState> = {}): ProblemViewState {
  return { ...defaults, ...overrides };
}
```
Mirror for analytics tests: define a `makeFirstAcRows(overrides?)` factory that returns `FirstAcSummaryRow[]` with sensible defaults, so each test case only specifies the interesting fields.

**Test structure pattern:**
```typescript
describe("computeStreaks", () => {
  test("empty → {0, 0}", () => { ... });
  test("one solve today → {1, 1}", () => { ... });
  test("gap of 2 days breaks streak", () => { ... });
});
```
One `describe` block per exported function; edge-case tests named descriptively.

**Specific tests to include** (from RESEARCH.md Focus Area 2):
- Empty solve set → streak `{0, 0}`
- One solve today → `{1, 1}`
- One solve yesterday, nothing today → still `{1, 1}` (today-grace)
- Gap of 2 days → current streak = 0
- All consecutive N days → current = longest = N
- E/M/H difficulty counts from `FirstAcSummaryRow[]`
- `buildSparkline([])` → empty string; `buildSparkline([3, 0, 5])` → correct block chars
- `buildHeatmapGrid` indexing: a solve at a known timestamp lands in the correct `[weekIndex][dow]` cell

---

### `src/db/submissions.ts` — add `getFirstAcSummary()` (service, CRUD read)

**Analog:** same file, `getSubmissionCountsByQuestion` lines 76-83

**Existing grouped-aggregate pattern** (lines 76-83):
```typescript
export function getSubmissionCountsByQuestion(): Map<number, number> {
  const rows = getDb()
    .select({ questionId: submissions.questionId, n: count() })
    .from(submissions)
    .groupBy(submissions.questionId)
    .all();
  return new Map(rows.map((r) => [r.questionId, r.n]));
}
```

**Import pattern** (line 1):
```typescript
import { count, desc, eq } from "drizzle-orm";
```
Add `min, and, like` to the same import. Add `questions` to the schema import on line 2 (it is already imported: `import { questions, submissions } from "./schema";`).

**Specific pattern to replicate:**

```typescript
// Add above the function, near other interface declarations:
export interface FirstAcSummaryRow {
  questionId: number;
  difficulty: string;
  firstAcMs: number; // MIN(submittedAt) for this questionId, AC rows only (milliseconds)
}

// Add after getSubmissionCountsByQuestion:
export function getFirstAcSummary(): FirstAcSummaryRow[] {
  return getDb()
    .select({
      questionId: submissions.questionId,
      difficulty: questions.difficulty,
      firstAcMs: min(submissions.submittedAt),
    })
    .from(submissions)
    .innerJoin(questions, eq(submissions.questionId, questions.id))
    .where(like(submissions.statusDisplay, "%Accepted%"))
    .groupBy(submissions.questionId)
    .all() as FirstAcSummaryRow[];
}
```

**Critical details:**
- Use `like(submissions.statusDisplay, "%Accepted%")` not `eq(...)` — mirrors `verdict.ts:16`'s substring check
- Cast `.all() as FirstAcSummaryRow[]` — Drizzle's inference for `min()` returns `number | null`; the WHERE filter guarantees non-null
- No schema change, no migration — read-only join over existing indexed tables

---

### `src/ui/store/slices/dashboardSlice.ts` (store, domain)

**Analog:** `src/ui/store/slices/submissionsSlice.ts` (entire file, 34 lines)

**Slice header pattern** (lines 1-6):
```typescript
// type: domain
// Owns the currently-open problem's submission-history rows + derived best/latest AC
// summary (feeds HistoryPanel). Populated synchronously on handleEnterProblemView (a
// local DB read, not a fetch) and cleared on exit. Domain-pure: no cursor/focus state —
// that lives in problemSlice's focusedHistoryIndex (UI/domain split).
```
Mirror: `// type: domain` header mandatory (enforced by CLAUDE.md UI/domain rule).

**StateCreator pattern** (lines 22-34):
```typescript
export const createSubmissionsSlice: StateCreator<AppStore, [], [], SubmissionsSlice> = (set) => ({
  problemSubmissions: [],
  submissionSummary: null,

  loadProblemSubmissions: (questionId) => {
    const rows = getSubmissionsForQuestion(questionId);
    set({ problemSubmissions: rows, submissionSummary: summarizeAcRuntime(rows) });
  },

  clearProblemSubmissions: () => {
    set({ problemSubmissions: [], submissionSummary: null });
  },
});
```

**Specific pattern to replicate:**
```typescript
// type: domain
import type { StateCreator } from "zustand";
import type { AppStore } from "../index";
import { getFirstAcSummary } from "../../../db/submissions";
import { computeDashboardStats, type DashboardStats } from "../../analytics";

export interface DashboardSlice {
  dashboardStats: DashboardStats | null;
  loadDashboardStats: () => void;
  clearDashboardStats: () => void;
}

export const createDashboardSlice: StateCreator<AppStore, [], [], DashboardSlice> = (set) => ({
  dashboardStats: null,

  loadDashboardStats: () => {
    const rows = getFirstAcSummary();
    set({ dashboardStats: computeDashboardStats(rows) });
  },

  clearDashboardStats: () => {
    set({ dashboardStats: null });
  },
});
```

**After writing the slice, add it to `src/ui/store/index.ts`** — mirror the `submissionsSlice` registration pattern (lines 8, 17, 24, 26, 33, 36-37, 43).

---

### `src/ui/store/slices/uiSlice.ts` — add `"dashboard"` + return-mode fields (modify)

**Analog:** same file, existing `AppMode` union (lines 21-39) and `showChangelog`/`hideChangelog` pattern (lines 146-148).

**AppMode union** (lines 21-39) — add `"dashboard"` as the last member:
```typescript
export type AppMode =
  | "browse" | "search" | "popup" | "select" | "result" | "help" | "debug"
  | "palette" | "problem" | "relocate" | "changelog" | "recent" | "gitInit"
  | "gitRemote" | "gitSync" | "config" | "backfillNudge" | "easterEgg"
  | "dashboard"; // Phase 3
```

**Return-mode show/hide pattern** — closest analog is `showChangelog`/`hideChangelog` (lines 146-148), but the dashboard's hide action must restore a dynamic return mode, not a fixed `"browse"`:
```typescript
// Closest analog (changelog — hardcodes return to browse):
showChangelog: (payload) => set({ mode: "changelog", changelog: payload }),
hideChangelog: () => set({ mode: "browse", changelog: null }),
```

**New fields to add to `UiSlice` interface** (after `gitSyncMode`):
```typescript
dashboardReturnMode: AppMode; // initialized to "browse"
showDashboard: (returnMode: AppMode) => void;
hideDashboard: () => void;
```

**New initializer fields** (in `createUiSlice`, after `gitSyncMode: null`):
```typescript
dashboardReturnMode: "browse",
```

**New action implementations** (after `hideGitSync`):
```typescript
showDashboard: (returnMode) => set({ mode: "dashboard", dashboardReturnMode: returnMode }),
hideDashboard: () => set((s) => ({ mode: s.dashboardReturnMode })),
```

**Critical:** `showDashboard` writes ONLY `mode` and `dashboardReturnMode` — zero writes to `problem`, any `problemSlice` field, or any other slice (D-11: problem state preserved while in dashboard).

---

### `src/app.tsx` — add `mode === "dashboard"` branch (modify)

**Analog:** same file lines 20-23

**Current router** (lines 20-23):
```typescript
if (mode === "problem") {
  return <ProblemView renderer={renderer} />;
}
return <BrowseView renderer={renderer} />;
```

**Modified router — add BEFORE the `mode === "problem"` branch:**
```typescript
if (mode === "dashboard") {
  return <DashboardView renderer={renderer} />;
}
if (mode === "problem") {
  return <ProblemView renderer={renderer} />;
}
return <BrowseView renderer={renderer} />;
```

Add `import { DashboardView } from "./ui/components/DashboardView";` to the import block at the top.

---

### `src/ui/components/DashboardView.tsx` (component, request-response)

**Primary analog:** `src/ui/components/ResultFullscreen.tsx` (full-screen, absolute overlay, `useBindings`, `registerPopupScroller`, footer hint)

**Secondary analog:** `src/ui/components/ChangelogPopup.tsx` (`flexShrink={0}` on title/footer, `registerPopupScroller` directly on `<scrollbox ref=...>`)

**Binding mount pattern** (`ResultFullscreen.tsx` line 17):
```typescript
useBindings(() => ({ bindings: resultFullscreenBindings }), []);
```
Mirror: `useBindings(() => ({ bindings: dashboardBindings }), []);`

**Scroller registration pattern** (`ResultFullscreen.tsx` lines 19-23):
```typescript
const boxRef = useRef<ScrollBoxRenderable | null>(null);
const registerScroller = useCallback((box: ScrollBoxRenderable | null) => {
  boxRef.current = box;
  registerPopupScroller(box);
}, []);
```
OR the simpler direct-ref form from `ChangelogPopup.tsx` line 56:
```typescript
<scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
```
Use the `ChangelogPopup` form (direct `ref={registerPopupScroller}`) — DashboardView doesn't need the `boxRef.current?.scrollTo` snap on result change.

**Full-screen layout pattern** (`ResultFullscreen.tsx` lines 38-76):
```tsx
<box
  position="absolute"
  left={0} top={0} width="100%" height="100%"
  backgroundColor={colors.bg}
  flexDirection="column"
>
  {/* header row, height=1 */}
  <box flexDirection="row" width="100%" height={1} backgroundColor={colors.statusBar}>
    <text fg={colors.fgAccent}> Title </text>
  </box>
  {/* scrollable body */}
  <scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
    {/* content */}
  </scrollbox>
  {/* footer hint */}
  <text fg={colors.fgDim}> j/k:Scroll ^D/^U:Jump p/Esc/q:Close </text>
</box>
```

**`flexShrink={0}` pitfall** (`ChangelogPopup.tsx` lines 53, 95 — MANDATORY):
```tsx
<text fg={colors.fgAccent} flexShrink={0}> Progress Dashboard </text>
// ...
<text fg={colors.fgDim} flexShrink={0}> j/k:Scroll ... </text>
```
Both the header `<text>` and footer `<text>` MUST have `flexShrink={0}` or they collapse to zero height when the scrollbox content grows large (documented pitfall in `ChangelogPopup.tsx:28-34`).

**Per-segment coloring pattern for heatmap** (`QuestionList.tsx` lines 110-119):
```tsx
<box key={dow} flexDirection="row">
  <text fg={colors.fgDim}> {icon} </text>
  <text fg={colors.accent}>{markerStr}</text>
  <text fg={colors.fg} flexGrow={1}>{title}</text>
  <text fg={diffColor}> {difficulty} </text>
</box>
```
Mirror for each heatmap row: a `<box flexDirection="row">` containing sibling `<text fg={levelColor}>` elements, one per run of same-color cells (run-length encoding to minimize element count).

**Store subscription pattern** — subscribe only to what's needed:
```typescript
const dashboardStats = useAppStore((s) => s.dashboardStats);
const themeVersion = useAppStore((s) => s.themeVersion); // only if theme switching needed
```

**Theme token pattern for heatmap colors** (from `src/ui/theme.ts` — `colors` proxy usage in `ResultFullscreen.tsx` lines 4, 44-48):
```typescript
import { colors, difficultyColor } from "../theme";
// colors.subtle       — level 0 (empty day)
// colors.mutedAccent  — level 1 (1 solve)
// colors.accent       — level 2 (2–3 solves)
// colors.success      — level 3 (4–6 solves)
// colors.fgAccent     — level 4 (7+ solves)
```

**Empty-state branch pattern** (`ChangelogPopup.tsx` lines 57-59):
```tsx
{releases.length === 0 ? (
  <text fg={colors.fgDim}>No release notes available.</text>
) : ( /* real content */ )}
```
Mirror: when `dashboardStats === null` (store not loaded yet) or when `hasAnySubmissions()` is false, render the empty-state CTA instead of the real dashboard.

---

### `src/ui/keymap/commands/` — add `dashboard.open` and `dashboard.close` (modify/add)

**Analog:** `src/ui/keymap/commands/modal.ts` — `changelog.close` pattern (lines 100-112 — read from line 44 context):

**`makeCommand` pattern** (`modal.ts` lines 16-22):
```typescript
makeCommand({
  name: "popup.scrollDown",
  title: "Scroll popup down",
  category: "View",
  group: "modal",
  run: () => scrollActivePopup(1),
}),
```

**Global opener pattern** (`system.ts` lines 51-57):
```typescript
makeCommand({
  name: "help.open",
  title: "Show help screen",
  category: "System",
  short: "Help",
  run: () => useAppStore.getState().showHelp(),
}),
```

**`dashboard.open` command** — add to `src/ui/keymap/commands/system.ts` (palette-visible, `short` for palette display):
```typescript
makeCommand({
  name: "dashboard.open",
  title: "Open progress dashboard",
  category: "View",
  short: "Dashboard",
  run: () => {
    const s = useAppStore.getState();
    s.loadDashboardStats();
    s.showDashboard(s.mode as AppMode);
  },
}),
```

**`dashboard.close` command** — add to `src/ui/keymap/commands/modal.ts` (hidden from palette via `group: "modal"`):
```typescript
makeCommand({
  name: "dashboard.close",
  title: "Close dashboard",
  category: "View",
  group: "modal",
  run: () => useAppStore.getState().hideDashboard(),
}),
```

After adding commands, register them in `src/ui/keymap/commands/index.ts` — follow the existing spread pattern (`...systemCommands`, `...modalCommands`).

---

### `src/ui/keymap/bindings.ts` — add `dashboardBindings` + `"p"` to global bindings (modify)

**Analog:** `changelogBindings` (lines 108-115) for the new binding array; `solutions.openWorkspace` entry (line 55-56) for the two-scope global binding.

**New `dashboardBindings` array** — add after `changelogBindings`:
```typescript
// Mounted by DashboardView while open. j/k + Ctrl+d/u scroll the content,
// Esc/q/p close and return to the origin mode (dashboardReturnMode).
export const dashboardBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp": ["k", "up"],
  "popup.scrollHalfDown": "ctrl+d",
  "popup.scrollHalfUp": "ctrl+u",
  "dashboard.close": ["escape", "q"],
});
```

**Add `"p"` to `browseGlobalBindings`** (lines 27-58) — follow the `solutions.openWorkspace` comment style:
```typescript
// `p` opens the progress dashboard from browse (Stage 3 / D-09). Free: no other
// browse binding uses `p` (Ctrl+p is the palette; `p` itself was unbound).
"dashboard.open": "p",
```

**Add `"p"` to `problemGlobalBindings`** (lines 136-169) — follow the `solutions.openWorkspace` comment style:
```typescript
// Shift+W: open the whole solutions dir in $EDITOR (same global command as browse, ...)
// `p` opens the progress dashboard (Stage 3 / D-10, truly global).
"dashboard.open": "p",
```

**Export `dashboardBindings`** from `src/ui/keymap/index.ts` — mirror how `changelogBindings`, `resultFullscreenBindings` are re-exported from the barrel.

---

## Shared Patterns

### `registerPopupScroller` scroll wiring
**Source:** `src/ui/components/ChangelogPopup.tsx` line 56; `src/ui/keymap/runtime.ts` (the registry)
**Apply to:** `DashboardView.tsx` — the `<scrollbox ref={registerPopupScroller}>` call and the `dashboardBindings` `popup.scrollHalfDown/Up` commands both wire into the same registered scroller.
```tsx
<scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
  {/* all dashboard content */}
</scrollbox>
```

### `flexShrink={0}` on title and footer text
**Source:** `src/ui/components/ChangelogPopup.tsx` lines 53 and 95
**Apply to:** `DashboardView.tsx` header text AND footer hint text — both MUST have `flexShrink={0}`.

### `colors` proxy from `theme.ts`
**Source:** `src/ui/theme.ts` — `import { colors, difficultyColor } from "../theme";`
**Apply to:** `DashboardView.tsx` for ALL color references. Do not hardcode hex values. Use `difficultyColor(difficulty)` for the E/M/H breakdown colors.

### `useBindings` mount pattern
**Source:** `src/ui/components/ResultFullscreen.tsx` line 17
**Apply to:** `DashboardView.tsx`
```typescript
useBindings(() => ({ bindings: dashboardBindings }), []);
```

### `StateCreator<AppStore, [], [], SliceType>` slice signature
**Source:** `src/ui/store/slices/submissionsSlice.ts` line 22
**Apply to:** `dashboardSlice.ts`

### `// type: domain` header
**Source:** `src/ui/store/slices/submissionsSlice.ts` line 1
**Apply to:** `dashboardSlice.ts` — mandatory per UI/domain split rule

### Drizzle grouped aggregate query shape
**Source:** `src/db/submissions.ts` lines 76-83 (`getSubmissionCountsByQuestion`)
**Apply to:** `getFirstAcSummary()` in same file — same `.select({...}).from(...).groupBy(...).all()` chain, extended with `.innerJoin` and `.where(like(...))`.

---

## No Analog Found

All 9 files have analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/ui/components/`, `src/ui/store/slices/`, `src/ui/keymap/`, `src/db/`, `src/app.tsx`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-07-11
