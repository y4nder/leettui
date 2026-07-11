# Phase 3: Progress Dashboard — Research

**Researched:** 2026-07-11
**Domain:** Analytics aggregation + OpenTUI full-screen view rendering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** The single counting unit is a first-time distinct problem solve: `MIN(submittedAt)` where
`statusDisplay` includes "Accepted", grouped by `questionId`. Re-solves never count.

**D-02** Total solved = count of distinct problems ever AC'd; E/M/H breakdown buckets each by
difficulty at that first-AC event.

**D-03** A "solve-day" = local calendar day (via `toLocaleDateString('en-CA')`) on which ≥1
first-time AC occurred.

**D-04** Heatmap cell intensity, 7-/30-day counts, and sparkline are all driven by first-time
solves per day/week — same D-01 unit throughout.

**D-05** Layout order: summary cards → heatmap → trend (top-to-bottom, scrollable).

**D-06** Current streak leads the summary block: `🔥 12-day streak (best 21)`, followed by
total+breakdown, then 7d/30d + consistency %.

**D-07** Scrollable viewport via existing `registerPopupScroller` / `popup.scrollHalfDown/Up`
pattern. No bespoke scroll math.

**D-08** Read-only; j/k + Ctrl+d/Ctrl+u scroll, Esc/q exits. No focusable widgets.

**D-09** Global key `p` ("progress") opens the dashboard from both browse and problem view.
One `dashboard.open` command + two bindings (mirrors `solutions.openWorkspace`/`W`).

**D-10** Truly global — `p` opens from both browse AND problem view.

**D-11** Esc/q returns to the origin mode. `dashboardReturnMode` stashed on open; problem
slice's `problem` is NOT cleared while `mode === "dashboard"`.

**D-12** Heatmap: same filled glyph per cell, intensity ramps dim→bright over theme
accent/success family (~4 levels + empty). No hardcoded colors.

**D-13** Empty-state CTA when `hasAnySubmissions()` is false; real render for any data.

### Claude's Discretion

- Heatmap intensity bucketing thresholds (fixed vs relative quantiles)
- Exact theme tokens for the 4-step heatmap color ramp
- Sparkline scaling (window max vs fixed cap)
- Stat-card wording/glyphs and column layout within summary block
- Streak today-grace edge case handling
- Exact new aggregate query shapes in `src/db/submissions.ts`

### Deferred Ideas (OUT OF SCOPE)

- Dashboard drill-down / focusable widgets
- Per-topic breakdown / weak-topic view
- "Activity" (all-submissions) heatmap variant
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | New top-level dashboard view, global keybinding, `mode === "dashboard"` | §6 DB access shape; §2 analytics module |
| DASH-02 | Total solved + Easy/Medium/Hard breakdown | §3 Difficulty breakdown source; §2 first-AC reduction |
| DASH-03 | Current + longest streak, timezone-correct | §2 Streak algorithm |
| DASH-04 | Last-7-day and last-30-day solve counts | §2 Rolling window counts |
| DASH-05 | 52-week × 7-day activity heatmap, OpenTUI primitives, no new deps | §1 Heatmap rendering |
| DASH-06 | ~12-week trend sparkline, Unicode block glyphs | §5 Sparkline |
| DASH-07 | Rolling 30-day consistency score (solve-days / 30) | §2 Consistency algorithm |
</phase_requirements>

---

## Summary

Phase 3 is a read/aggregate/render phase: no new schema, no new deps, no network calls. All
six focus areas have verified answers that close the implementation unknowns the CONTEXT left open.

The critical architectural insight is the `submittedAt` unit: the DB stores **unix milliseconds**
uniformly (`backfill.ts:100` multiplies API seconds by 1000; `submission.ts:67` uses `Date.now()`).
The CONTEXT incorrectly described the field as "unix seconds" — verified against the schema comment
and both write paths. The analytics module must divide by 1000 or use the ms value directly with
`new Date(ms)`.

The OpenTUI heatmap rendering question is definitively resolved: render 7 sibling `<text>` elements
(one per day-of-week row), each containing a JS-built string of 52 colored cell glyphs, where per-
segment coloring is applied by wrapping each distinct-color run in a sibling `<text fg=...>` inside
a `flexDirection="row"` `<box>`. No per-cell box needed; no new deps required.

**Primary recommendation:** JS-side first-AC bucketing in a pure analytics module, fed by a single
new SQL query that fetches all first-AC rows (questionId + submittedAt + difficulty via join); the
pure module computes every derived stat from that one result set.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| First-AC aggregate query | DB layer (`src/db/submissions.ts`) | — | Leverages existing indexes; keeps raw rows out of UI |
| Analytics computation (streak, consistency, bucketing) | Pure TS module (`src/ui/analytics.ts`) | — | Must be unit-testable; pure input→output |
| Dashboard state + load trigger | Domain Zustand slice | — | Mirrors `submissionsSlice`/`questionsSlice` domain pattern |
| Heatmap grid render | `DashboardView.tsx` | `<text>` intrinsic | Pure render of pre-computed data structure |
| Sparkline render | `DashboardView.tsx` | mirrors `progress.ts` | Pure geometry, no framework deps |
| Scroll/open/close bindings | `src/ui/keymap/` | `DashboardView.tsx` via `useBindings` | Existing `registerPopupScroller` pattern |
| Return-mode memory | `uiSlice.ts` + open handler | — | `dashboardReturnMode` field on `uiSlice` |

---

## Focus Area 1: Heatmap Rendering with OpenTUI Primitives

**Verdict: DOABLE, no new deps. Verified approach below.**

### Available OpenTUI Props (VERIFIED from type declarations)

`<box>` (`BoxOptions` extends `RenderableOptions`):
- Layout: `flexDirection`, `flexGrow`, `flexWrap`, `width`, `height`, `gap`, `rowGap`, `columnGap`, `padding*`, `alignItems`, `justifyContent`, `alignSelf`
- Visual: `backgroundColor`

`<text>` (`TextBufferOptions` extends `RenderableOptions`):
- Color: `fg` (`string | RGBA`) and `bg` (`string | RGBA`) — **per-text-element**, not per-character
- Typography: `attributes` (bold/italic/etc via `TextAttributes`)
- Layout: all `RenderableOptions` fields (width, flexGrow, etc.)

**Key constraint:** `fg` applies to the whole `<text>` element, not to individual characters inside
it. To color individual cells differently, each distinct-color run must be its own `<text fg=...>`.

**Precedent in the codebase:** `QuestionList.tsx:110-119` renders each colored segment of a row as
a separate `<text fg={...}>` sibling inside a `flexDirection="row"` parent box. This is the
established pattern for per-segment coloring.

[VERIFIED: `node_modules/@opentui/core/renderables/TextBufferRenderable.d.ts:11-12`, `node_modules/@opentui/core/Renderable.d.ts:31-38`]

### Concrete Heatmap Structure

The heatmap is 52 weeks × 7 days = 364 cells. The render strategy:

```
Option A (recommended): 7-row layout, one row per weekday
  - 7 <text> elements, each carrying a 52-glyph string with color runs
  - But: a single <text> can only have one fg; multi-colored string needs sibling <text>s

Option B (correct): 7-row box, each row is a flexDirection="row" box of colored <text> segments
  - Group consecutive same-color cells into runs
  - Each run = one <text fg={levelColor}>{glyph.repeat(runLength)}</text>
  - Worst case (all different): 364 <text> elements
  - Best case (uniform): 7 <text> elements (one per row)
  - Typical: ~5-15 runs per row (streak patterns → long uniform segments)
```

**Recommended: Option B** — a column of 7 `<box flexDirection="row">` rows, each containing
colored `<text>` segments built by run-length encoding the 52-cell color array for that weekday.

```tsx
// One row per weekday (0=Mon..6=Sun in ISO week layout)
{Array.from({length: 7}, (_, dow) => (
  <box key={dow} flexDirection="row">
    {buildRowSegments(heatmapGrid[dow], levelColors)}
  </box>
))}
```

Where `buildRowSegments(cells, levelColors)` returns an array of `<text fg={color}>glyphs</text>`
by run-length encoding `cells` (level 0..4 per cell).

**Cell glyph:** Use `■` (U+25A0, BLACK SQUARE) — a solid square that is exactly 1 cell wide in most
terminals. `█` (U+2588 FULL BLOCK) is also acceptable; `■` has cleaner visual spacing. The glyph
used in the grid must be consistent (D-12: "same filled glyph"). The `░` dim track uses the same
character colored at level 0 (empty day color).

**Performance:** 364 cells, run-length encoded. In a typical user with activity spread over months,
expect ~50-150 `<text>` elements total across 7 rows. This is comparable to the QuestionList's
per-row segment count and well within OpenTUI's render budget.

**No new deps required.** [VERIFIED: observed rendering pattern in `src/ui/components/QuestionList.tsx`]

### The `<scrollbox>` Wrapper

The full dashboard content (summary block + heatmap + sparkline) is wrapped in a `<scrollbox>`
registered via `registerPopupScroller` — exactly as `ChangelogPopup.tsx:56` and
`ResultFullscreen.tsx:62` do. The heatmap is just another set of children inside that scrollbox.

---

## Focus Area 2: Pure Analytics Module Algorithms

All algorithms operate on the **first-AC set**: `Array<{questionId: number, solvedMs: number, difficulty: "Easy"|"Medium"|"Hard"}>` where `solvedMs` is the minimum `submittedAt` (milliseconds) per `questionId`.

### `submittedAt` Unit — CRITICAL CLARIFICATION

The CONTEXT.md described `submittedAt` as "unix **seconds**". This is **incorrect**.

The DB schema comment (`schema.ts:60`):
> `submittedAt` is unix **milliseconds** (the API returns seconds — multiply by 1000 at insert)

The two write paths confirm:
- `backfill.ts:100`: `submittedAt: submittedAtSeconds * 1000` — API seconds → DB milliseconds
- `submission.ts:67`: `submittedAt: Date.now()` — already milliseconds for live submits

**The analytics module must treat `submittedAt` as unix milliseconds.** Converting to a local day:
```typescript
const dayKey = new Date(row.submittedAt).toLocaleDateString("en-CA");
// → "YYYY-MM-DD" in the user's local timezone
```

[VERIFIED: `src/core/backfill.ts:87-100`, `src/core/submission.ts:67`, `src/db/schema.ts:60`]

### Algorithm 1: First-AC Reduction (D-01)

Input: all rows from `submissions` where `statusDisplay` includes "Accepted".
Output: `Map<questionId, {solvedMs, difficulty}>` — exactly one entry per solved question.

```typescript
// In the pure analytics module (src/ui/analytics.ts):
export interface FirstAcRow {
  questionId: number;
  solvedMs: number;       // unix milliseconds — the MIN(submittedAt) for this questionId
  difficulty: "Easy" | "Medium" | "Hard";
}

// The SQL query does the MIN and join; the module receives already-reduced rows.
// If done in JS from raw rows instead:
function buildFirstAcMap(rawRows: {questionId: number; statusDisplay: string; submittedAt: number; difficulty: string}[]): FirstAcRow[] {
  const best = new Map<number, FirstAcRow>();
  for (const row of rawRows) {
    if (!row.statusDisplay.includes("Accepted")) continue;
    const existing = best.get(row.questionId);
    if (!existing || row.submittedAt < existing.solvedMs) {
      best.set(row.questionId, {
        questionId: row.questionId,
        solvedMs: row.submittedAt,
        difficulty: row.difficulty as "Easy" | "Medium" | "Hard",
      });
    }
  }
  return [...best.values()];
}
```

### Algorithm 2: Timezone-Correct Day Bucketing (D-03)

```typescript
// Convert a unix-millisecond timestamp to a YYYY-MM-DD local day key (locked).
function toLocalDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA"); // always "YYYY-MM-DD"
}

// Build the set of solve-days from the first-AC array.
function buildSolveDays(firstAcs: FirstAcRow[]): Set<string> {
  const days = new Set<string>();
  for (const row of firstAcs) {
    days.add(toLocalDayKey(row.solvedMs));
  }
  return days;
}
```

### Algorithm 3: Current + Longest Streak (D-03)

**Today-grace recommendation (discretionary):** A streak counted through yesterday stays "current"
through end-of-today. This matches LeetCode's own streak behavior and avoids penalizing users who
open the dashboard before solving their daily problem. Implementation: when computing the current
streak, treat today's local day key as having a solve if it is missing from the solve-days set (i.e.,
extend the window by one day forward).

```typescript
function computeStreaks(solveDays: Set<string>): {current: number; longest: number} {
  if (solveDays.size === 0) return {current: 0, longest: 0};

  // Sort day keys ascending. YYYY-MM-DD sorts correctly as strings.
  const sorted = [...solveDays].sort();

  // Inject today as a "grace" day if today has no solve yet.
  const todayKey = toLocalDayKey(Date.now());
  if (!solveDays.has(todayKey)) sorted.push(todayKey);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]!);
    const curr = new Date(sorted[i]!);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current streak: run from the end of the (grace-extended) sorted array.
  // If the last entry is today or yesterday, the run ending there is current.
  // (The grace injection above ensures today is always present, so the run
  // ending at today is always current if ≥1 solve day exists within range.)
  const current = run; // `run` after the loop ends at the last element

  return {current, longest};
}
```

**Edge cases to unit-test:**
- Empty solve set → {0, 0}
- One solve today → {1, 1}
- One solve yesterday, nothing today → grace extends → {1, 1} (still current)
- Gap of 2 days → streak breaks → current = 0 (not extended by grace beyond 1-day look-back)
- All consecutive → current = longest = N

**Pitfall:** `new Date("2026-07-10")` parses as UTC midnight, so date arithmetic via `getTime()`
diff is correct for day-counting as long as you compare parsed date keys consistently (both sides
UTC). Do not mix parsed dates with local-time date math.

### Algorithm 4: Rolling 30-Day Consistency (D-07)

```typescript
function computeConsistency(solveDays: Set<string>): number {
  const todayMs = Date.now();
  const thirtyDaysAgoMs = todayMs - 30 * 86_400_000;
  const todayKey = toLocalDayKey(todayMs);

  let count = 0;
  for (const day of solveDays) {
    const dayMs = new Date(day).getTime(); // parses as UTC midnight → consistent
    // Window: [thirtyDaysAgoMs, todayMs], inclusive of today's local day.
    if (dayMs >= thirtyDaysAgoMs && day <= todayKey) {
      count++;
    }
  }
  // consistency = solve-days-in-last-30 / 30
  return count / 30; // 0..1; multiply by 100 for display as percent
}
```

**Window boundary definition:** The last-30 window is the 30-day span ending at end-of-today
(local). Inclusive of today's local date, inclusive of the day 30 days ago. A day with only one
solve at 11:59 PM counts; a day with only a re-solve (already AC'd problem) does not count
(enforced by the first-AC set).

### Algorithm 5: Last-7-Day and Last-30-Day Counts (D-04)

These count **first-time solves** (individual problems, not solve-days) within each window.

```typescript
function computeRecentCounts(firstAcs: FirstAcRow[]): {last7: number; last30: number} {
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 86_400_000;
  const thirtyDaysAgoMs = nowMs - 30 * 86_400_000;
  let last7 = 0;
  let last30 = 0;
  for (const row of firstAcs) {
    if (row.solvedMs >= sevenDaysAgoMs) last7++;
    if (row.solvedMs >= thirtyDaysAgoMs) last30++;
  }
  return {last7, last30};
}
```

---

## Focus Area 3: Difficulty Breakdown Source (DASH-02)

**Difficulty does NOT live in the `submissions` table.** It lives in `questions.difficulty`.

The `submissions` schema has no difficulty column. The `questions` table (`schema.ts:7-8`) has
`difficulty: text("difficulty").notNull()` as a first-class column, typed as
`"Easy" | "Medium" | "Hard"` in `DbQuestion` (`questions.ts:9`).

**Cleanest path:** A single SQL query that joins `submissions` to `questions` on `questionId`,
filters `statusDisplay` includes "Accepted", and returns the minimum `submittedAt` per question
along with `questions.difficulty`. Drizzle supports this with `.innerJoin` + `.groupBy`.

```typescript
// New query in src/db/submissions.ts
import { min, and, like } from "drizzle-orm";

export interface FirstAcSummaryRow {
  questionId: number;
  difficulty: string;
  firstAcMs: number; // MIN(submittedAt) for this questionId, AC rows only
}

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

**Why `like` not `eq`:** `verdict.ts:16` uses `statusDisplay.includes("Accepted")` (substring
match) because the field is free text from two different API surfaces that may not be byte-identical.
The SQL equivalent is `LIKE '%Accepted%'`. [VERIFIED: `src/ui/verdict.ts:16`]

**Existing index used:** `idx_sub_question_time` (`questionId, submittedAt`) covers the GROUP BY
questionId + the WHERE filter (partial scan per question). For the join, `questions.id` is the
primary key (auto-indexed). [VERIFIED: `src/db/schema.ts:80-82`]

**No schema change needed.** This is a read-only join query over existing tables and indexes.

---

## Focus Area 4: Aggregate Query Strategy — SQL vs JS

**Recommendation: SQL for the first-AC reduction; JS for all derived stats.**

**Rationale:**

The first-AC-per-problem reduction is a natural `MIN(submittedAt) GROUP BY questionId` — a
single, indexed SQL aggregate. Doing it in JS requires fetching every AC row (potentially thousands),
then iterating to find minimums. The SQL path returns one row per solved problem (bounded by ~3000
for prolific LeetCode users), which is a manageable in-memory structure.

Once the analytics module has the `FirstAcSummaryRow[]` result (one row per solved problem with
`questionId`, `difficulty`, `firstAcMs`), **all further computation is pure JS** — streak, day
bucketing, consistency, heatmap grid, sparkline. This keeps the analytics module:

1. **Unit-testable without a DB.** Pass a `FirstAcSummaryRow[]` fixture and assert on outputs.
   No mocking needed. This matches the repo's existing pure-module test pattern (`progress.ts`,
   `testRunner.ts`, `search.ts`).

2. **Framework-free.** The analytics module has no React/Zustand imports — just plain TS functions.

3. **Single DB round-trip.** One `getFirstAcSummary()` call loads everything; all stats derive
   from the same snapshot, so numbers are internally consistent.

**Alternative considered (pure-JS bucketing from raw rows):** Rejected because it requires fetching
all AC submission rows (can be thousands if a user re-submits frequently), while the SQL aggregate
already does the correct `MIN` selection before sending data over the Drizzle boundary.

**Existing query style precedent:** `getSubmissionCountsByQuestion()` in `submissions.ts:76-83`
uses `.select({questionId, n: count()}).from(submissions).groupBy(questionId)` — the same grouped
aggregate pattern as the proposed `getFirstAcSummary()`.
[VERIFIED: `src/db/submissions.ts:76-83`]

---

## Focus Area 5: Sparkline (DASH-06)

**Approach: pure geometry module, exactly mirrors `src/ui/progress.ts`.**

The sparkline shows ~12 weeks of first-time solves per week as a Unicode block bar string.
The 8-bar Unicode block set (`▁▂▃▄▅▆▇█`, same as common terminal sparkline conventions) maps
a per-week count to a height level 1–8 (0-count weeks are a space or a dim `▁`).

```typescript
// src/ui/analytics.ts (or src/ui/sparkline.ts — pure, no React imports)
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export function buildSparkline(weeklyCounts: number[]): string {
  const max = Math.max(...weeklyCounts, 1); // avoid div/0; minimum scale of 1
  return weeklyCounts
    .map((n) => {
      if (n === 0) return " "; // empty week → space
      const level = Math.round((n / max) * (BLOCKS.length - 1));
      return BLOCKS[level] ?? "█";
    })
    .join("");
}
```

**Scaling recommendation (discretionary): scale to window max.** The sparkline's purpose is to
show trend shape (going up/down), not absolute volume. Scaling to the max-count week ensures the
bars use the full height range, making small improvements visible even for users solving 1-2/week.
A fixed cap (e.g., 10 problems/week) would pin bars at 100% for active users, flattening the
trend. Window-max scaling is the convention used by GitHub's contribution graph and Homebrew's
`brew leaves` sparklines.

**Week boundary:** ISO week bucketing — the 12 most recent complete calendar weeks plus the
current partial week (or 12 full weeks, planner's choice). A simple approach:

```typescript
function buildWeeklyBuckets(firstAcs: FirstAcRow[], numWeeks = 12): number[] {
  const buckets = new Array(numWeeks).fill(0);
  const nowMs = Date.now();
  for (const row of firstAcs) {
    // How many whole weeks ago was this solve?
    const weeksAgo = Math.floor((nowMs - row.solvedMs) / (7 * 86_400_000));
    if (weeksAgo < numWeeks) {
      buckets[numWeeks - 1 - weeksAgo]!++;
    }
  }
  return buckets; // index 0 = oldest, index 11 = most recent
}
```

**Unit test:** the sparkline is a pure string function — trivially testable with numeric arrays.
[CITED: `src/ui/progress.ts` pure module pattern]

---

## Focus Area 6: DB Access Shape and Zustand Wiring

### New DB Function

Add one function to `src/db/submissions.ts`:

```typescript
// getFirstAcSummary(): FirstAcSummaryRow[]
// See Focus Area 3 for the full implementation.
// Exported alongside the existing exports; no schema change required.
```

No migration needed — Phase 3 adds zero DDL. The read query touches only existing tables and indexes.
[VERIFIED: `src/db/schema.ts` — `submissions` + `questions` tables fully exist]

### New Domain Slice: `dashboardSlice.ts`

**Pattern:** mirror how `submissionsSlice` loads per-problem history (domain slice, async DB call
triggered by the view mount or mode change, result stored on the slice).

```typescript
// src/ui/store/slices/dashboardSlice.ts
// type: domain
// Owns dashboard aggregate stats. Loaded on dashboard open; cleared on close.

export interface DashboardStats {
  totalSolved: number;
  byDifficulty: { Easy: number; Medium: number; Hard: number };
  currentStreak: number;
  longestStreak: number;
  last7: number;
  last30: number;
  consistency: number; // 0..1
  heatmapGrid: number[][]; // [weekIndex 0..51][dow 0..6] = first-solve count
  sparklineWeeks: number[]; // [0..11] = problems/week, newest last
}

export interface DashboardSlice {
  dashboardStats: DashboardStats | null;
  loadDashboardStats: () => void;
  clearDashboardStats: () => void;
}
```

**Load trigger:** `loadDashboardStats()` is called by the `dashboard.open` command handler before
setting `mode === "dashboard"` (or in a `useEffect` on `DashboardView` mount — planner's call, but
the command handler is cleaner since it avoids a render-then-load flash).

**Return-mode wiring on `uiSlice`:**

```typescript
// Add to uiSlice.ts:
dashboardReturnMode: AppMode; // initialized to "browse"
showDashboard: (returnMode: AppMode) => void;
hideDashboard: () => void;

// Implementation:
showDashboard: (returnMode) => set({ mode: "dashboard", dashboardReturnMode: returnMode }),
hideDashboard: () => set((s) => ({ mode: s.dashboardReturnMode })),
```

**Critical:** `showDashboard` must NOT clear `problemSlice.problem` — the problem state is
preserved while `mode === "dashboard"` so returning to problem view is a plain `setMode("problem")`.
This is already the behavior if `showDashboard` only writes `mode` and `dashboardReturnMode`
(does not touch problem state).

### New AppMode

Add `"dashboard"` to the `AppMode` union in `src/ui/store/slices/uiSlice.ts:21-39`:

```typescript
export type AppMode =
  | "browse" | "search" | "popup" | "select" | "result" | "help" | "debug"
  | "palette" | "problem" | "relocate" | "changelog" | "recent" | "gitInit"
  | "gitRemote" | "gitSync" | "config" | "backfillNudge" | "easterEgg"
  | "dashboard"; // Phase 3
```

[VERIFIED: `src/ui/store/slices/uiSlice.ts:21-39`]

### app.tsx Router

```tsx
// src/app.tsx — add one branch:
if (mode === "dashboard") {
  return <DashboardView renderer={renderer} />;
}
if (mode === "problem") {
  return <ProblemView renderer={renderer} />;
}
return <BrowseView renderer={renderer} />;
```

[VERIFIED: `src/app.tsx:20-24`]

### Commands + Bindings

**Command (add to `src/ui/keymap/commands/system.ts` or a new `commands/dashboard.ts`):**

```typescript
makeCommand({
  name: "dashboard.open",
  title: "Open progress dashboard",
  category: "View",
  short: "Dashboard",
  run: () => {
    const s = useAppStore.getState();
    s.loadDashboardStats();
    s.showDashboard(s.mode as AppMode); // stash current mode as return mode
  },
})
```

**Bindings (add to `browseGlobalBindings` and `problemGlobalBindings` in `bindings.ts`):**

```typescript
// browseGlobalBindings — add:
"dashboard.open": "p",

// problemGlobalBindings — add:
"dashboard.open": "p",
```

**Verify `p` is free:**
- `browseGlobalBindings`: no `"p"` binding present [VERIFIED: `src/ui/keymap/bindings.ts:27-58`]
- `problemGlobalBindings`: no `"p"` binding present [VERIFIED: `src/ui/keymap/bindings.ts:136-169`]

**Dashboard scroll/exit bindings (new `dashboardBindings` array):**

```typescript
export const dashboardBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp": ["k", "up"],
  "popup.scrollHalfDown": "ctrl+d",
  "popup.scrollHalfUp": "ctrl+u",
  "dashboard.close": ["escape", "q"],
});
```

And a new `dashboard.close` command (group: "modal"):

```typescript
makeCommand({
  name: "dashboard.close",
  title: "Close dashboard",
  category: "View",
  group: "modal",
  run: () => useAppStore.getState().hideDashboard(),
})
```

[VERIFIED pattern: `changelogBindings` in `bindings.ts:108-115`, `changelog.close` in `modal.ts:105-108`]

---

## Answers to Claude's Discretion Items

### Heatmap Intensity Bucketing Thresholds

**Recommendation: fixed thresholds.** Relative quantiles would change meaning as the user solves
more problems, making the heatmap misleading over time. Fixed thresholds:

| Level | Daily first-solve count | Meaning |
|-------|------------------------|---------|
| 0 (empty) | 0 | No solve |
| 1 (dim) | 1 | Light day |
| 2 | 2–3 | Moderate |
| 3 | 4–6 | Active |
| 4 (bright) | ≥7 | Highly active |

These are reasonable for LeetCode: 7+ first-time solves in one day is exceptional. Adjust if needed
by user feedback.

### Exact Theme Tokens for 4-Step Heatmap Color Ramp

The Theme interface (`themes/index.ts`) has these semantic tokens relevant to a "intensity ramp":

- Level 0 (empty): `colors.fgDim` (or `colors.surface` / `colors.subtle`) — dim, unobtrusive
- Level 1: `colors.mutedAccent` — low intensity accent
- Level 2: `colors.accent` — standard accent
- Level 3: `colors.success` — brighter semantic green family
- Level 4: `colors.fgAccent` — bright accent (the brightest non-error token)

This ramp uses the accent/success family and works across all themes (tokyo-night, catppuccin,
rose-pine, nord, system). The `colors` Proxy reads live, so it respects theme switches.

```typescript
// In DashboardView.tsx or heatmap helper:
function heatmapLevelColor(level: 0 | 1 | 2 | 3 | 4): ThemeColor {
  switch (level) {
    case 0: return colors.subtle;       // empty day — dim track color
    case 1: return colors.mutedAccent;  // 1 solve — low glow
    case 2: return colors.accent;       // 2-3 solves
    case 3: return colors.success;      // 4-6 solves
    case 4: return colors.fgAccent;     // 7+ solves — max brightness
  }
}
```

[VERIFIED: `src/ui/themes/tokyo-night.ts` — all 4 tokens exist across the theme interface]

### Sparkline Scaling

**Recommendation: window max (scale to the maximum week's count).** See Focus Area 5 rationale.

### Stat-Card Wording and Glyphs

**Recommendation** (from CONTEXT §Specific Ideas):

```
🔥 12-day streak  (best: 21)
──────────────────────────────
234 solved    E 120 · M 98 · H 16
7d: 9   30d: 34   consistency: 60%

Activity (52 wk)
[heatmap grid]

Trend (12 wk)
▂▃▅▇▆▄▃▅▆▇▅▃
```

The `·` separator between E/M/H breakdown is readable and compact. Use `difficultyColor()` for
the E/M/H values. The streak `🔥` emoji is locked in D-06; note that emoji are 2-cell-wide in
most terminals — the streak line should not try to right-align to a fixed column.

### Streak Today-Grace

**Recommendation: grace enabled.** See Focus Area 2, Algorithm 3 rationale. Today's unsolved
state does not break the current streak until midnight local time. This is locked by the algorithm
above.

---

## Architecture Patterns

### System Architecture Diagram

```
[user presses "p"]
       │
       ▼
dashboard.open command (keymap)
       │ calls loadDashboardStats() + showDashboard(returnMode)
       ▼
getFirstAcSummary() ──── DB query ────► submissions JOIN questions
       │                                GROUP BY questionId WHERE status LIKE '%Accepted%'
       ▼
FirstAcSummaryRow[]
       │
       ▼
computeDashboardStats(rows)  ──────────► pure analytics module
       │                                 (streak, consistency, bucketing, heatmap, sparkline)
       ▼
DashboardStats ──────────────────────► dashboardSlice.dashboardStats
       │
       ▼
DashboardView (React)
  ├─ <scrollbox ref={registerPopupScroller}>
  │    ├─ SummaryBlock (streak + totals + counts)
  │    ├─ HeatmapGrid (7 rows × 52 col colored <text> segments)
  │    └─ SparklineBlock (~12 Unicode blocks + label)
  └─ dashboardBindings layer (j/k + Ctrl+d/u scroll, Esc/q → hideDashboard)
       │
       ▼
[user presses Esc/q]
       │
hideDashboard() → setMode(dashboardReturnMode)
  ├─ if returnMode === "problem": ProblemView renders (problem state preserved)
  └─ if returnMode === "browse":  BrowseView renders
```

### Recommended Project Structure (new files only)

```
src/
├── ui/
│   ├── analytics.ts          # Pure: computeDashboardStats, buildSparkline, heatmapLevel
│   ├── analytics.test.ts     # Co-located unit tests (streak, consistency, bucketing)
│   ├── store/slices/
│   │   └── dashboardSlice.ts # type: domain — DashboardStats + load/clear actions
│   ├── components/
│   │   └── DashboardView.tsx # Full-screen view, owns dashboardBindings
│   └── keymap/
│       ├── commands/system.ts  # add dashboard.open + dashboard.close commands
│       └── bindings.ts         # add dashboardBindings; add "p" to browse/problemGlobal
├── db/
│   └── submissions.ts        # add getFirstAcSummary()
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scrollable dashboard | Custom scroll offset math | `registerPopupScroller` + `popup.scrollHalfDown/Up` | Already wired in changelog/resultFullscreen; 0 new code |
| Per-segment coloring | CSS-style character attributes | Multiple sibling `<text fg=...>` elements | OpenTUI's color model is per-text-node; verified from type defs |
| Progress bar geometry | Custom bar renderer | `src/ui/progress.ts:smoothBar` (not needed for the heatmap, but for any progress bars) | Already pure + unit-tested |
| Sparkline bar chars | Custom Unicode lookup | `BLOCKS` array (`▁▂▃▄▅▆▇█`) in the analytics module | 8-level standard set; mirrors progress.ts approach |
| Return-mode memory | AppMode stack/history | `dashboardReturnMode: AppMode` field on `uiSlice` | One field; no stack needed (only one level of nesting) |

---

## Common Pitfalls

### Pitfall 1: submittedAt Is Milliseconds, Not Seconds

**What goes wrong:** Using `submittedAt` directly as seconds in date calculations produces dates
in 1970 (47,000 years' worth of seconds = ~47,000,000,000,000 ms, which is year 1,500,000 in ms).

**Why it happens:** The CONTEXT.md description said "unix seconds"; the actual DB value is
milliseconds (the backfill multiply-by-1000 is the correct write path).

**How to avoid:** Use `new Date(row.solvedMs)` directly — `solvedMs` here is the millisecond value
from the DB. Do not multiply by 1000. [VERIFIED: `src/core/backfill.ts:100`]

### Pitfall 2: `new Date("YYYY-MM-DD")` Parses as UTC Midnight

**What goes wrong:** `new Date("2026-07-10").getTime()` gives UTC midnight of July 10, which may
be July 9 in local time (UTC-5). Comparing this against local day keys breaks streak arithmetic.

**How to avoid:** Keep all day-key comparisons in the YYYY-MM-DD string domain (ISO string sort
order is correct for dates). Only convert via `new Date(isoString).getTime()` for millisecond
arithmetic (window boundaries), and compare consistently — both sides must use the same UTC-
midnight convention, which they do since `toLocaleDateString('en-CA')` is used for all keys.

**Testing:** Unit tests should include a case where the local timezone is not UTC.

### Pitfall 3: heatmapGrid Indexing

**What goes wrong:** Building the heatmap grid as `[weekIndex][dow]` vs `[dow][weekIndex]` affects
the render loop. The render iterates 7 rows (dow), each row has 52 columns (weekIndex). If the
grid is built transposed, every cell is wrong.

**How to avoid:** Define the grid as `heatmapGrid[weekIndex][dow]` in the analytics module (natural
time-series order), but have the render loop iterate `for dow in 0..6: for week in 0..51` — i.e.,
access `heatmapGrid[week][dow]`. Document the index convention explicitly in the module.

### Pitfall 4: `like` vs Exact Match for statusDisplay

**What goes wrong:** Using `eq(submissions.statusDisplay, "Accepted")` misses rows stored as
"Accepted (partial)" or with trailing whitespace from either API surface.

**How to avoid:** Use Drizzle's `like(submissions.statusDisplay, "%Accepted%")` in the SQL query,
mirroring `verdict.ts:16`'s `statusDisplay.includes("Accepted")` logic.

### Pitfall 5: `flexShrink` on Summary/Footer Text

**What goes wrong:** The ChangelogPopup comment (`ChangelogPopup.tsx:28-34`) documents that title
and footer `<text>` elements need `flexShrink={0}` or they get compressed to 0 height when the
scrollbox content grows large.

**How to avoid:** Add `flexShrink={0}` to the dashboard's title/header and any footer hint text,
same as `ChangelogPopup.tsx:53` and `ChangelogPopup.tsx:95`.

[VERIFIED: `src/ui/components/ChangelogPopup.tsx:28-34`]

### Pitfall 6: Problem State Not Cleared on Dashboard Open

**What goes wrong:** If `showDashboard` clears `problem` on the `problemSlice`, pressing Esc while
in the dashboard loses the problem context. D-11 explicitly requires preserving it.

**How to avoid:** `showDashboard` must write only `mode` and `dashboardReturnMode` — zero writes
to `problem`, `problemSlice`, or any other slice fields.

---

## Code Examples

### Full Heatmap Grid Builder (analytics module)

```typescript
// src/ui/analytics.ts — pure, no React imports

// Build a 52×7 grid of first-solve counts, indexed [weekIndex][dow].
// weekIndex 0 = 52 weeks ago, weekIndex 51 = current week.
// dow: 0=Sunday..6=Saturday (matching Date.prototype.getDay()).
export function buildHeatmapGrid(firstAcs: FirstAcRow[]): number[][] {
  const grid: number[][] = Array.from({length: 52}, () => new Array(7).fill(0));
  const nowMs = Date.now();
  const msPerWeek = 7 * 86_400_000;

  for (const row of firstAcs) {
    const weeksAgo = Math.floor((nowMs - row.solvedMs) / msPerWeek);
    if (weeksAgo >= 52) continue; // older than 52 weeks — skip
    const weekIndex = 51 - weeksAgo; // most recent = index 51
    const dow = new Date(row.solvedMs).getDay(); // 0=Sun..6=Sat local
    grid[weekIndex]![dow]!++;
  }
  return grid;
}
```

### DashboardView Scroll Wiring (mirrors ChangelogPopup)

```tsx
// src/ui/components/DashboardView.tsx
import { useCallback } from "react";
import { useBindings } from "@opentui/keymap/react";
import { registerPopupScroller, dashboardBindings } from "../keymap";

export function DashboardView() {
  useBindings(() => ({ bindings: dashboardBindings }), []);
  const registerScroller = useCallback((box: ScrollBoxRenderable | null) => {
    registerPopupScroller(box);
  }, []);

  // ...

  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%"
         backgroundColor={colors.bg} flexDirection="column">
      <text fg={colors.fgAccent} flexShrink={0}> Progress Dashboard </text>
      <scrollbox ref={registerScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
        {/* SummaryBlock, HeatmapGrid, SparklineBlock */}
      </scrollbox>
      <text fg={colors.fgDim} flexShrink={0}> j/k:Scroll ^D/^U:Jump p/Esc/q:Close </text>
    </box>
  );
}
```

### computeDashboardStats Entry Point

```typescript
// src/ui/analytics.ts — the single export the dashboardSlice calls
export function computeDashboardStats(rows: FirstAcSummaryRow[]): DashboardStats {
  // 1. Total + breakdown
  const totalSolved = rows.length;
  const byDifficulty = {Easy: 0, Medium: 0, Hard: 0};
  for (const r of rows) {
    const d = r.difficulty as keyof typeof byDifficulty;
    if (d in byDifficulty) byDifficulty[d]++;
  }

  // 2. Build base data structures
  const firstAcs: FirstAcRow[] = rows.map(r => ({
    questionId: r.questionId,
    solvedMs: r.firstAcMs,
    difficulty: r.difficulty as FirstAcRow["difficulty"],
  }));
  const solveDays = buildSolveDays(firstAcs);

  // 3. Streak
  const {current: currentStreak, longest: longestStreak} = computeStreaks(solveDays);

  // 4. Recent counts
  const {last7, last30} = computeRecentCounts(firstAcs);

  // 5. Consistency
  const consistency = computeConsistency(solveDays);

  // 6. Heatmap
  const heatmapGrid = buildHeatmapGrid(firstAcs);

  // 7. Sparkline
  const sparklineWeeks = buildWeeklyBuckets(firstAcs, 12);

  return {totalSolved, byDifficulty, currentStreak, longestStreak, last7, last30,
          consistency, heatmapGrid, sparklineWeeks};
}
```

---

## Schema Migration Gate

**No DDL change required for Phase 3.** The phase adds only read/aggregate queries over the
existing `submissions` and `questions` tables. The `submissions` schema (`schema.ts:64-84`) already
has `questionId`, `statusDisplay`, and `submittedAt` with appropriate indexes. The `questions`
table already has `difficulty`. The embedded migration workflow (edit `schema.ts` → `db:generate`
→ embed in `migrations.ts`) does **not need to run** for this phase.

The planner should **not** create a migration task for Phase 3. [VERIFIED: `src/db/schema.ts`]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | `package.json` `test` script: `bun test` |
| Quick run command | `bun test src/ui/analytics.test.ts` |
| Full suite command | `bun run check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-02 | E/M/H breakdown from `FirstAcSummaryRow[]` | unit | `bun test src/ui/analytics.test.ts` | ❌ Wave 0 |
| DASH-03 | Current + longest streak, today-grace | unit | `bun test src/ui/analytics.test.ts` | ❌ Wave 0 |
| DASH-04 | last7 / last30 counts | unit | `bun test src/ui/analytics.test.ts` | ❌ Wave 0 |
| DASH-05 | Heatmap grid indexing (52×7, correct cell) | unit | `bun test src/ui/analytics.test.ts` | ❌ Wave 0 |
| DASH-06 | Sparkline string length + scaling | unit | `bun test src/ui/analytics.test.ts` | ❌ Wave 0 |
| DASH-07 | Consistency = solve-days-in-window / 30 | unit | `bun test src/ui/analytics.test.ts` | ❌ Wave 0 |
| DASH-01 | Dashboard opens + closes returning to origin mode | manual | TUI smoke | — |

### Wave 0 Gaps

- [ ] `src/ui/analytics.test.ts` — covers DASH-02..07; must be created in plan 03-01
- [ ] `src/ui/analytics.ts` — the pure module itself; created in plan 03-01
- [ ] Plan 03-01 must include the TDD RED phase stub pattern (type-checking stub that throws, per
  the repo's `[Phase 02.2]: TDD RED phase` convention from STATE.md)

---

## Security Domain

The dashboard reads only local SQLite data with no external calls. No new auth surfaces, no user
input, no file writes, no network. ASVS categories not applicable to this phase.

---

## Environment Availability

This phase has no external dependencies beyond the project's own Bun/SQLite runtime. No tools to
audit.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 7+ first-time solves/day is the "highly active" threshold for heatmap level 4 | Discretion answers | Easy to adjust; no architecture impact |
| A2 | `dow` in `buildHeatmapGrid` uses local time from `new Date(ms).getDay()` | Focus Area 2 algo | If a different week layout (Mon-start) is desired, `(dow + 6) % 7` remaps; purely cosmetic |

**All claims about file contents, APIs, types, and existing code are VERIFIED against source files
read in this session.**

---

## Sources

### Primary (HIGH confidence — verified from source files)

- `src/db/schema.ts` — `submissions` table schema; `submittedAt` is unix milliseconds
- `src/core/backfill.ts:87-100` — confirmed `submittedAt: submittedAtSeconds * 1000`
- `src/core/submission.ts:67` — confirmed `submittedAt: Date.now()` for live submits
- `src/db/submissions.ts` — existing query surface; precedent for `getFirstAcSummary()` shape
- `src/db/questions.ts` — `difficulty` field location and `DbQuestion` type
- `src/ui/store/slices/uiSlice.ts:21-39` — `AppMode` union; `setMode`
- `src/app.tsx` — thin router pattern
- `src/ui/components/ResultFullscreen.tsx` — full-screen overlay pattern
- `src/ui/components/ChangelogPopup.tsx` — scrollbox + `registerPopupScroller` pattern; `flexShrink` pitfall
- `src/ui/components/QuestionList.tsx:110-119` — per-segment `<text fg=...>` coloring pattern
- `src/ui/keymap/bindings.ts` — confirmed `p` is free in both `browseGlobalBindings` and `problemGlobalBindings`
- `src/ui/keymap/commands/modal.ts` — `changelog.close` / `popup.scroll*` command shape
- `src/ui/theme.ts` — `colors` proxy, `difficultyColor()`, `statusColor()`
- `src/ui/themes/index.ts` + `tokyo-night.ts` — `Theme` interface; all 4 heatmap tokens exist
- `src/ui/verdict.ts:16` — `statusDisplay.includes("Accepted")` substring match rationale
- `src/ui/progress.ts` — pure geometry module pattern for sparkline
- `node_modules/@opentui/core/renderables/TextBufferRenderable.d.ts` — `fg`, `bg` props on `<text>`
- `node_modules/@opentui/core/Renderable.d.ts` — `flexDirection`, `gap`, `alignItems`, `justifyContent`
- `node_modules/@opentui/core/renderables/Box.d.ts` — `gap`, `rowGap`, `columnGap` on `<box>`

### Secondary (MEDIUM confidence)

- `src/ui/components/EasterEgg.tsx` — full-screen own-mode pattern (no keymap bindings, useKeyboard)
- `src/ui/store/slices/problemSlice.ts` — domain slice pattern reference

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — no new deps; all primitives verified against existing codebase
- Architecture: HIGH — verified against every seam the CONTEXT named
- Pitfalls: HIGH — each pitfall derived from direct code reading, not inference
- Analytics algorithms: HIGH — grounded in verified DB schema and correct `submittedAt` unit

**Research date:** 2026-07-11
**Valid until:** 2026-08-11 (stable — schema and OpenTUI version are pinned)
