import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "./index";
import { upsertQuestion } from "./questions";
import { getRecents, recordRecent } from "./recents";

let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `leettui-recents-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
});

// Seed a question so its PK exists (recents references questions.id under FK ON).
function seed(id: number): void {
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

describe("recents", () => {
  test("empty history returns no rows", () => {
    expect(getRecents()).toEqual([]);
  });

  test("records a viewed question", () => {
    seed(1);
    recordRecent(1);
    const rows = getRecents();
    expect(rows.map((q) => q.id)).toEqual([1]);
    expect(rows[0]?.title).toBe("Question 1");
  });

  test("orders newest-first", () => {
    seed(1);
    seed(2);
    seed(3);
    recordRecent(1, 100);
    recordRecent(2, 200);
    recordRecent(3, 300);
    expect(getRecents().map((q) => q.id)).toEqual([3, 2, 1]);
  });

  test("re-viewing bumps to top without duplicating", () => {
    seed(1);
    seed(2);
    seed(3);
    recordRecent(1, 100);
    recordRecent(2, 200);
    recordRecent(3, 300);
    // Re-view the oldest — it should jump to the front, list stays length 3.
    recordRecent(1, 400);
    expect(getRecents().map((q) => q.id)).toEqual([1, 3, 2]);
  });

  test("trims to the cap, dropping the oldest", () => {
    for (let id = 1; id <= 5; id++) {
      seed(id);
      recordRecent(id, id * 100, 3);
    }
    // cap=3 keeps the three newest (5, 4, 3); 1 and 2 are trimmed.
    expect(getRecents().map((q) => q.id)).toEqual([5, 4, 3]);
  });

  test("re-view past the cap keeps the bumped row and trims the next-oldest", () => {
    for (let id = 1; id <= 3; id++) {
      seed(id);
      recordRecent(id, id * 100, 3);
    }
    // History is [3, 2, 1]. Bump 1 to the top, then add a new id 4 — with cap 3,
    // the now-oldest (2) is trimmed, not the freshly-bumped 1.
    recordRecent(1, 400, 3);
    seed(4);
    recordRecent(4, 500, 3);
    expect(getRecents().map((q) => q.id)).toEqual([4, 1, 3]);
  });
});
