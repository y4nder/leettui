# Architecture Research

**Domain:** Submission history + analytics integration into leettui (brownfield TUI)
**Researched:** 2026-06-26
**Confidence:** HIGH — all decisions are derived directly from the existing codebase (no API speculation needed; patterns are extracted from `src/db/`, `src/core/git.ts`, `src/ui/store/slices/`, `src/views/`, and the full layer graph).

---

## Standard Architecture

leettui's layer graph is fixed and must not be redesigned. The new feature slots into it:

```
┌──────────────────────────────────────────────────────────────────┐
│ UI layer (React + OpenTUI)                                        │
│   DashboardView  ·  HistoryPanel (in ProblemView)                │
│   submissionsSlice (domain)  ·  uiSlice additions (mode/progress)│
│   BackfillProgressBar  ·  dashboard commands + bindings          │
└───────────────────┬──────────────────────────────────────────────┘
                    │ keymap dispatch
┌───────────────────▼──────────────────────────────────────────────┐
│ View handler layer  (async orchestrators, outside React)          │
│   src/views/dashboard/handlers.ts                                 │
│     handleOpenDashboard · handleBackfill · handleBackfillCancel  │
│   src/views/problem/handlers.ts  (existing, extended)            │
│     handleEnterProblemView  ←  also loads problem submissions    │
└───────────────────┬──────────────────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────────────────┐
│ Core business logic  src/core/                                    │
│   historyBackfill.ts  (NEW — never-throws, resumable service)    │
│   submission.ts  (EXTENDED — upsert after submit/run)            │
└────────────┬──────────────────────┬─────────────────────────────┘
             │                      │
┌────────────▼──────┐   ┌───────────▼─────────────────────────────┐
│ src/api/          │   │ src/db/                                   │
│   queries/        │   │   schema.ts  (submissions table +        │
│   submission-     │   │              submissionsFetchedAt column) │
│   list.ts  (NEW)  │   │   submissions.ts  (NEW CRUD module)       │
│                   │   │   questions.ts  (EXTENDED)                │
└───────────────────┘   └─────────────────────────────────────────┘
```

---

## 1. Data Layer

### 1a. New `submissions` table

Add to `src/db/schema.ts`. LeetCode's `submissionId` is the natural PK — it makes upserts idempotent, so re-running backfill over an already-fetched range is safe.

```typescript
export const submissions = sqliteTable(
  "submissions",
  {
    id:                 integer("id").primaryKey(),           // LeetCode submissionId
    questionId:         integer("question_id").notNull()
                          .references(() => questions.id),
    status:             text("status").notNull(),             // "ac", "wrong_answer", etc.
    langSlug:           text("lang_slug").notNull(),
    runtime:            text("runtime"),                      // "X ms" or null
    memory:             text("memory"),                       // "X MB" or null
    runtimePercentile:  real("runtime_percentile"),           // 0–100, nullable
    submittedAt:        integer("submitted_at").notNull(),    // epoch ms from LeetCode
  },
  (t) => [
    index("idx_sub_question").on(t.questionId),
    index("idx_sub_submitted_at").on(t.submittedAt),
  ],
);
```

Indexes: `idx_sub_question` backs per-problem history reads and aggregate queries; `idx_sub_submitted_at` backs the streak/trend queries (time-range scans).

### 1b. Backfill cursor: `submissionsFetchedAt` on the `questions` table

Rather than a separate `backfill_state` table, add one nullable column to `questions`:

```typescript
// In the existing questions table definition:
submissionsFetchedAt: integer("submissions_fetched_at"),  // epoch ms, null = never fetched
```

This distributes the cursor across question rows. The backfill service queries `WHERE submissions_fetched_at IS NULL LIMIT batchSize` to find un-fetched questions, and writes `submissionsFetchedAt = Date.now()` after each. Interrupting and resuming picks up exactly where it stopped — no separate state table, no risk of the cursor drifting out of sync with the data.

### 1c. Migration workflow

Follow `src/db/CLAUDE.md` exactly:
1. Edit `src/db/schema.ts` (add `submissions` table + `submissionsFetchedAt` column).
2. `bun run db:generate` → generates `drizzle/00NN_submissions.sql`.
3. Embed in `src/db/migrations.ts`: add static import + `SQL_BY_TAG` entry. This step is non-negotiable — the shipped binary cannot read `drizzle/` from disk.

### 1d. CRUD module: `src/db/submissions.ts`

Mirror `src/db/recents.ts` exactly: typed interface, `toDbSubmission` mapper at the boundary (Drizzle camelCase → snake_case `DbSubmission`), named CRUD functions.

```typescript
export interface DbSubmission {
  id: number;
  question_id: number;
  status: string;
  lang_slug: string;
  runtime: string | null;
  memory: string | null;
  runtime_percentile: number | null;
  submitted_at: number;
}

// Idempotent upsert — safe to call on re-backfill.
// onConflictDoUpdate ensures runtime_percentile can be enriched in a later pass.
export function upsertSubmission(sub: DbSubmission): void

// Per-problem history panel: newest first.
export function getSubmissionsForQuestion(questionId: number): DbSubmission[]

// Dashboard: accepted submissions in a time range (streak + trend).
export function getAcceptedSubmissionsInRange(fromMs: number, toMs: number): DbSubmission[]

// Dashboard: breakdown by difficulty (joined to questions table).
export interface DifficultyBreakdown { Easy: number; Medium: number; Hard: number }
export function getAcceptedCountByDifficulty(): DifficultyBreakdown

// Dashboard: breakdown by topic (joined to question_topics).
export function getAcceptedCountByTopic(): Record<string, number>

// Dashboard: daily solve counts for trend (last N days, UTC day boundaries).
export interface DailySolve { date: string; count: number }
export function getDailySolves(days: number): DailySolve[]
```

All of these are sync DB reads on the local SQLite singleton — no async needed.

### 1e. Relation to existing `questions` table

`questions.status` / `last_runtime` / `last_memory` remain as denormalized "latest known" fields, unchanged. `submissions` is the append-only source of truth for history. The `setSubmissionStats` call in `core/submission.ts` still writes `last_runtime`/`last_memory` — that path is unchanged; the new code only adds a parallel `upsertSubmission` call alongside it.

The FK `submissions.question_id → questions.id` ensures referential integrity. The dashboard aggregate queries join `submissions` to `questions` (for difficulty) and `question_topics` (for topic breakdown).

---

## 2. API Query

### `src/api/queries/submission-list.ts`

New GraphQL query for per-problem submission history. LeetCode's `submissionList` query takes `questionSlug`, `offset`, `limit` and returns a paginated list.

```typescript
export interface RawSubmission {
  id: string;          // LeetCode's numeric ID as a string
  statusDisplay: string;
  lang: string;        // langSlug
  runtime: string;
  memory: string;
  timestamp: string;   // epoch seconds as a string
}

export interface SubmissionListResponse {
  submissionList: {
    lastKey: string | null;  // cursor for next page; null = last page
    hasNext: boolean;
    submissions: RawSubmission[];
  };
}

export async function fetchSubmissionList(
  questionSlug: string,
  offset: number,
  limit: number,
): Promise<SubmissionListResponse>
```

No GraphQL LRU cache here (unlike `question-content` and `editor-data`), because backfill pages are fetched once and stored — caching would waste memory for data that will never be re-requested from cache.

For `runtimePercentile`: LeetCode's `submissionDetails(submissionId)` returns percentile for accepted submissions. This is a separate, more expensive call — one per submission. It is deferred to a later enrichment pass (not included in the backfill's first phase). The `runtime_percentile` column is nullable precisely to allow progressive enrichment.

---

## 3. Backfill Service

### `src/core/historyBackfill.ts`

Mirror `src/core/git.ts` exactly: `Bun.spawn`-free (pure API calls), discriminated result object, never throws, all errors caught internally.

```typescript
export type BackfillFailReason = "no-client" | "auth-error" | "api-error" | "rate-limited";

export type BackfillResult =
  | { ok: true; fetched: number; alreadyDone: number; remaining: number }
  | { ok: false; reason: BackfillFailReason; message: string };

// Fetches one batch of questions (batchSize, default 10) and their submission
// history. Returns immediately when no unfetched questions remain.
// Progress callback fires after each question is processed — drives the UI bar.
export async function backfillHistoryBatch(
  opts?: {
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<BackfillResult>
```

Internal flow:
1. Query DB: `getUnfetchedQuestions(batchSize)` — questions where `submissions_fetched_at IS NULL`.
2. Get total unfetched count for progress reporting.
3. For each question: call `fetchSubmissionList(slug, 0, 100)` (paginate if `hasNext`), upsert each submission, mark `submissionsFetchedAt = Date.now()`.
4. If any question's fetch fails (network error, 429): return `{ ok: false, reason: "api-error" }` after writing progress for the questions that did succeed. The next call resumes from where it stopped (the failed question is still NULL).

The `"no-client"` reason covers the case where `getClient()` has no session — surfaces a "re-authenticate" hint, never a crash.

This service is **on-demand only** — no background timers, consistent with the "no auto-commit, no background polling" stance in `PROJECT.md`.

---

## 4. Append-on-Submit (Extending `core/submission.ts`)

After a successful submit or run, call `upsertSubmission` with the data already present in `ParsedResponse`. This requires no new API calls — `pollResult` already returns runtime, memory, status, and the submission ID from `/submissions/detail/{id}/check/`.

```typescript
// In submitSolution(), after pollResult:
upsertSubmission({
  id: Number(submitResponse.submission_id),
  question_id: question.id,
  status: result.type === "submit_accepted" ? "ac" : "wrong_answer",  // map from result.type
  lang_slug: langSlug,
  runtime: result.data?.status_runtime ?? null,
  memory: result.data?.status_memory ?? null,
  runtime_percentile: result.data?.runtime_percentile ?? null,  // present for accepted
  submitted_at: Date.now(),
});
```

This is a synchronous DB write inside an async function — consistent with how `markAccepted` and `setSubmissionStats` are called today.

---

## 5. State Layer

### 5a. New domain slice: `src/ui/store/slices/submissionsSlice.ts`

```typescript
// type: domain
// Owns submission data sourced from the DB: per-problem history and dashboard
// aggregates. Never imports UI state. UI slices may call these actions.

export interface DashboardStats {
  solveStreak: number;             // current streak in days
  weekCount: number;               // accepted in last 7 days
  monthCount: number;              // accepted in last 30 days
  byDifficulty: DifficultyBreakdown;
  byTopic: Record<string, number>;
  dailySolves: DailySolve[];       // last 90 days for the trend chart
}

export interface SubmissionsSlice {
  problemSubmissions: DbSubmission[];   // for the per-problem history panel
  dashboardStats: DashboardStats | null;

  loadProblemSubmissions: (questionId: number) => void;
  loadDashboardStats: () => void;
  clearProblemSubmissions: () => void;
}
```

`loadProblemSubmissions` is called by the `handleEnterProblemView` handler (after entering ProblemView) — the same place that records a `recents` entry. `loadDashboardStats` is called by `handleOpenDashboard`. Both are synchronous DB reads wrapped in a `set()` call, following `questionsSlice.init()`.

Streak calculation is a pure function over `dailySolves` — it does not query the DB separately. It lives either in the slice or in a `src/core/analytics.ts` utility (if it's complex enough to unit-test independently).

### 5b. UI slice additions (in `uiSlice.ts`)

Add `"dashboard"` to `AppMode`:

```typescript
export type AppMode =
  | "browse" | "search" | "popup" | "select" | "result" | "help"
  | "debug" | "palette" | "problem" | "relocate" | "changelog"
  | "recent" | "gitInit" | "gitRemote" | "gitSync" | "easterEgg"
  | "dashboard";   // NEW
```

Add to `UiSlice`:

```typescript
// Ephemeral backfill progress, shown in a bottom bar during backfill.
// Null when no backfill is in flight. Pattern mirrors syncSlice.syncProgress.
backfillProgress: BackfillProgress | null;

showDashboard: () => void;  // set({ mode: "dashboard" })
hideDashboard: () => void;  // set({ mode: "browse" })
setBackfillProgress: (p: BackfillProgress | null) => void;
```

```typescript
export interface BackfillProgress {
  done: number;
  total: number;
  phase: "fetching" | "done" | "error";
  message?: string;
}
```

This is exactly how `syncSlice` handles sync progress — a nullable progress object, cleared when the operation ends. No separate slice needed.

### 5c. ProblemView: add `"history"` panel

Extend `ProblemPanel` in `src/ui/store/slices/problemSlice.ts`:

```typescript
export type ProblemPanel = "description" | "solutions" | "result" | "related" | "history";

export const PROBLEM_PANEL_ORDER: ProblemPanel[] = [
  "description", "solutions", "result", "related", "history",
];
```

Add `focusedHistoryIndex: number` to `ProblemViewState`. Add `moveFocusedHistory(delta)` action. Update `PROBLEM_PANEL_NEIGHBORS` to connect `related ↔ history` (down from related, up from history) and `description → history` (right from description reaches history last, or spatial nav goes there via down from related).

Add `historyPanelBindings` to `src/ui/keymap/bindings.ts` — mounted only when `problem.focusedPanel === "history"`.

---

## 6. UI Layer

### 6a. Dashboard: new top-level view (not an overlay)

**Decision: new top-level view routed by `mode === "dashboard"` in `app.tsx`.**

Rationale: the recents modal, changelog popup, and daily-challenge popup are all thin overlays — a list or a block of text, dismissed in seconds. The dashboard has multiple distinct sections (streak, week/month counts, trend chart, difficulty breakdown, topic breakdown), each needing its own layout area. That content warrants full-screen real-estate and panel navigation (like BrowseView/ProblemView), not the popup idiom. The `app.tsx` router is already set up for this — adding one more `mode` condition costs a single line.

```typescript
// src/app.tsx (thin router, existing pattern)
if (mode === "problem") return <ProblemView />;
if (mode === "dashboard") return <DashboardView />;  // NEW
return <BrowseView />;
```

New files:
- `src/views/dashboard/DashboardView.tsx` — full-screen layout (streak + counts header; trend body; two-column difficulty + topic breakdown footer). Uses the same `themeVersion` subscribe pattern.
- `src/views/dashboard/handlers.ts` — `handleOpenDashboard()` (loads stats, sets mode), `handleStartBackfill()` (runs `backfillHistoryBatch`, pipes progress to `setBackfillProgress`), `handleExitDashboard()`.
- `src/ui/keymap/commands/dashboard.ts` — dashboard command catalog: `dashboard.open`, `dashboard.exit`, `dashboard.backfill`, `dashboard.backfillCancel`. Added to `src/ui/keymap/commands/index.ts`.

Entry point: `p` in browse mode (free keybinding — no existing command uses it in browse) mapped to `dashboard.open`. Also available from the command palette.

### 6b. Per-problem history panel: `src/ui/components/HistoryPanel.tsx`

New focusable panel in ProblemView's right column, below Related. Shows submissions for the current question (from `submissionsSlice.problemSubmissions`) in newest-first order: status icon, language, runtime, memory, relative timestamp.

Pattern mirrors `RelatedPanel.tsx` exactly:
- Scrolled window (fixed row height, `maxRows` cap computed from available height)
- `flexShrink: 0` — the fixed row count does not shrink; Result absorbs slack
- `j/k` move `focusedHistoryIndex` (clamped) via `historyPanelBindings`, mounted only when focused
- Focused row highlight with `backgroundColor`
- Empty state: "No submissions yet — press `b` to backfill" (contextual action hint)

### 6c. Backfill progress bar

Reuse the existing `ProgressBar` component (the one already used for manual re-sync) — it already handles the `{ done, total }` shape and animates both determinate and indeterminate phases. Mount it at the bottom of `DashboardView` (or as a global overlay in BrowseView/ProblemView if backfill runs while navigating). Wire it to `uiSlice.backfillProgress`.

### 6d. Keymap wiring

Following existing conventions:

- Add `dashboardBindings` in `src/ui/keymap/bindings.ts` — mounted by `DashboardView` via `useBindings`.
- `dashboard.ts` commands file mirrors `src/ui/keymap/commands/system.ts` in structure.
- The `p` → `dashboard.open` binding goes into `browseGlobalBindings`.
- `Esc` / `q` → `dashboard.exit`, added to `dashboardBindings`.
- `b` → `dashboard.backfill` (mnemonic: backfill), in `dashboardBindings`.
- The `historyPanelBindings` are mounted by `HistoryPanel` in ProblemView (per-panel mount, same as `solutionsPanelBindings` and `relatedPanelBindings`).

---

## 7. Component Boundaries

| Component | File | Responsibility | Communicates With |
|-----------|------|---------------|-------------------|
| `submissions` table | `src/db/schema.ts` | SQLite schema: append-only submission log | Drizzle migrations |
| `submissions.ts` | `src/db/submissions.ts` | CRUD: upsert, reads, aggregate queries | `schema.ts`, `getDb()` |
| `submission-list.ts` | `src/api/queries/` | GraphQL: per-problem submission history | `api/graphql.ts`, `client.ts` |
| `historyBackfill.ts` | `src/core/` | Never-throws backfill service; resumable | `db/submissions.ts`, `api/queries/submission-list.ts` |
| `submission.ts` (extended) | `src/core/` | Append new submissions after run/submit | `db/submissions.ts` (added), existing deps |
| `submissionsSlice.ts` | `src/ui/store/slices/` | Domain state: per-problem submissions, dashboard stats | `db/submissions.ts` |
| `uiSlice.ts` (extended) | `src/ui/store/slices/` | `AppMode` + `backfillProgress` | no new deps |
| `problemSlice.ts` (extended) | `src/ui/store/slices/` | `ProblemPanel` + `focusedHistoryIndex` | no new deps |
| `HistoryPanel.tsx` | `src/ui/components/` | Per-problem submission history panel | `submissionsSlice` |
| `DashboardView.tsx` | `src/views/dashboard/` | Full-screen dashboard layout | `submissionsSlice`, `uiSlice`, `dashboard/handlers.ts` |
| `dashboard/handlers.ts` | `src/views/dashboard/` | Async orchestrators: open/exit/backfill | `historyBackfill.ts`, `submissionsSlice`, `uiSlice` |
| `dashboard.ts` (commands) | `src/ui/keymap/commands/` | Dashboard command catalog | `dashboard/handlers.ts` |
| `app.tsx` (extended) | `src/` | Route `mode === "dashboard"` to `DashboardView` | `DashboardView.tsx` |

---

## 8. Data Flow

### Backfill flow

```
User presses `b` in DashboardView
    ↓
dashboardBindings → dashboard.backfill command
    ↓
handleStartBackfill() in src/views/dashboard/handlers.ts
    ↓
setBackfillProgress({ done: 0, total: N, phase: "fetching" })  [uiSlice]
    ↓
backfillHistoryBatch({ onProgress }) in src/core/historyBackfill.ts
    ↓  (per-question loop)
fetchSubmissionList(slug, offset, limit)  [api/queries/submission-list.ts]
    ↓
upsertSubmission(sub)  [db/submissions.ts]
markSubmissionsFetched(questionId)  [db/questions.ts — sets submissionsFetchedAt]
    ↓
onProgress callback → setBackfillProgress({ done: N, ... })  [uiSlice]
    ↓  (loop done or interrupted)
BackfillResult → setBackfillProgress({ phase: "done" | "error" })  [uiSlice]
loadDashboardStats()  [submissionsSlice — refresh dashboard]
```

### Per-problem history load flow

```
User presses Enter on a question in BrowseView
    ↓
handleEnterProblemView(question) in src/views/browse/handlers/solve.ts
    ↓ (existing: fetch description, record recent, set mode)
loadProblemSubmissions(question.id)  [submissionsSlice — NEW addition to this handler]
    ↓
getSubmissionsForQuestion(id) in src/db/submissions.ts
    ↓
submissionsSlice.problemSubmissions ← DB rows (sync)
    ↓
ProblemView renders → HistoryPanel reads problemSubmissions from store
```

### Dashboard open flow

```
User presses `p` in BrowseView
    ↓
browseGlobalBindings → dashboard.open command
    ↓
handleOpenDashboard() in src/views/dashboard/handlers.ts
    ↓
loadDashboardStats()  [submissionsSlice]
    ↓
getDailySolves / getAcceptedCountByDifficulty / getAcceptedCountByTopic
                             in src/db/submissions.ts  (sync DB reads)
    ↓
submissionsSlice.dashboardStats ← computed stats
showDashboard()  [uiSlice — sets mode = "dashboard"]
    ↓
app.tsx routes to DashboardView, which reads dashboardStats from submissionsSlice
```

### Append-on-submit flow

```
User presses `s` (submit) in ProblemView
    ↓ (existing path, unchanged)
handleProblemSubmit → submitSolution(question, langSlug) in src/core/submission.ts
    ↓
pollResult → ParsedResponse
    ↓ (existing)
markAccepted / setSubmissionStats  [db/questions.ts]
    ↓ (NEW — parallel DB write, same sync-inside-async pattern)
upsertSubmission({ id, questionId, status, langSlug, ... })  [db/submissions.ts]
```

---

## 9. Build Order (Dependency-Driven)

This ordering ensures each phase has its dependencies in place before it begins. No phase needs something built in a later phase.

**Phase 1 — Data foundation (schema + CRUD)**
- `src/db/schema.ts`: add `submissions` table + `submissionsFetchedAt` on `questions`
- `bun run db:generate` → new migration
- `src/db/migrations.ts`: embed the new migration (mandatory for compiled binary)
- `src/db/submissions.ts`: CRUD module
- `src/db/questions.ts`: add `markSubmissionsFetched(id)` + `getUnfetchedQuestions(limit)` helpers

**Phase 2 — API query**
- `src/api/queries/submission-list.ts`: `fetchSubmissionList(questionSlug, offset, limit)`

**Phase 3 — Backfill service + append-on-submit**
- `src/core/historyBackfill.ts`: never-throws resumable batch service (depends on Phase 1 + 2)
- `src/core/submission.ts`: extend `submitSolution` to call `upsertSubmission` (depends on Phase 1)

**Phase 4 — Domain slice**
- `src/ui/store/slices/submissionsSlice.ts`: `problemSubmissions` + `dashboardStats` + actions (depends on Phase 1)
- `src/ui/store/index.ts`: register new slice
- `src/ui/store/slices/uiSlice.ts`: add `"dashboard"` to `AppMode`, add `backfillProgress` + actions
- `src/ui/store/slices/problemSlice.ts`: add `"history"` to `ProblemPanel`, `focusedHistoryIndex`, `moveFocusedHistory`

**Phase 5 — Per-problem history panel**
- `src/ui/components/HistoryPanel.tsx`: panel component (depends on Phase 4)
- `src/ui/keymap/bindings.ts`: add `historyPanelBindings`
- `src/views/problem/handlers.ts`: extend `handleEnterProblemView` to call `loadProblemSubmissions`
- `src/views/problem/ProblemView.tsx`: mount `HistoryPanel` in the right column, update `PROBLEM_PANEL_NEIGHBORS`

**Phase 6 — Dashboard view**
- `src/ui/keymap/commands/dashboard.ts`: command catalog (depends on Phase 4 + 3)
- `src/ui/keymap/commands/index.ts`: register dashboard commands
- `src/ui/keymap/bindings.ts`: add `dashboardBindings`, add `p` to `browseGlobalBindings`
- `src/views/dashboard/handlers.ts`: `handleOpenDashboard`, `handleStartBackfill`, `handleExitDashboard`
- `src/views/dashboard/DashboardView.tsx`: full-screen layout
- `src/app.tsx`: add `if (mode === "dashboard") return <DashboardView />`

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: New popup/overlay for the dashboard

**What people do:** Route the dashboard through `showPopup` or as a new modal component (like `RecentPopup` or `ChangelogPopup`).

**Why it's wrong:** The popup idiom is for thin, transient content (a list, a text block) dismissed in seconds. The dashboard has multiple layout sections, needs its own scroll + panel focus, and is a deliberate navigation destination. An overlay can't absorb that without fighting the pattern — you'd end up reimplementing `BrowseView`'s layout inside a modal.

**Do this instead:** New top-level view routed by `mode === "dashboard"` in `app.tsx`. Costs one line in the router.

### Anti-Pattern 2: Domain data in uiSlice

**What people do:** Add `problemSubmissions` or `dashboardStats` to `uiSlice.ts` for convenience (it already holds many things).

**Why it's wrong:** The UI/domain split is the project's core architectural invariant. `uiSlice` is tagged `// type: ui` — it owns cursors, modes, and ephemeral display state. Data sourced from the DB is domain data. Mixing them makes it impossible to reason about which parts of state are DB-derived vs. purely ephemeral.

**Do this instead:** New `submissionsSlice.ts` tagged `// type: domain`. `uiSlice` only gets the ephemeral `backfillProgress` (a transient operation-progress field, parallel to `syncSlice.syncProgress`).

### Anti-Pattern 3: Separate backfill cursor table

**What people do:** Add a dedicated `backfill_state(key TEXT PK, cursor TEXT, updatedAt INTEGER)` table to track which questions have been fetched.

**Why it's wrong:** It adds schema complexity for data already naturally representable as a nullable column on the `questions` table. A separate state table can drift out of sync with the actual data (a question's submissions inserted but the cursor not updated on crash). A column on `questions` is atomic — the write that marks a question "fetched" can be in the same SQLite transaction as the submission upserts, making it impossible to have submitted data without the cursor reflecting it.

**Do this instead:** `submissionsFetchedAt INTEGER` column on `questions`, nullable. The backfill service sets this within the same transaction as the submission inserts for each question.

### Anti-Pattern 4: Fetching runtimePercentile for every submission in backfill

**What people do:** Call `submissionDetails(submissionId)` for each submission to get `runtimePercentile` during the initial backfill pass.

**Why it's wrong:** `submissionDetails` is a separate GraphQL call per submission. A user with 500 accepted submissions would trigger 500 API calls in one backfill run, dramatically increasing rate-limit exposure and backfill time.

**Do this instead:** Store `runtime_percentile` as nullable and leave it null in the initial backfill. The `pollResult` path already returns percentile for newly-submitted solutions (it's in the check response for accepted submissions). A later enrichment pass (separate milestone or optional command) can fill in percentile for historical submissions.

### Anti-Pattern 5: Background sync timer

**What people do:** Add a recurring timer that polls LeetCode for new submissions and backfills in the background while the TUI is running.

**Why it's wrong:** The project explicitly prohibits background timers (`PROJECT.md` out-of-scope: "Real-time/streaming submission sync or background polling — backfill is on-demand"). A background timer would also compete with the user's active API calls (run/submit) for rate-limit budget.

**Do this instead:** On-demand backfill triggered explicitly by the user (the `b` command in the dashboard). After the initial backfill, `core/submission.ts`'s `upsertSubmission` keeps the DB current for new submissions made through leettui.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `core/historyBackfill.ts` ↔ `api/queries/submission-list.ts` | Direct function call (no caching) | Each question's submissions are fetched once; no LRU cache needed |
| `core/historyBackfill.ts` ↔ `db/submissions.ts` | Direct sync DB call | In-process SQLite; the upsert + markFetched pair should be in the same transaction |
| `views/dashboard/handlers.ts` ↔ `core/historyBackfill.ts` | Async call with progress callback | Handler drives the progress bar via `setBackfillProgress` |
| `submissionsSlice` ↔ `db/submissions.ts` | Sync DB reads inside Zustand `set()` | Follows `questionsSlice` → `db/questions.ts` pattern exactly |
| `views/problem/handlers.ts` ↔ `submissionsSlice` | Store action call | `loadProblemSubmissions(id)` added alongside existing `recordRecent` in `handleEnterProblemView` |

---

## Sources

- `src/db/schema.ts`, `src/db/recents.ts`, `src/db/questions.ts` — DB schema and CRUD patterns (direct codebase read)
- `src/core/git.ts` — never-throws result-object service pattern (direct codebase read)
- `src/ui/store/slices/questionsSlice.ts`, `problemSlice.ts`, `uiSlice.ts` — slice conventions (direct codebase read)
- `src/ui/components/RelatedPanel.tsx`, `SolutionsPanel.tsx` — focusable panel conventions (CLAUDE.md + direct)
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md` — extracted architecture rules
- `.planning/PROJECT.md` — constraints (offline-first, never-crash, no background timers)

---

*Architecture research for: leettui submission history + analytics milestone*
*Researched: 2026-06-26*
