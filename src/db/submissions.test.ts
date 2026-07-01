import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, getDb, openDatabase } from "./index";
import { upsertQuestion } from "./questions";
import {
  type DbSubmission,
  getSubmissionsForQuestion,
  insertSubmission,
  insertSubmissions,
  setSubmissionsFetchedAt,
} from "./submissions";

let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `leettui-submissions-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
});

// Seed a question so its PK exists (submissions references questions.id under
// FK ON) — mirrors recents.test.ts's `seed`.
function seedQuestion(id: number): void {
  upsertQuestion({
    id,
    title: `Question ${id}`,
    titleSlug: `question-${id}`,
    difficulty: "Easy",
    paidOnly: false,
    status: null,
    acRate: null,
  });
}

function makeSubmission(overrides: Partial<DbSubmission> = {}): DbSubmission {
  return {
    submissionId: 1,
    questionId: 1,
    titleSlug: "question-1",
    lang: "python3",
    statusDisplay: "Accepted",
    runtime: "52 ms",
    memory: "16.4 MB",
    submittedAt: 1000,
    runtimePercentile: null,
    memoryPercentile: null,
    ...overrides,
  };
}

// Migration-apply test (Task 2, BLOCKING): opens a real fresh DB so
// `openDatabase` applies the embedded migrations at runtime — this asserts
// the table/indexes/column actually exist, not merely that types compile.
describe("submissions migration", () => {
  test("submissions table exists and is queryable", () => {
    const rows = getDb().all(sql`SELECT * FROM submissions`);
    expect(rows).toEqual([]);
  });

  test("questions table has submissions_fetched_at column", () => {
    const columns = getDb().all<{ name: string }>(sql`PRAGMA table_info(questions)`);
    const names = columns.map((c) => c.name);
    expect(names).toContain("submissions_fetched_at");
  });

  test("submissions table has both indexes", () => {
    const indexes = getDb().all<{ name: string }>(sql`PRAGMA index_list(submissions)`);
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_sub_question_time");
    expect(names).toContain("idx_sub_submitted_at");
  });
});

describe("submissions CRUD", () => {
  test("no submissions returns empty array", () => {
    seedQuestion(1);
    expect(getSubmissionsForQuestion(1)).toEqual([]);
  });

  test("inserting a submission makes it readable with all fields intact", () => {
    seedQuestion(1);
    const row = makeSubmission({
      submissionId: 42,
      questionId: 1,
      runtimePercentile: 87.5,
      memoryPercentile: 42.1,
    });
    insertSubmission(row);
    const rows = getSubmissionsForQuestion(1);
    expect(rows).toEqual([row]);
  });

  test("re-inserting the same submissionId is a no-op (dedupe)", () => {
    seedQuestion(1);
    const row = makeSubmission({ submissionId: 42, questionId: 1 });
    insertSubmission(row);
    insertSubmission({ ...row, statusDisplay: "Wrong Answer" });
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);
  });

  test("batch insert dedupes duplicate submissionIds within and across calls", () => {
    seedQuestion(1);
    const row = makeSubmission({ submissionId: 42, questionId: 1 });
    insertSubmissions([row, row]);
    insertSubmissions([row]);
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);
  });

  test("returns rows newest-first by submittedAt", () => {
    seedQuestion(1);
    insertSubmissions([
      makeSubmission({ submissionId: 1, questionId: 1, submittedAt: 100 }),
      makeSubmission({ submissionId: 2, questionId: 1, submittedAt: 300 }),
      makeSubmission({ submissionId: 3, questionId: 1, submittedAt: 200 }),
    ]);
    expect(getSubmissionsForQuestion(1).map((r) => r.submissionId)).toEqual([2, 3, 1]);
  });

  test("setSubmissionsFetchedAt writes the cursor onto questions", () => {
    seedQuestion(1);
    const before = getDb().all<{ submissions_fetched_at: number | null }>(
      sql`SELECT submissions_fetched_at FROM questions WHERE id = 1`,
    );
    expect(before[0]?.submissions_fetched_at).toBeNull();

    setSubmissionsFetchedAt(1, 12345);

    const after = getDb().all<{ submissions_fetched_at: number | null }>(
      sql`SELECT submissions_fetched_at FROM questions WHERE id = 1`,
    );
    expect(after[0]?.submissions_fetched_at).toBe(12345);
  });

  test("inserting a row with an unknown questionId throws a FOREIGN KEY error", () => {
    // No seedQuestion — questionId 999 does not exist locally.
    expect(() => insertSubmission(makeSubmission({ submissionId: 1, questionId: 999 }))).toThrow(
      /FOREIGN KEY/i,
    );
  });
});
