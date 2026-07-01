import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, getDb, openDatabase } from "./index";

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
