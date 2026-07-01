# Phase 1: Submission Store & Backfill — Research

**Researched:** 2026-06-26
**Domain:** SQLite/Drizzle schema extension + unofficial LeetCode GraphQL backfill service + append-on-submit + TUI progress wiring
**Confidence:** MEDIUM (codebase patterns HIGH; LeetCode API shape LOW — validate in live spike plan 01-02)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Backfill is reachable two ways: (a) a command-palette action (always available, the canonical on-demand entry), and (b) a one-time first-run nudge that fires once on the first launch after this update lands, offering to run the backfill now.
- **D-02:** The first-run nudge reuses the existing version-change / changelog detection mechanism (Stage 18 "What's new" pattern). It fires once and only once — never re-prompts. Fresh install with no history is the natural trigger; seeded "caught up" on dismiss so it cannot double-fire.
- **D-03:** Rejected: BootFlow onboarding step right after auth.
- **D-04:** Progress is non-blocking — a `syncSlice`-style progress bar while the user keeps browsing; never freezes the render loop (DATA-07).
- **D-05:** Backfill is cancelable mid-run via an explicit action (e.g. Esc / cancel command). Cancel preserves all partial data already written.
- **D-06:** After the initial full import, re-running backfill is an incremental top-up: fetches only submissions newer than the persisted cursor, stops early once it reaches already-seen data.
- **D-07:** Two distinct cursor concerns: (a) resume cursor for an interrupted in-progress run (resume from last page/offset so no rows are missed), (b) high-water mark for a completed import (so next run is a top-up). `submissionsFetchedAt` on `questions` is the persisted anchor; research/planner decide whether one field carries both roles or two are needed. Idempotent upsert (`onConflictDoNothing` on `submissionId` PK) is the safety net regardless.
- **D-08:** Store all submissions — every attempt regardless of verdict (AC / WA / TLE / CE / RE / MLE), each with its status. This is the superset every later phase reads.

### Claude's Discretion (deferred to research/planner)

- The configurable inter-page delay default and the 429 backoff curve — to be validated by the live rate-limit spike scheduled in plan 01-02 before locking.
- The exact failure-hint presentation (transient line vs. inline in the progress bar) — must be a clean, never-crash hint per DATA-05, but the surface is an implementation detail.
- The exact cancel keybinding and palette command titles.

### Deferred Ideas (OUT OF SCOPE)

- Explicit "full re-import / rebuild" command (force a complete rescan).
- Per-submission percentile enrichment for historical rows via `submissionDetails` call (v2 PERF-01).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | `submissions` table via versioned Drizzle migration, keyed by `submissionId` PK, in existing `questions.db` | Schema design in §Standard Stack; migration mechanics in §Architecture Patterns |
| DATA-02 | Paginated `submissionList` backfill — status, language, runtime, memory, timestamp per attempt | GraphQL query shape in §Architecture Patterns; field mapping in §Code Examples |
| DATA-03 | Resumable, idempotent backfill — no duplicate rows, resumes on interruption | Cursor model and `onConflictDoNothing` pattern in §Architecture Patterns |
| DATA-04 | Polite to the unofficial API — configurable inter-page delay + 429 backoff, on-demand only | Rate-limit findings in §Common Pitfalls; seed defaults in §Architecture Patterns |
| DATA-05 | Never-crashes — auth/API/rate-limit/network failure surfaces clean hint, preserves partial data | Never-throws result-union pattern in §Architecture Patterns; mirrors `core/git.ts` |
| DATA-06 | New submissions append automatically — captures runtime/memory percentile from `CheckResponse` | Append-on-submit hook in §Architecture Patterns; CheckResponse field mapping in §Code Examples |
| DATA-07 | Non-blocking in-TUI progress via `syncSlice` Zustand pattern | SyncSlice reuse pattern in §Architecture Patterns; backfill handler wiring in §Code Examples |
</phase_requirements>

---

## Summary

Phase 1 is a brownfield data-layer extension. The codebase is healthy and well-patterned; every component this phase needs has a direct existing analog to mirror. The `submissions` table is a new Drizzle-managed table in the same `questions.db`, installed via an embedded migration following the exact two-step workflow established by `0001_even_proudstar.sql` / `migrations.ts`. The backfill service mirrors `core/sync.ts` structurally (paginated fetch → batch SQLite writes → `onProgress` callback) but adds resumability, cancellation, and never-throws semantics from `core/git.ts`. The progress bar wires into the existing `syncSlice` (a UI slice with `setSyncProgress`/`clearSyncProgress`). Append-on-submit is a single call added at the end of `core/submission.ts`'s `submitSolution()` after `pollResult()` resolves.

The one area with genuinely low confidence is the LeetCode `submissionList` GraphQL API shape — it is unofficial, undocumented, and reverse-engineered from community libraries. The field names and pagination model documented below are cross-checked from the `JacobLinCool/LeetCode-Query` TypeScript library source, which is the most rigorous community implementation available. All claims tagged `[ASSUMED]` in the API shape section must be validated against the live API in the plan 01-02 spike before the service is committed.

**Primary recommendation:** Follow the per-question backfill strategy (fetch `submissionList(questionSlug)` for each question the user has attempted), using `submissionsFetchedAt` on `questions` as both the resume cursor and the high-water mark. This approach requires at most as many API calls as the user's number of attempted questions, avoids the "global feed" ambiguity, and makes the per-question cursor semantics (D-07) natural. The live spike (plan 01-02) must validate actual rate-limit behavior before the delay default is locked.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `submissions` schema + migration | DB (Drizzle/bun:sqlite) | — | Data definition lives at the DB tier; no UI involvement |
| Backfill pagination + write | Core (`core/backfill.ts`) | API (`api/queries/`) | Business orchestration in core; transport in api tier |
| Append-on-submit write | Core (`core/submission.ts`) | DB | Submit service already owns this seam; trivial addition |
| Backfill progress display | UI (`syncSlice` + `ProgressBar`) | Core (via callback) | Ephemeral UI state owns the display; core triggers via callback |
| Cancel signal | UI (keymap command) → Core | — | Command fires cancel via store action → service respects it |
| First-run nudge | UI (`BootFlow` + new nudge component) | Core (`session.ts`) | Mirrors ChangelogPopup / `shouldShowChangelog` seam |
| Backfill palette trigger | UI (keymap `commands/system.ts`) | View handler | Follows the `git.openUi` / `sync.db` command pattern |

---

## Standard Stack

No new npm packages are introduced by this phase. Every capability is implemented using libraries already in the lockfile.

### Core (already installed)

| Library | Version (pinned) | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| `drizzle-orm` | 0.44.4 | Schema, query builder, migration runner | Existing ORM; pinned with drizzle-kit 0.31.x — do NOT bump without bumping both |
| `bun:sqlite` | Bun built-in | SQLite driver | Required by OpenTUI/Bun runtime |
| `zustand` | existing | State slices for backfill progress | Already powers `syncSlice` |

### No New Packages

This phase installs zero new dependencies. Avoid introducing any package not already in `bun.lock`. The `submissionList` query is hand-written in `src/api/queries/` following the existing pattern (`problemset-question-list.ts`). Do not import `leetcode-query` or any community LeetCode API library — that would be a runtime dependency on a third-party library that reverse-engineers the same unofficial API we already call.

---

## Package Legitimacy Audit

No external packages are introduced by this phase.

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User action                                         DB / session
  │                                                      │
  ├─ Ctrl+P → "Import submission history"                │
  │    → backfill.trigger command                        │
  │         → handleStartBackfill (view handler)         │
  │              → setSyncProgress(0, estimated)    ──→ syncSlice (UI)
  │              → backfillSubmissions(onProgress,  │
  │                  cancelRef)                          │
  │                   └─ per attempted question:         │
  │                        ├─ fetchSubmissionList(slug)  │
  │                        │    ← submissionList GQL     │
  │                        │      (api/queries/)         │
  │                        ├─ insertSubmissions(rows)    │
  │                        │    ← onConflictDoNothing    │
  │                        │    → questions.db           │──→ submissions table
  │                        ├─ setSubmissionsFetchedAt(qId) ──→ questions.submissions_fetched_at
  │                        ├─ onProgress(++done, total)
  │                        │    → setSyncProgress(done, total)
  │                        └─ if cancelRef.cancelled → break
  │                   └─ return BackfillResult (never throws)
  │              → clearSyncProgress()
  │
  ├─ User submits (R / s key)
  │    → handlers.ts → submitSolution()
  │         → pollResult() → ParsedResponse
  │         → insertSubmissionFromCheckResponse() ──────→ submissions table
  │
  └─ Boot (first launch after this update)
       → BootFlow loading phase
            → if !session.backfillNudgeShown: showBackfillNudge()
            → setBackfillNudgeShown(true)  ──────────────→ session.json
```

### Recommended Project Structure

New files only (all mirror existing siblings):

```
src/
├── api/queries/
│   └── submission-list.ts       # fetchSubmissionList(slug, offset, limit)
├── core/
│   └── backfill.ts              # never-throws backfill service (mirrors sync.ts + git.ts)
├── db/
│   └── submissions.ts           # CRUD module (mirrors recents.ts)
└── ui/
    ├── store/slices/
    │   └── backfillSlice.ts     # OR extend syncSlice — see note below
    └── components/
        └── BackfillNudge.tsx    # one-time first-run prompt (mirrors ChangelogPopup)
```

Modified files:
- `src/db/schema.ts` — add `submissions` table + `submissionsFetchedAt` column to `questions`
- `src/db/migrations.ts` — embed new migration SQL
- `src/core/submission.ts` — add `insertSubmissionFromCheckResponse()` call in `submitSolution()`
- `src/ui/keymap/commands/system.ts` — add `submissions.backfill` + `submissions.cancelBackfill` commands
- `src/core/session.ts` — add `backfillNudgeShown?: boolean` to `SessionState`
- `src/ui/components/onboarding/BootFlow.tsx` — wire the first-run nudge

**`syncSlice` vs. `backfillSlice`:** The planner must decide. Reusing `syncSlice.syncProgress` means the backfill shares the same `<ProgressBar>` component and `<SyncStep>` rendering for free. Creating a sibling `backfillSlice.backfillProgress` keeps concerns separate (a manual sync vs. backfill run don't compete). Given both use the same `{current, total}` shape, the simplest path is reuse. Flag for planner to decide.

### Pattern 1: Drizzle Schema Extension (DATA-01)

Mirror `recents` table from `schema.ts`. Three-step mandatory workflow per `src/db/CLAUDE.md`:

1. Edit `src/db/schema.ts` — add `submissions` table and `submissionsFetchedAt` column to `questions`.
2. `bun run db:generate` — drizzle-kit writes `drizzle/NNNN_<name>.sql` and updates `meta/_journal.json`.
3. Embed in `src/db/migrations.ts` — add static `import mNNNN from ...` + `SQL_BY_TAG` entry.

**Step 3 is mandatory** — without it, compiled binaries crash at first launch (`embeddedMigrations()` throws on any journal tag with no `SQL_BY_TAG` entry). Verified by existing `src/db/CLAUDE.md`. [VERIFIED: codebase]

```typescript
// Source: src/db/schema.ts (verified pattern from recents table)
export const submissions = sqliteTable(
  "submissions",
  {
    // API id field — use integer() since Drizzle stores as INTEGER.
    // The API returns it as a string; parse with parseInt() at insert.
    submissionId: integer("submission_id").primaryKey(),
    // Resolved from titleSlug at insert time. NOT NULL: per-question backfill
    // approach always knows the questionId. If a global approach is used later,
    // make nullable.
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    // Denormalized for display + fallback joins. titleSlug is UNIQUE on questions.
    titleSlug: text("title_slug").notNull(),
    // LeetCode langSlug, e.g. "python3", "cpp"
    lang: text("lang").notNull(),
    // Human-readable verdict, e.g. "Accepted", "Wrong Answer", "Time Limit Exceeded"
    statusDisplay: text("status_display").notNull(),
    // Display strings as returned by API — "52 ms", "16.4 MB". Store raw; 
    // parsing into numbers is Phase 2/3's concern at read time.
    runtime: text("runtime"),
    memory: text("memory"),
    // Unix epoch MILLISECONDS. API returns seconds; multiply by 1000 at insert.
    // Same convention as recents.viewedAt.
    submittedAt: integer("submitted_at").notNull(),
    // Only present for live submits via CheckResponse. Null for backfilled history.
    runtimePercentile: real("runtime_percentile"),
    memoryPercentile: real("memory_percentile"),
  },
  (t) => [
    // Per-problem history (Phase 2): all submissions for a question, newest-first.
    index("idx_sub_question_time").on(t.questionId, t.submittedAt),
    // Dashboard aggregations (Phase 3): date-range queries, streak, heatmap.
    index("idx_sub_submitted_at").on(t.submittedAt),
  ],
);
```

**`submissionsFetchedAt` addition to `questions`:** Add to `schema.ts`'s `questions` table:

```typescript
// In the questions sqliteTable definition:
submissionsFetchedAt: integer("submissions_fetched_at"),  // nullable, unix ms
```

This new nullable column is additive — the generated migration uses `ALTER TABLE questions ADD COLUMN`. [VERIFIED: codebase — existing migration 0001 added `recents` as a new table; additive column additions follow the same workflow]

### Pattern 2: CRUD Module for Submissions (mirrors `recents.ts`)

```typescript
// Source: src/db/submissions.ts — mirrors recents.ts pattern
import { desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { submissions, questions } from "./schema";

export interface DbSubmission {
  submissionId: number;
  questionId: number;
  titleSlug: string;
  lang: string;
  statusDisplay: string;
  runtime: string | null;
  memory: string | null;
  submittedAt: number;
  runtimePercentile: number | null;
  memoryPercentile: number | null;
}

// Idempotent insert — onConflictDoNothing means re-inserting the same
// submissionId is a safe no-op (DATA-03). Mirrors upsertQuestionTopics.
export function insertSubmission(row: DbSubmission): void {
  getDb()
    .insert(submissions)
    .values(row)
    .onConflictDoNothing()
    .run();
}

// Batch insert within a transaction (for backfill page batches).
// Mirrors persistPage() in core/sync.ts.
export function insertSubmissions(rows: DbSubmission[]): void {
  getDb().transaction(() => {
    for (const row of rows) {
      getDb().insert(submissions).values(row).onConflictDoNothing().run();
    }
  });
}

// Per-problem history for Phase 2 (HIST-01). Newest first.
export function getSubmissionsForQuestion(questionId: number): DbSubmission[] {
  return getDb()
    .select()
    .from(submissions)
    .where(eq(submissions.questionId, questionId))
    .orderBy(desc(submissions.submittedAt))
    .all();
}

// Mark a question's submissions as fetched (updates the cursor).
// Called after successfully fetching ALL pages for a question.
export function setSubmissionsFetchedAt(questionId: number, now: number = Date.now()): void {
  getDb()
    .update(questions)
    .set({ submissionsFetchedAt: now })
    .where(eq(questions.id, questionId))
    .run();
}
```

### Pattern 3: `submissionList` GraphQL Query (DATA-02)

The query is reverse-engineered from `JacobLinCool/LeetCode-Query` TypeScript library source. [ASSUMED — validate in plan 01-02 spike]

```typescript
// Source: src/api/queries/submission-list.ts
// Mirrors problemset-question-list.ts pattern exactly.

import { gqlQuery } from "../graphql";

// [ASSUMED] — field names and pagination model reverse-engineered from community 
// library. Validate all field names against the live API in the plan 01-02 spike.
export interface SubmissionListData {
  submissionList: {
    hasNext: boolean;
    submissions: ApiSubmission[];
  };
}

export interface ApiSubmission {
  id: string;           // submission ID (string from API; parseInt at use)
  lang: string;         // langSlug e.g. "python3"
  timestamp: string;    // [ASSUMED] unix epoch SECONDS as string; multiply * 1000 for ms
  statusDisplay: string; // "Accepted", "Wrong Answer", etc.
  runtime: string;      // [ASSUMED] display string e.g. "52 ms"
  memory: string;       // [ASSUMED] display string e.g. "16.4 MB"
  title: string;        // problem title
  titleSlug: string;    // problem slug — use to join to questions.title_slug
  isPending: string;    // [ASSUMED] "Not Pending" when complete
  url: string;          // submission URL
}

const QUERY = `
query submissionList($offset: Int!, $limit: Int!, $slug: String) {
    submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
        hasNext
        submissions {
            id
            lang
            timestamp
            statusDisplay
            runtime
            memory
            title
            titleSlug
            isPending
            url
        }
    }
}`;

const PAGE_SIZE = 20; // [ASSUMED] consistent with community library default

export async function fetchSubmissionList(
  questionSlug: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<SubmissionListData> {
  return gqlQuery<SubmissionListData>(QUERY, {
    offset,
    limit,
    slug: questionSlug,
  });
  // Note: do NOT pass useCache=true — submissions change and we want fresh data.
}
```

**Validation checklist for plan 01-02 spike:**
- Confirm query name is `submissionList` (not `questionSubmissionList` or another variant)
- Confirm `timestamp` type (string or integer, seconds or milliseconds)
- Confirm `runtime`/`memory` are display strings (not parsed numbers)
- Confirm `hasNext` terminates pagination (not a different field)
- Confirm `id` is numeric or string; confirm it matches the `submission_id` in CheckResponse
- Confirm `questionSlug` is the correct variable name (vs. `slug` or `titleSlug`)
- Confirm the global feed (no `questionSlug`) works and what it returns (needed if per-question approach proves impractical at scale)

### Pattern 4: Never-Throws Backfill Service (DATA-02, DATA-03, DATA-04, DATA-05)

Mirrors `core/git.ts` discriminated-union result + `core/sync.ts` pagination shape.

```typescript
// Source: src/core/backfill.ts
// [ASSUMED] — implementation sketch; exact shape is for the planner to finalize

export type BackfillFailReason =
  | "auth-error"       // 401/403 from API (session expired)
  | "rate-limited"     // 429 received after all retries
  | "network-error"    // fetch threw / timeout
  | "cancelled";       // user cancelled via D-05

export type BackfillResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; reason: BackfillFailReason; imported: number; message: string };

// Injectable cancel ref — a plain mutable object so the async loop can check
// it between pages without AbortController complexity.
export interface CancelRef { cancelled: boolean }

export async function backfillSubmissions(
  onProgress?: (done: number, total: number) => void,
  cancelRef?: CancelRef,
  interPageDelayMs = 1000, // [ASSUMED default] — validate in spike
): Promise<BackfillResult> {
  // ... never throws; catches all errors, returns discriminated result
}
```

**Per-question strategy rationale (D-07):**

Use `fetchSubmissionList(questionSlug)` for each question the user has attempted (`status = 'ac' | 'notac'` on the `questions` table, or `submissionsFetchedAt IS NULL`). This:
- Bounds API calls to the user's attempted question count (typically tens to low hundreds)
- Makes `submissionsFetchedAt` the natural resume cursor: questions with non-null value are already done
- Makes incremental top-up (D-06) natural: re-fetch page 1 for each question; stop early if first page is all already-in-DB (idempotent `onConflictDoNothing` safety net)

**Cursor semantics (D-07):**

Two distinct roles, both served by `submissionsFetchedAt` on `questions`:
- **Resume cursor**: `submissionsFetchedAt IS NULL` = not yet processed. After completing ALL pages for a question, `setSubmissionsFetchedAt(questionId, Date.now())`. Interrupted run resumes by filtering `submissionsFetchedAt IS NULL`.
- **High-water mark**: `submissionsFetchedAt IS NOT NULL` with a recent timestamp = up-to-date. Incremental top-up only re-fetches questions where `submissionsFetchedAt` is older than some staleness threshold (or where new submissions are suspected). The idempotent `onConflictDoNothing` on `submissionId` PK is the universal safety net — no duplicate row can ever be inserted regardless of cursor state.

**One field carries both roles.** No second field is needed.

### Pattern 5: Rate-Limit Defense (DATA-04)

```typescript
// [ASSUMED] Seed defaults — validate in plan 01-02 spike before locking

const DEFAULT_INTER_PAGE_DELAY_MS = 1000; // 1 second between pages within a question
const DEFAULT_INTER_QUESTION_DELAY_MS = 500; // 0.5 seconds between questions

// 429 backoff: exponential with jitter. Base 2^attempt * 1000ms + random(0-500ms)
// Cap at 30 seconds, max 5 retries.
async function withBackoff<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const is429 = e instanceof Error && e.message.includes("429");
      if (!is429 || attempt === maxRetries - 1) throw e;
      const delay = Math.min(30000, 2 ** attempt * 1000 + Math.random() * 500);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
```

**Community-sourced rate limit data (LOW confidence — validate):**
- LeetCode-Query library default: 20 req / 10 seconds (2 req/sec)
- Community scrapers: 2-second delay as conservative safe default
- Documented 429 trigger: ~60 rapid requests per community reports
- No official documentation exists — these are reverse-engineered observations

The live spike (plan 01-02) must send pages in bursts at different cadences and record the actual 429 threshold and recovery window. Lock the `DEFAULT_INTER_PAGE_DELAY_MS` only after the spike confirms it.

### Pattern 6: Append-on-Submit (DATA-06, D-08)

`CheckResponse` (already in `src/api/types.ts`) carries all needed fields for new submissions:

```typescript
// Source: src/api/types.ts CheckResponse (verified)
// Present on submit (not run): submission_id, runtime_percentile, memory_percentile
// Present on both: status_code, status_runtime ("52 ms"), status_memory ("16.4 MB"), lang
```

Hook point in `src/core/submission.ts` `submitSolution()` after `pollResult()` resolves:

```typescript
// Source: src/core/submission.ts (verified — this is where to insert)
const result = await pollResult(submitResponse.submission_id);
// [NEW] Append to submissions store for ALL verdicts (D-08):
if (result.type !== "pending" && result.type !== "timeout" && result.type !== "unknown") {
  const data = "data" in result ? result.data : null;
  if (data?.submission_id) {
    insertSubmission({
      submissionId: parseInt(data.submission_id),
      questionId: question.id,
      titleSlug: question.title_slug,
      lang: langSlug,
      statusDisplay: statusDisplayFromCode(data.status_code ?? 0),
      runtime: data.status_runtime ?? null,
      memory: data.status_memory ?? null,
      submittedAt: Date.now(), // CheckResponse has no timestamp field
      runtimePercentile: data.runtime_percentile ?? null,
      memoryPercentile: data.memory_percentile ?? null,
    });
  }
}
// [existing] markAccepted / markAttempted / setSubmissionStats follow
```

`statusDisplayFromCode(code)` maps `status_code` to a display string. Alternatively, store `result.data.status_msg` directly if the API returns it (verify in spike).

**Runs vs. submits:** DATA-06 says "submissions made through leettui" — interpret as submits only (`submitSolution`), not `runSolution`. Runs use `interpret_id` (not `submission_id`) and don't have a stable LeetCode submission ID. Do not add append logic to `runSolution`.

### Pattern 7: Non-Blocking Progress via syncSlice (DATA-07)

`syncSlice` (verified in `src/ui/store/slices/syncSlice.ts`) is exactly the right primitive:

```typescript
// Verified source: src/ui/store/slices/syncSlice.ts
export interface SyncSlice {
  syncProgress: { current: number; total: number } | null;
  setSyncProgress: (current: number, total: number) => void;
  clearSyncProgress: () => void;
}
```

Usage pattern from `src/ui/components/onboarding/BootFlow.tsx` (verified):

```typescript
await syncIfEmpty((c, t) => useAppStore.getState().setSyncProgress(c, t));
useAppStore.getState().clearSyncProgress();
```

The backfill handler mirrors this exactly:

```typescript
// In the view handler (outside React):
const result = await backfillSubmissions(
  (done, total) => useAppStore.getState().setSyncProgress(done, total),
  cancelRef,
);
useAppStore.getState().clearSyncProgress();
```

`<ProgressBar>` (verified in `src/ui/components/ProgressBar.tsx`) is already wired to `syncProgress` in both `BrowseView` and `ProblemView`. The backfill progress therefore appears for free if `syncSlice` is reused. If `backfillSlice` is created instead, a new `<BackfillProgressBar>` is needed — but this duplicates the existing component. **Recommendation: reuse `syncSlice`/`<ProgressBar>`.**

**Non-blocking via Bun's event loop:** The backfill service runs inside an `async` function that `await`s each page fetch. In between `await` points, the OpenTUI render loop runs normally (it's also event-loop-based). No `setTimeout` or `setInterval` is needed. The user can navigate freely while the `await` is pending. [VERIFIED: this is identical to how `syncQuestions` works in `core/sync.ts`]

### Pattern 8: First-Run Nudge (D-01, D-02)

Mirrors `shouldShowChangelog` + `lastShownChangelogVersion` pattern exactly.

**session.ts additions:**

```typescript
// Add to SessionState:
backfillNudgeShown?: boolean;

// New accessors (mirrors getLastShownChangelogVersion / setLastShownChangelogVersion):
export function getBackfillNudgeShown(): boolean {
  return state().backfillNudgeShown ?? false;
}
export function setBackfillNudgeShown(): void {
  state().backfillNudgeShown = true;
  writeNow();
}
```

**Show condition (pure function for testability, mirrors `shouldShowChangelog`):**

```typescript
// src/core/session.ts or a new shouldShowBackfillNudge.ts
export function shouldShowBackfillNudge(
  nudgeShown: boolean,
  hasAnySubmissions: boolean, // check: getDb().select().from(submissions).limit(1).all().length === 0
  mode: string,
): boolean {
  if (nudgeShown) return false;       // already shown — never again
  if (hasAnySubmissions) return false; // already has data — no need to prompt
  return mode === "browse";
}
```

**BootFlow wiring:** In the `loading` phase effect (after `syncIfEmpty`), mirror the changelog block:

```typescript
// After openDatabase() and syncIfEmpty():
if (!getBackfillNudgeShown() && mode === "browse") {
  const hasData = /* check submissions table */ false;
  if (shouldShowBackfillNudge(false, hasData, "browse")) {
    // show BackfillNudge component (a dismissible modal)
    useAppStore.getState().showBackfillNudge();
  }
  setBackfillNudgeShown(); // always record — seeds "already shown" on first boot
}
```

**Key invariant from changelog pattern:** `setBackfillNudgeShown()` is called UNCONDITIONALLY (outside the `if (shouldShow)` branch), so:
- Fresh install: `backfillNudgeShown` is undefined → nudge shows on first boot AFTER the user has browse mode. Then flag is set.
- Subsequent launches: `backfillNudgeShown = true` → never shows again.
- After backfill runs: `hasAnySubmissions = true` → also suppressed.

**BackfillNudge component:** A light dismissible popup (not a blocking modal). Two actions:
- "Run now" → calls `submissions.backfill` command → starts backfill
- "Later" / Esc → dismisses; palette always reachable

### Anti-Patterns to Avoid

- **Calling `db.run()` outside a transaction for batch inserts.** Always wrap page batches in `getDb().transaction(() => { ... })` — mirrors `persistPage()` in `core/sync.ts`.
- **Storing timestamps as seconds.** The `recents.viewedAt` convention is milliseconds (`Date.now()`). The API returns seconds; multiply by 1000 at insert. Mixing units breaks Phase 3's timezone-correct date arithmetic.
- **Embedding the migration SQL by hand.** Always use `bun run db:generate` then embed the generated file. Hand-editing the `.sql` causes hash mismatch in `embeddedMigrations()`.
- **Throwing from the backfill service.** Every error must be caught and returned as a `BackfillResult` discriminated union. This mirrors `core/git.ts`'s `GitOpResult` contract.
- **Adding `useCache = true` to the submissionList query.** Submissions change; caching would serve stale data on re-runs.
- **Calling `runSolution` append path.** Only `submitSolution` produces a `submission_id` — runs do not.
- **Storing `lang` as the human-readable name.** Store the `langSlug` (e.g. `"python3"`, not `"Python 3"`). The API `lang` field returns the langSlug. Phase 2's display can look up the pretty name from `LANGUAGE_EXTENSIONS` at render time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL conflict handling | Custom "check then insert" | `onConflictDoNothing()` | Atomic; avoids TOCTOU race; one line of code |
| Transaction batching | Custom batch accumulator | `getDb().transaction(() => {...})` | Drizzle WAL + transaction is already optimal |
| Rate-limit delay | Custom sleep loop | `await new Promise(r => setTimeout(r, delay))` | Sufficient; no library needed |
| Progress bar | Custom `<text>` progress display | Reuse `syncSlice` + existing `<ProgressBar>` | Already renders in BrowseView and ProblemView |
| Cancel signal | AbortController | Plain `{ cancelled: boolean }` ref | Simpler; no browser API dependency; same semantics |
| Migration tracking | Custom `__applied_migrations` table | `db.dialect.migrate(embeddedMigrations(), ...)` | Drizzle already owns `__drizzle_migrations`; idempotent |

**Key insight:** Every "new" capability in this phase is either a schema extension or a recombination of existing patterns. The codebase is mature enough that the planner should look for the closest existing analog before proposing any custom solution.

---

## Common Pitfalls

### Pitfall 1: Skipping the migrations.ts embed step

**What goes wrong:** `bun run db:generate` creates the SQL file but the developer forgets to add the static import and `SQL_BY_TAG` entry to `migrations.ts`. Dev (`bun src/index.tsx`) works because drizzle-kit reads `drizzle/` from disk. The compiled binary (`bun run build && ./leettui`) throws `Missing embedded SQL for migration "NNNN_..."` at first launch and crashes.

**Why it happens:** The three-step workflow (schema edit → generate → embed) has a non-obvious third step that only matters for the compiled binary path.

**How to avoid:** The `src/db/CLAUDE.md` documents this explicitly. Run `bun run build && ./leettui` after any schema change to verify both dev and binary paths. [VERIFIED: codebase]

**Warning signs:** Works in dev, crashes in binary.

### Pitfall 2: Timestamp unit mismatch (seconds vs. milliseconds)

**What goes wrong:** The API's `timestamp` field returns unix epoch **seconds** (e.g. `1718400000`). Stored as-is, Phase 3's date arithmetic (streak, heatmap, `toLocaleDateString`) produces dates 1000x in the past (1970s).

**Why it happens:** [ASSUMED] Community library source shows `* 1000` applied to the timestamp. The API returns seconds, not milliseconds.

**How to avoid:** In the `fetchSubmissionList` → `insertSubmission` mapping, always apply `submittedAt: parseInt(raw.timestamp) * 1000`. Validate in the live spike.

**Warning signs:** `new Date(submission.submittedAt)` produces a 1970s date.

### Pitfall 3: `submissions` query returns a global feed, not per-user

**What goes wrong:** The `submissionList` query without `questionSlug` [ASSUMED] returns the authenticated user's submissions globally — all problems, newest first. If leettui calls this without realizing it includes other users' submissions or has surprising scope, the import could be very large or wrong.

**Why it happens:** The unofficial API shape is undocumented. Some LeetCode API endpoints behave differently with/without auth.

**How to avoid:** Validate in the spike: fetch one page without `questionSlug`, confirm all returned submissions belong to the authenticated user. The per-question approach (with `questionSlug`) sidesteps this ambiguity entirely.

**Warning signs:** Returned submissions with unexpected `titleSlug` values or very large page counts.

### Pitfall 4: Foreign key constraint failures at insert

**What goes wrong:** `insertSubmissions` fails with a foreign key violation if `questionId` references a question not yet in the local `questions` table (e.g. a premium-only problem not synced locally, or a question deleted from LeetCode).

**Why it happens:** `PRAGMA foreign_keys = ON` is set in `openDatabase()`. An unknown `questionId` violates the `submissions.question_id → questions.id` FK.

**How to avoid:** Before inserting, resolve `questionId` via `getQuestionBySlug(titleSlug)`. If `null` (question not in local DB), skip the row and log it. The `submissions_fetched_at` cursor should still advance for that question (we tried; the data isn't local). [VERIFIED: `PRAGMA foreign_keys = ON` in `src/db/index.ts`]

**Warning signs:** `FOREIGN KEY constraint failed` SQLite error on insert.

### Pitfall 5: Blocking the render loop during per-question iteration

**What goes wrong:** A tight synchronous loop over 300 questions (with `await` only inside each) blocks the render loop between questions if the loop itself is not `await`-ed properly or if synchronous setup is heavy.

**Why it happens:** Bun's event loop runs between `await` points. If the per-question loop has synchronous work (DB reads, data prep) exceeding ~16ms per iteration before the first `await`, OpenTUI frame rendering is delayed.

**How to avoid:** Ensure each iteration has an early `await fetchSubmissionList(...)` so the event loop gets control. The inter-page delay `await new Promise(r => setTimeout(r, delay))` also yields naturally.

**Warning signs:** UI is unresponsive or jittery during backfill. Test with `LEETTUI_DEBUG=1`.

### Pitfall 6: Progress bar not clearing on cancel or error

**What goes wrong:** `backfillSubmissions` returns on cancel or error but the handler forgets to call `clearSyncProgress()`. The progress bar stays frozen at its last value forever.

**How to avoid:** In the view handler, `clearSyncProgress()` must be called in BOTH the success AND error/cancel paths. Use a `try/finally` block.

```typescript
try {
  const result = await backfillSubmissions(onProgress, cancelRef);
  // handle result
} finally {
  useAppStore.getState().clearSyncProgress();
}
```

---

## Code Examples

### Verified: Embedding a New Migration

```typescript
// Source: src/db/migrations.ts (verified — exact pattern to follow for new migration)
import m0002 from "../../drizzle/0002_submissions.sql" with { type: "text" };

const SQL_BY_TAG: Record<string, string> = {
  "0000_panoramic_senator_kelly": m0000,
  "0001_even_proudstar": m0001,
  "0002_submissions": m0002,  // new entry
};
```

### Verified: `onConflictDoNothing` Insert Pattern

```typescript
// Source: src/db/questions.ts (verified)
db.insert(questionTopics).values({ questionId, topicSlug: slug }).onConflictDoNothing().run();

// Applied to submissions:
db.insert(submissions).values(row).onConflictDoNothing().run();
```

### Verified: `syncSlice` Progress Callback Shape

```typescript
// Source: src/ui/components/onboarding/BootFlow.tsx (verified)
await syncIfEmpty((c, t) => useAppStore.getState().setSyncProgress(c, t));
useAppStore.getState().clearSyncProgress();

// Backfill mirrors this:
await backfillSubmissions(
  (done, total) => useAppStore.getState().setSyncProgress(done, total),
  cancelRef,
);
useAppStore.getState().clearSyncProgress();
```

### Verified: Never-Throws Result Union Pattern

```typescript
// Source: src/core/git.ts (verified — mirrors this exact shape)
export type GitOpResult =
  | { ok: true; output: string }
  | { ok: false; reason: GitFailReason; output: string };

// backfill.ts mirrors:
export type BackfillResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; reason: BackfillFailReason; imported: number; message: string };
```

### Verified: Adding a Column to questions via Migration

The existing `0000_panoramic_senator_kelly.sql` shows the column shape for `questions`:

```sql
-- Existing (verified):
`last_runtime` text,
`last_memory` text
-- New column added by 0002 migration (pattern identical):
`submissions_fetched_at` integer  -- nullable, unix ms
```

### [ASSUMED] submissionList GraphQL Query (validate in spike)

```graphql
query submissionList($offset: Int!, $limit: Int!, $slug: String) {
    submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
        hasNext
        submissions {
            id
            lang
            timestamp
            statusDisplay
            runtime
            memory
            title
            titleSlug
            isPending
            url
        }
    }
}
```

### [ASSUMED] CheckResponse → DbSubmission Mapping

```typescript
// Source: src/api/types.ts CheckResponse (verified type) + mapping [ASSUMED]
// All CheckResponse fields are optional; guard each.

function submissionFromCheckResponse(
  result: ParsedResponse,
  question: DbQuestion,
  langSlug: string,
): DbSubmission | null {
  if (!("data" in result)) return null;
  const data = result.data;
  if (!data.submission_id) return null; // runs don't have submission_id

  return {
    submissionId: parseInt(data.submission_id),
    questionId: question.id,
    titleSlug: question.title_slug,
    lang: data.lang ?? langSlug,
    statusDisplay: statusMsgFromCode(data.status_code ?? 0),
    runtime: data.status_runtime ?? null,
    memory: data.status_memory ?? null,
    submittedAt: Date.now(),                      // CheckResponse has no timestamp
    runtimePercentile: data.runtime_percentile ?? null,
    memoryPercentile: data.memory_percentile ?? null,
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Migrate DB from `drizzle/` folder on disk | Embedded SQL via static import with `{ type: "text" }` | Stage 0 (initial) | Binary self-contained; migration works without source checkout |
| `migrate(db, { migrationsFolder })` | `db.dialect.migrate(embeddedMigrations(), db.session)` | Stage 0 | Internal API; stable for drizzle-orm 0.44.4 but not public API |
| Adding `last_runtime`/`last_memory` via `ensureColumn` hack | Additive column migration via `bun run db:generate` | Recent (before Stage 20) | First-class Drizzle migration; documented in CLAUDE.md |

**Deprecated / outdated:**
- `ensureColumn` runtime hack: removed; replaced by proper Drizzle migrations for any new column additions. Do not use this pattern for `submissionsFetchedAt`.

---

## Runtime State Inventory

This is a greenfield extension (new table, new column). No rename/refactor involved.

**Nothing found in any category:** None — verified by codebase audit. The only persistent state affected is the `questions.db` SQLite file (additive migration) and `session.json` (new `backfillNudgeShown` key, additive merge).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `submissionList` GraphQL query name and parameter names (`offset`, `limit`, `questionSlug`) are correct | §Pattern 3 | Backfill fails entirely at query time; fix = correct query name/params |
| A2 | API `timestamp` field is unix epoch **seconds** (integer or string) | §Pattern 3, §Pitfall 2 | Stored timestamps are off by 1000x; Phase 3 date arithmetic breaks |
| A3 | API `runtime` and `memory` fields are display strings (e.g. "52 ms", "16.4 MB") | §Pattern 1 | Wrong storage type; might need to parse; affects Phase 2/3 display |
| A4 | `hasNext` boolean drives pagination termination | §Pattern 3 | Pagination either stops early or loops infinitely |
| A5 | Per-question `submissionList(questionSlug)` returns only the authenticated user's submissions for that question | §Pattern 4 | Wrong submissions imported; contaminated store |
| A6 | The API `id` field for submissions matches the `submission_id` in `CheckResponse` | §Pattern 6 | Duplicate submissions inserted (upsert safety net handles this, but semantics break) |
| A7 | Rate limit threshold is ~60 rapid requests before 429 | §Pattern 5 | Either too slow (more headroom) or too fast (429s mid-backfill) |
| A8 | Default 1000ms inter-page delay is safe | §Pattern 5 | 429s if threshold is lower; spike validates this |
| A9 | `isPending` field signals an in-flight submission to skip | §Pattern 3 | Stale pending submissions stored incorrectly |

**Plan 01-02 spike must validate A1–A6 against the live API and A7–A8 by sending bursts and observing 429 behavior.**

---

## Open Questions (RESOLVED)

1. **Global vs. per-question pagination strategy**
   - What we know: Per-question (`questionSlug`) approach aligns with D-07 cursor semantics and bounds API calls to the user's attempted question count. Global approach (no `questionSlug`) has unclear scope and would require a different cursor model.
   - What's unclear: Does the global `submissionList` (no `questionSlug`) work for authenticated users? Is there a performance advantage at scale?
   - Recommendation: Start with per-question approach in plan 01-02 spike. Validate global as a fallback only if per-question is impractical.
   - RESOLVED: 01-02 Task 3 uses the per-question strategy (the `questionSlug` filter, D-07 cursor); the spike (Task 1/2) probes the global no-`questionSlug` call only as a fallback observation.

2. **`syncSlice` reuse vs. `backfillSlice` creation**
   - What we know: `syncSlice` is already wired to `<ProgressBar>` in both views. Reusing it means the backfill progress renders for free with zero new components.
   - What's unclear: Does reusing `syncSlice` cause confusion if a DB re-sync and backfill run close together? (They won't: backfill is on-demand, DB sync is first-run-only.)
   - Recommendation: Reuse `syncSlice`. If concerns arise, the slice can be split later without breaking the progress bar component.
   - RESOLVED: 01-03 Task 2 reuses `syncSlice` (no new `backfillSlice`); the backfill progress renders through the existing `<ProgressBar>` wiring.

3. **Cancel keybinding scope**
   - What we know: D-05 requires a cancel action. The existing binding system uses `useBindings` per scope.
   - What's unclear: Should cancel be a global binding (available anywhere) or a contextual one (only when backfill is in progress)?
   - Recommendation: A global `submissions.cancelBackfill` command that is a no-op when no backfill is running (mirrors `update.dismiss` which is no-op when no banner). Bind to Esc only when the progress bar is showing (contextual activation).
   - RESOLVED: 01-03 Task 2 specifies the no-op-when-idle cancel command (mirrors `update.dismiss`), and 01-02 Task 3 makes cancel preserve partial data (`cancelRef.cancelled` between pages → reason:'cancelled', already-written rows kept).

4. **`statusDisplay` source for append-on-submit**
   - What we know: `CheckResponse.status_code` is a number; `CheckResponse` type in `types.ts` does not include a `status_msg` field but it may be present in the raw response.
   - What's unclear: Is `status_msg` reliably present in the raw JSON? If not, we need a `statusMsgFromCode(code)` mapper.
   - Recommendation: In the plan 01-02 spike, log the full `CheckResponse` raw JSON for a submit to check if `status_msg` is present. If yes, use it directly. If not, build the mapper.
   - RESOLVED: 01-02 Task 2 checkpoint validates `CheckResponse.status_msg` presence during the live spike (use it directly if present; otherwise build the `statusDisplayFromCode` mapper consumed in 01-03).

---

## Environment Availability

All dependencies already verified present. No new tooling required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `bun` | All (runtime) | ✓ | Bun host | — |
| `drizzle-orm` | Schema + migrations | ✓ | 0.44.4 (pinned) | — |
| `drizzle-kit` | `bun run db:generate` | ✓ | 0.31.x (pinned) | — |
| LeetCode GraphQL API | Backfill service | Auth required | unofficial | Graceful failure (BackfillResult) |

**Missing dependencies with no fallback:** None.

---

## Security Domain

This phase makes no new external-facing endpoints. The security surface is limited to:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `parseInt()` / nullable guards on all API response fields; no SQL string concatenation |
| V6 Cryptography | no | No new secrets; existing cookie auth unchanged |
| V2 Authentication | yes (existing) | Backfill uses existing `LEETCODE_SESSION` cookie; `AuthError` catch returns `BackfillResult{ok:false, reason:"auth-error"}` |

**No new secrets are introduced.** The `submissions.db` data lives in `questions.db` which is already covered by the `*.db` gitignore protection (ROADMAP success criterion 5).

---

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts`, `src/db/migrations.ts`, `src/db/index.ts` — Drizzle embedded migration pattern [VERIFIED: codebase]
- `src/db/recents.ts`, `src/db/recents.test.ts` — CRUD module pattern with injectable deps [VERIFIED: codebase]
- `src/core/sync.ts` — paginated GraphQL→SQLite walk; `onProgress` callback shape [VERIFIED: codebase]
- `src/core/git.ts` — never-throws result-union pattern [VERIFIED: codebase]
- `src/ui/store/slices/syncSlice.ts` — `{current,total}` progress slice [VERIFIED: codebase]
- `src/api/types.ts` `CheckResponse` — all fields available for append-on-submit [VERIFIED: codebase]
- `src/ui/components/onboarding/BootFlow.tsx` — changelog popup / `shouldShowChangelog` one-time fire pattern [VERIFIED: codebase]
- `src/core/session.ts` — `lastShownChangelogVersion` merge-write pattern [VERIFIED: codebase]
- `src/core/update.ts` `shouldShowChangelog` — pure function for one-time nudge logic [VERIFIED: codebase]
- `src/db/CLAUDE.md` — three-step migration workflow (edit → generate → embed) [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `JacobLinCool/LeetCode-Query` TypeScript library source — `submissionList` query shape, field names, pagination [CITED: github.com/JacobLinCool/LeetCode-Query] — requires spike validation

### Tertiary (LOW confidence)
- Community experience: 60-request 429 threshold — [ASSUMED]
- LeetCode-Query default rate limit: 20 req / 10 sec — [CITED: npm/leetcode-query README] but not authoritative
- 2-second delay as safe scraper default — community reports, [ASSUMED]
- `timestamp` field is seconds (not ms) — inferred from community library's `* 1000` transform [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Schema design: HIGH — direct extension of verified existing patterns
- Migration mechanics: HIGH — documented, tested workflow in CLAUDE.md
- CRUD module: HIGH — mirrors recents.ts line-for-line
- Backfill service structure: HIGH — mirrors sync.ts + git.ts
- Progress wiring: HIGH — syncSlice pattern is verified
- One-time nudge: HIGH — shouldShowChangelog pattern is verified
- Append-on-submit hook point: HIGH — submission.ts seam is verified
- LeetCode API field names: LOW — [ASSUMED]; spike validates
- Rate limit defaults: LOW — [ASSUMED]; spike validates
- Timestamp units: LOW — [ASSUMED]; spike validates

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (schema/code patterns are stable; API shape may drift at any time)
