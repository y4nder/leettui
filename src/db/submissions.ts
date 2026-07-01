import { desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { questions, submissions } from "./schema";

// A single submission attempt (any verdict — D-08). Keyed by LeetCode's own
// `submissionId`, so re-inserting the same id is a safe no-op regardless of
// caller (backfill re-run, retry, or live append-on-submit).
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

// Idempotent single insert (DATA-01/DATA-03 dedupe safety net). Callers must
// resolve `questionId` from the local DB first — the FK is enforced
// (`PRAGMA foreign_keys = ON`), so a row for an unknown question throws.
export function insertSubmission(row: DbSubmission): void {
  getDb().insert(submissions).values(row).onConflictDoNothing().run();
}

// Idempotent multi-row insert, wrapped in a single transaction (WAL
// throughput + atomicity) — never a bare loop outside a transaction. Mirrors
// `core/sync.ts`'s `persistPage` pattern. Despite the name, each row is still
// its own `INSERT` statement rather than one batched multi-row `VALUES (...),
// (...), ...` — the transaction wrapping is what makes the whole call atomic.
export function insertSubmissions(rows: DbSubmission[]): void {
  getDb().transaction(() => {
    for (const row of rows) {
      getDb().insert(submissions).values(row).onConflictDoNothing().run();
    }
  });
}

// Per-question history, newest-first — the shape Phase 2's per-problem panel
// reads directly.
export function getSubmissionsForQuestion(questionId: number): DbSubmission[] {
  return getDb()
    .select()
    .from(submissions)
    .where(eq(submissions.questionId, questionId))
    .orderBy(desc(submissions.submittedAt))
    .all();
}

// D-07 cursor write: resume marker for an interrupted backfill run and the
// high-water mark for a completed one. `now` is injectable for deterministic
// tests.
export function setSubmissionsFetchedAt(questionId: number, now: number = Date.now()): void {
  getDb()
    .update(questions)
    .set({ submissionsFetchedAt: now })
    .where(eq(questions.id, questionId))
    .run();
}
