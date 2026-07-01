# Phase 1: Submission Store & Backfill — Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 10 (6 new, 4 modified + test)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` (modify) | model | — | self — add table + column to existing defs | exact |
| `src/db/migrations.ts` (modify) | config | — | self — embed new SQL import + `SQL_BY_TAG` entry | exact |
| `src/db/submissions.ts` (new) | db module | CRUD | `src/db/recents.ts` | exact |
| `src/db/submissions.test.ts` (new) | test | — | `src/db/recents.test.ts` | exact |
| `src/api/queries/submission-list.ts` (new) | api query | request-response | `src/api/queries/problemset-question-list.ts` | exact |
| `src/core/backfill.ts` (new) | service | batch + event-driven | `src/core/sync.ts` (pagination) + `src/core/git.ts` (never-throws result union) | role-match |
| `src/core/submission.ts` (modify) | service | request-response | self — append insert after `pollResult` | exact |
| `src/core/session.ts` (modify) | config | — | self — add `backfillNudgeShown` field + accessor pair | exact |
| `src/ui/keymap/commands/system.ts` (modify) | keymap | — | self — two new `makeCommand` entries | exact |
| `src/ui/components/onboarding/BootFlow.tsx` (modify) | component | event-driven | self — mirror `shouldShowChangelog` + `setLastShownChangelogVersion` block | exact |

---

## Pattern Assignments

### `src/db/schema.ts` (modify — add `submissions` table + `submissionsFetchedAt` column)

**Analog:** self (`src/db/schema.ts`, lines 1–49)

**Existing table definition pattern to mirror** (lines 40–49 — `recents` table):
```typescript
export const recents = sqliteTable(
  "recents",
  {
    questionId: integer("question_id")
      .primaryKey()
      .references(() => questions.id),
    viewedAt: integer("viewed_at").notNull(),
  },
  (t) => [index("idx_recents_viewed_at").on(t.viewedAt)],
);
```

**Column shape on `questions` to mirror** (lines 3–13 — `lastRuntime`/`lastMemory` pattern):
```typescript
lastRuntime: text("last_runtime"),
lastMemory: text("last_memory"),
// New nullable integer column (same pattern):
submissionsFetchedAt: integer("submissions_fetched_at"),
```

**New `submissions` table to add** (after `recents`, mirrors the multi-index + FK pattern of `questionTopics`):
```typescript
export const submissions = sqliteTable(
  "submissions",
  {
    submissionId: integer("submission_id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    titleSlug: text("title_slug").notNull(),
    lang: text("lang").notNull(),
    statusDisplay: text("status_display").notNull(),
    runtime: text("runtime"),
    memory: text("memory"),
    submittedAt: integer("submitted_at").notNull(),  // unix ms (multiply API seconds * 1000)
    runtimePercentile: real("runtime_percentile"),
    memoryPercentile: real("memory_percentile"),
  },
  (t) => [
    index("idx_sub_question_time").on(t.questionId, t.submittedAt),
    index("idx_sub_submitted_at").on(t.submittedAt),
  ],
);
```

**Import additions** (line 1 — `real` is already imported; no new imports needed):
```typescript
import { sqliteTable, integer, text, real, primaryKey, index } from "drizzle-orm/sqlite-core";
```

**Mandatory 3-step workflow** (from `src/db/CLAUDE.md` — non-negotiable):
1. Edit `schema.ts`.
2. `bun run db:generate` → drizzle-kit writes `drizzle/0002_<name>.sql` + updates journal.
3. Embed in `migrations.ts` (see next section) — **compiled binary crashes without this step**.

---

### `src/db/migrations.ts` (modify — embed new migration)

**Analog:** self (`src/db/migrations.ts`, lines 1–43)

**Exact pattern to follow** (lines 16–22):
```typescript
// Existing:
import m0000 from "../../drizzle/0000_panoramic_senator_kelly.sql" with { type: "text" };
import m0001 from "../../drizzle/0001_even_proudstar.sql" with { type: "text" };

const SQL_BY_TAG: Record<string, string> = {
  "0000_panoramic_senator_kelly": m0000,
  "0001_even_proudstar": m0001,
};
```

**What to add** (the import must be a static literal path — no variable — for Bun to bundle it):
```typescript
import m0002 from "../../drizzle/0002_submissions.sql" with { type: "text" };
// (filename will differ — use the exact name drizzle-kit generates)

// In SQL_BY_TAG:
"0002_submissions": m0002,   // key must match journal `tag` exactly
```

**Failure mode:** forgetting this step works in dev (`bun src/index.tsx`) but crashes the compiled binary with `Missing embedded SQL for migration "0002_..."` on first launch.

---

### `src/db/submissions.ts` (new)

**Analog:** `src/db/recents.ts` (lines 1–58) — mirror line-for-line

**Imports pattern** (recents.ts lines 1–4):
```typescript
import { desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { submissions, questions } from "./schema";
```

**Interface pattern** (recents.ts lines 9–11 — `RecentQuestion extends DbQuestion`):
```typescript
export interface DbSubmission {
  submissionId: number;
  questionId: number;
  titleSlug: string;
  lang: string;
  statusDisplay: string;
  runtime: string | null;
  memory: string | null;
  submittedAt: number;         // unix ms
  runtimePercentile: number | null;
  memoryPercentile: number | null;
}
```

**Single idempotent insert** (mirrors `onConflictDoNothing` from `src/db/questions.ts` — verified line):
```typescript
export function insertSubmission(row: DbSubmission): void {
  getDb().insert(submissions).values(row).onConflictDoNothing().run();
}
```

**Batch insert in transaction** (mirrors `persistPage` in `src/core/sync.ts` lines 9–31):
```typescript
export function insertSubmissions(rows: DbSubmission[]): void {
  getDb().transaction(() => {
    for (const row of rows) {
      getDb().insert(submissions).values(row).onConflictDoNothing().run();
    }
  });
}
```

**Query pattern** (recents.ts lines 50–58 — `select().from().innerJoin().orderBy().all()`):
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

**Cursor update** (mirrors `setSubmissionStats` in `src/db/questions.ts`):
```typescript
export function setSubmissionsFetchedAt(questionId: number, now: number = Date.now()): void {
  getDb()
    .update(questions)
    .set({ submissionsFetchedAt: now })
    .where(eq(questions.id, questionId))
    .run();
}
```

**FK-miss guard** (Pitfall 4 from RESEARCH.md — `PRAGMA foreign_keys = ON` is live):
```typescript
// Before inserting, resolve questionId from the local DB:
// const q = getQuestionBySlug(titleSlug);
// if (!q) return;  // skip rows for questions not locally synced
```

---

### `src/db/submissions.test.ts` (new)

**Analog:** `src/db/recents.test.ts` (lines 1–93) — mirror structure exactly

**Test harness pattern** (lines 1–35):
```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "./index";
import { upsertQuestion } from "./questions";
import { insertSubmission, getSubmissionsForQuestion, setSubmissionsFetchedAt } from "./submissions";

let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `leettui-submissions-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
});

function seedQuestion(id: number): void {
  upsertQuestion({ id, title: `Q ${id}`, titleSlug: `q-${id}`, difficulty: "Easy", paidOnly: false, status: null, acRate: null });
}
```

**Injection pattern for determinism** (recents.ts lines 23–24 — `now?`, `cap?`):
- `insertSubmission`/`setSubmissionsFetchedAt` accept injectable `now` param so tests are deterministic without `Date.now()` mocking.

**Test cases to cover** (mirror recents.test.ts describe blocks):
- Empty returns `[]`
- Single insert is readable
- `onConflictDoNothing` makes a duplicate insert a no-op (same `submissionId` → row count stays 1)
- Newest-first ordering by `submittedAt`
- `setSubmissionsFetchedAt` writes the cursor; `submissionsFetchedAt IS NULL` check filters correctly
- FK constraint: inserting a row with unknown `questionId` fails (foreign key enforcement)

---

### `src/api/queries/submission-list.ts` (new)

**Analog:** `src/api/queries/problemset-question-list.ts` (lines 1–44) — mirror exactly

**Imports pattern** (lines 1–2):
```typescript
import { gqlQuery } from "../graphql";
```

**Type definitions pattern** (mirrors `ProblemsetQuestionListData` in `src/api/types.ts`):
```typescript
export interface ApiSubmission {
  id: string;            // [ASSUMED] string; parseInt at insert
  lang: string;          // langSlug e.g. "python3"
  timestamp: string;     // [ASSUMED] unix seconds as string; * 1000 at insert
  statusDisplay: string;
  runtime: string;       // [ASSUMED] display string e.g. "52 ms"
  memory: string;        // [ASSUMED] display string e.g. "16.4 MB"
  title: string;
  titleSlug: string;
  isPending: string;
  url: string;
}

export interface SubmissionListData {
  submissionList: {
    hasNext: boolean;
    submissions: ApiSubmission[];
  };
}
```

**Query + fetch function pattern** (lines 4–44):
```typescript
const QUERY = `
query submissionList($offset: Int!, $limit: Int!, $slug: String) {
    submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
        hasNext
        submissions { id lang timestamp statusDisplay runtime memory title titleSlug isPending url }
    }
}`;

const PAGE_SIZE = 20;  // [ASSUMED] — validate in spike

export async function fetchSubmissionList(
  questionSlug: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<SubmissionListData> {
  // DO NOT pass useCache=true — submissions are mutable
  return gqlQuery<SubmissionListData>(QUERY, { offset, limit, slug: questionSlug });
}
```

**Critical:** `gqlQuery` signature is `(query, variables, useCache = false)` — third arg must be absent or `false` for submission queries (verified in `src/api/graphql.ts` lines 8–12).

**Spike validation checklist** (all [ASSUMED] fields must be confirmed against live API in plan 01-02 before committing this file):
- Query name, variable names, `hasNext` field, `timestamp` unit (seconds vs ms), `id` type (string vs int)

---

### `src/core/backfill.ts` (new)

**Analogs:** `src/core/sync.ts` (pagination + `onProgress` callback shape) + `src/core/git.ts` (never-throws discriminated result union)

**Never-throws result union** (git.ts lines 23–25 — exact shape to mirror):
```typescript
export type GitFailReason = "tool-missing" | "not-authed" | "failed";
export type GitOpResult =
  | { ok: true; output: string }
  | { ok: false; reason: GitFailReason; output: string };
```

**Backfill result union** (mirrors above):
```typescript
export type BackfillFailReason =
  | "auth-error"      // 401/403 — session expired
  | "rate-limited"    // 429 after all retries
  | "network-error"   // fetch threw / timeout
  | "cancelled";      // user cancelled (D-05)

export type BackfillResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; reason: BackfillFailReason; imported: number; message: string };

export interface CancelRef { cancelled: boolean }
```

**Never-throws wrapper pattern** (git.ts lines 38–56 — `try/catch` that never re-throws):
```typescript
// git.ts's run() — the pattern:
async function run(argv: string[], ...): Promise<RunResult> {
  try {
    // ... spawn ...
  } catch (e) {
    return { ok: false, stdout: "", stderr: errMessage(e), spawnFailed: true };
  }
}
```

**`onProgress` callback pattern** (sync.ts lines 33–65 — exact shape):
```typescript
// sync.ts:
export async function syncQuestions(
  onProgress?: (fetched: number, total: number) => void,
): Promise<number>

// backfill.ts mirrors:
export async function backfillSubmissions(
  onProgress?: (done: number, total: number) => void,
  cancelRef?: CancelRef,
  interPageDelayMs = 1000,  // [ASSUMED default] — lock after spike
): Promise<BackfillResult>
// NEVER throws — all errors caught, returned as BackfillResult
```

**Transaction batch pattern** (sync.ts lines 9–31 — `persistPage`):
```typescript
// sync.ts:
function persistPage(questions: ApiQuestion[]): void {
  getDb().transaction(() => {
    for (const q of questions) { ... }
  });
}
// backfill mirrors this for each page of submissions
```

**Cancel check pattern** (plain ref, no AbortController — simpler, same semantics):
```typescript
// Check between await points in the per-question loop:
if (cancelRef?.cancelled) {
  return { ok: false, reason: "cancelled", imported, message: "Cancelled by user" };
}
```

**Inter-page delay pattern** (no library — same as rate-limit defense in RESEARCH.md Pattern 5):
```typescript
await new Promise<void>((r) => setTimeout(r, interPageDelayMs));
```

**`try/finally` for clearSyncProgress** (Pitfall 6 from RESEARCH.md — must clear in all paths):
```typescript
// In the view handler (NOT in backfill.ts itself):
try {
  const result = await backfillSubmissions(
    (done, total) => useAppStore.getState().setSyncProgress(done, total),
    cancelRef,
  );
  // handle result
} finally {
  useAppStore.getState().clearSyncProgress();
}
```

**Import shape**:
```typescript
import { fetchSubmissionList } from "../api/queries/submission-list";
import { insertSubmissions, setSubmissionsFetchedAt } from "../db/submissions";
import { getQuestionBySlug, getAllQuestions } from "../db/questions";
import { getDb } from "../db/index";
import { errMessage } from "../debug";
```

---

### `src/core/submission.ts` (modify — append-on-submit after `pollResult`)

**Analog:** self (lines 47–73)

**Exact hook point** (lines 61–73 — insert after `pollResult` resolves, before `markAccepted`/`markAttempted`):
```typescript
// EXISTING (lines 61–73):
const result = await pollResult(submitResponse.submission_id);
if (result.type === "submit_accepted") {
  markAccepted(question.id);
  setSubmissionStats(question.id, result.data.status_runtime ?? null, result.data.status_memory ?? null);
} else {
  markAttempted(question.id);
}
return result;

// INSERT before the if-block above (D-08: store ALL verdicts):
// Append to submissions store for all verdicts (D-08).
// Only submits have a submission_id; runs use interpret_id and must not reach here.
if (result.type !== "pending" && result.type !== "timeout" && result.type !== "unknown") {
  const data = "data" in result ? result.data : null;
  if (data?.submission_id) {
    insertSubmission({
      submissionId: parseInt(data.submission_id),
      questionId: question.id,
      titleSlug: question.title_slug,
      lang: langSlug,
      statusDisplay: /* data.status_msg ?? */ statusDisplayFromCode(data.status_code ?? 0),
      runtime: data.status_runtime ?? null,
      memory: data.status_memory ?? null,
      submittedAt: Date.now(),                 // CheckResponse has no timestamp field
      runtimePercentile: data.runtime_percentile ?? null,
      memoryPercentile: data.memory_percentile ?? null,
    });
  }
}
```

**`statusDisplayFromCode` helper** (needed unless `status_msg` is confirmed in `CheckResponse` — verify in spike):
- Status codes from `src/api/CLAUDE.md`: 10=Accepted, 11=WrongAnswer, 12=MemoryLimit, 13=OutputLimit, 14=TimeLimit, 15=RuntimeError, 16=InternalError, 20=CompileError, 30=Timeout.
- Use `data.status_msg` directly if present in raw response (confirm in spike); otherwise build mapper.

**Import to add**:
```typescript
import { insertSubmission } from "../db/submissions";
```

**Do NOT touch `runSolution`** — runs use `interpret_id`, not `submission_id`; no LeetCode submission record is created.

---

### `src/core/session.ts` (modify — add `backfillNudgeShown` field + accessor pair)

**Analog:** self (lines 22–100)

**`SessionState` extension pattern** (lines 22–27 — add one optional field):
```typescript
// Existing:
export interface SessionState {
  topicSlug?: string;
  questionId?: number;
  solutionsDir?: string;
  lastShownChangelogVersion?: string;
  // NEW:
  backfillNudgeShown?: boolean;
}
```

**Accessor pair pattern** (lines 91–100 — `getLastShownChangelogVersion`/`setLastShownChangelogVersion`):
```typescript
// Existing pattern to mirror exactly:
export function getLastShownChangelogVersion(): string | undefined {
  return state().lastShownChangelogVersion;
}
export function setLastShownChangelogVersion(tag: string): void {
  state().lastShownChangelogVersion = tag;
  writeNow();
}

// New accessors (same pattern):
export function getBackfillNudgeShown(): boolean {
  return state().backfillNudgeShown ?? false;
}
export function setBackfillNudgeShown(): void {
  state().backfillNudgeShown = true;
  writeNow();   // synchronous merge-write — never clobbers other fields
}
```

**Merge invariant** (lines 64–70 — `Object.assign(state(), partial)` / `writeFileSync(SESSION_FILE, JSON.stringify(state()))`): `writeNow()` serializes the whole live `_state` mirror, so the new field coexists with `topicSlug`/`solutionsDir`/`lastShownChangelogVersion` without any special handling.

---

### `src/ui/keymap/commands/system.ts` (modify — two new `makeCommand` entries)

**Analog:** self (lines 40–171)

**`makeCommand` pattern to follow** (lines 95–116 — `git.openUi` and `git.remoteSync`):
```typescript
makeCommand({
  name: "git.openUi",
  title: "Open git UI (lazygit) in solutions dir",
  category: "System",
  short: "Git",
  run: () => {
    const r = getRenderer();
    if (r) handleOpenGitUi(r);
  },
}),
makeCommand({
  name: "git.remoteSync",
  title: "Sync solutions from GitHub (gh)",
  category: "System",
  run: () => handleOpenGitSync(),
}),
```

**New commands to add** (modeled on `git.remoteSync` for trigger + `update.dismiss` for no-op-when-inactive):
```typescript
makeCommand({
  name: "submissions.backfill",
  title: "Import submission history from LeetCode",
  category: "System",
  run: () => handleStartBackfill(),
}),
makeCommand({
  name: "submissions.cancelBackfill",
  title: "Cancel submission import",
  category: "System",
  // No-op when no backfill is running (mirrors update.dismiss comment, lines 127–130)
  run: () => handleCancelBackfill(),
}),
```

**Handler import** (mirrors lines 13–19 — import from `../../../views/browse/handlers`):
```typescript
import { handleStartBackfill, handleCancelBackfill } from "../../../views/browse/handlers";
```

**`CommandSpec` fields** (command.ts lines 15–24 — `name`, `title`, `category`, optional `short`/`group`):
- `category: "System"` — both commands are system-level
- No `group` — both should appear in the command palette (not `"modal"` or `"debug"`)
- `short` is optional; omit unless a footer label is wanted

---

### `src/ui/components/onboarding/BootFlow.tsx` (modify — one-time first-run nudge)

**Analog:** self (lines 140–158 — `shouldShowChangelog` + `setLastShownChangelogVersion` block)

**Exact changelog pattern to mirror** (lines 140–158):
```typescript
if (IS_RELEASE) {
  const lastShown = getLastShownChangelogVersion();
  if (shouldShowChangelog(VERSION, lastShown, useAppStore.getState().mode)) {
    fetchReleaseByTag(VERSION)
      .then((release) => {
        if (useAppStore.getState().mode === "browse") {
          useAppStore.getState().showChangelog(release);
        }
      })
      .catch(() => {});
  }
  // MUST stay unconditional: seeds a fresh install "caught up" AND marks update shown.
  setLastShownChangelogVersion(VERSION);
}
```

**Backfill nudge block to add** (after `syncIfEmpty` + `clearSyncProgress` — same position as changelog block):
```typescript
// One-time first-run backfill nudge (D-01/D-02). Mirrors the changelog block:
// - fires once and only once (setBackfillNudgeShown() is UNCONDITIONAL)
// - does not fire on fresh installs that already have submissions data
if (!getBackfillNudgeShown()) {
  const hasData = /* getDb().select().from(submissions).limit(1).all().length > 0 */ false;
  if (!hasData && useAppStore.getState().mode === "browse") {
    useAppStore.getState().showBackfillNudge();  // new uiSlice action
  }
  // MUST be unconditional — seeds "already shown" on first boot, prevents re-fire
  setBackfillNudgeShown();
}
```

**Key invariant** (mirrors the comment at lines 154–158):
- `setBackfillNudgeShown()` is called **outside** and **after** the `if (!hasData)` branch — always runs — so:
  - Fresh install: `backfillNudgeShown` is `undefined` → nudge may show → flag becomes `true`.
  - Subsequent launches: `backfillNudgeShown = true` → `getBackfillNudgeShown()` returns `true` → outer `if` short-circuits.
  - After backfill ran: `hasData = true` → nudge suppressed even if flag somehow false.

**Imports to add** (mirrors lines 29–33):
```typescript
import { getBackfillNudgeShown, setBackfillNudgeShown } from "../../../core/session";
import { submissions } from "../../../db/schema";
import { getDb } from "../../../db";
```

**`showBackfillNudge` action** must be added to `uiSlice.ts` (mirrors `showChangelog`/`hideChangelog` in `uiSlice.ts` — adds `backfillNudge: boolean` state + `showBackfillNudge()`/`hideBackfillNudge()` actions).

---

## Shared Patterns

### Never-Throws Service Contract
**Source:** `src/core/git.ts` lines 22–63
**Apply to:** `src/core/backfill.ts`

All exported async functions in `backfill.ts` must follow the `run()` → `toResult()` → discriminated-union pattern: wrap every `await` in a `try/catch`, return `BackfillResult` discriminated union, never re-throw. Mirrors git.ts's `run()` function (lines 38–56) exactly.

### Drizzle `onConflictDoNothing` Insert
**Source:** `src/db/questions.ts` (verified single-line usage)
**Apply to:** `src/db/submissions.ts`, every `insertSubmission` call in backfill service

```typescript
db.insert(submissions).values(row).onConflictDoNothing().run();
```
This is the universal safety net — no duplicate rows regardless of cursor state or retry (DATA-03).

### Transaction Batch Write
**Source:** `src/core/sync.ts` lines 9–31 (`persistPage`)
**Apply to:** `src/db/submissions.ts` `insertSubmissions`, `src/core/backfill.ts` per-page write

```typescript
getDb().transaction(() => {
  for (const row of rows) {
    getDb().insert(submissions).values(row).onConflictDoNothing().run();
  }
});
```
Never call `db.run()` in a bare loop without a transaction — WAL throughput and atomicity require it.

### `syncSlice` Progress Callback
**Source:** `src/ui/components/onboarding/BootFlow.tsx` lines 165–166
**Apply to:** backfill view handler (wherever `backfillSubmissions` is called)

```typescript
await syncIfEmpty((c, t) => useAppStore.getState().setSyncProgress(c, t));
useAppStore.getState().clearSyncProgress();
// Backfill mirrors:
await backfillSubmissions(
  (done, total) => useAppStore.getState().setSyncProgress(done, total),
  cancelRef,
);
useAppStore.getState().clearSyncProgress();  // also in finally block (Pitfall 6)
```

`<ProgressBar>` is already wired to `syncProgress` in both `BrowseView` and `ProblemView` — the backfill progress renders for free with zero new UI components (RESEARCH.md Pattern 7, verified).

### Session Merge-Write
**Source:** `src/core/session.ts` lines 46–53 (`writeNow`)
**Apply to:** `setBackfillNudgeShown` in `session.ts`

```typescript
function writeNow(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(state()));
  } catch {
    // Best-effort: a failed session save must never crash the UI.
  }
}
```
Every new `set*` accessor calls `writeNow()` directly (synchronous merge-write). The `state()` singleton ensures the full mirror is serialized — no field from another feature is clobbered.

### `makeCommand` Registration
**Source:** `src/ui/keymap/commands/system.ts` lines 40–50 + `src/ui/keymap/command.ts` lines 35–50
**Apply to:** two new commands in `system.ts`

```typescript
makeCommand({
  name: "submissions.backfill",   // dot-namespaced, lowercase
  title: "...",                    // sentence-case, shows in command palette
  category: "System",
  run: () => handlerFn(),
})
```
`makeCommand` wraps `run` in a try/catch that logs to the debug overlay — no explicit error handling needed in the `run` body beyond what the handler already does.

### Co-Located Test File Naming
**Source:** `src/db/recents.test.ts`
**Apply to:** `src/db/submissions.test.ts`

File lives beside the module it tests (`recents.ts` / `recents.test.ts`). Uses `bun:test` imports (`describe`, `test`, `expect`, `beforeEach`, `afterEach`). Each test opens a throwaway DB via `openDatabase(dbPath)` and closes it in `afterEach`. Never uses the singleton `getDb()` path from the app's `openDatabase()` call.

---

## No Analog Found

All files have close analogs. No entries in this category.

---

## Anti-Patterns (from RESEARCH.md — enforce in code review)

| Anti-Pattern | Why Forbidden | Correct Pattern |
|---|---|---|
| Bare loop inserts without transaction | Breaks WAL throughput, non-atomic | `getDb().transaction(() => {...})` |
| Storing timestamps as seconds | Phase 3 date arithmetic breaks (1970s dates) | `parseInt(raw.timestamp) * 1000` at insert |
| Hand-editing generated `.sql` migration | Hash mismatch in `embeddedMigrations()` | Re-run `bun run db:generate` |
| `useCache=true` on `gqlQuery` for submissions | Serves stale data on re-run | Omit third arg (defaults to `false`) |
| Throwing from `backfillSubmissions` | Breaks never-throws contract; UI has no handler | Return `BackfillResult { ok: false, ... }` |
| Append logic in `runSolution` | Runs have no `submission_id` | Only `submitSolution` gets append logic |
| Storing `lang` as human-readable name | Phase 2 display breaks | Store `langSlug` (e.g. `"python3"`, not `"Python 3"`) |
| `setBackfillNudgeShown()` inside `if (!hasData)` | Seeding deadlock — flag never set on skipped launch | Call `setBackfillNudgeShown()` **unconditionally** after the if block |

---

## Metadata

**Analog search scope:** `src/db/`, `src/core/`, `src/api/queries/`, `src/ui/keymap/commands/`, `src/ui/components/onboarding/`
**Files read:** 13 source files + 4 CLAUDE.md docs
**Pattern extraction date:** 2026-06-26
