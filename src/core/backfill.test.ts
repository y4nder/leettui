import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError } from "../api/client";
import type { ApiSubmission, SubmissionListData } from "../api/queries/submission-list";

// Stub the API layer entirely so tests never hit the network — a mutable
// `handler` lets each test drive a different response/throw sequence, mirroring
// src/views/browse/enterPopupProblem.test.ts's mock.module + dynamic-import
// pattern (the mock must be registered before backfill.ts is imported).
type Handler = (slug: string, offset: number) => Promise<SubmissionListData>;
let handler: Handler = async () => ({ submissionList: { hasNext: false, submissions: [] } });

mock.module("../api/queries/submission-list", () => ({
  fetchSubmissionList: (slug: string, offset: number) => handler(slug, offset),
}));

let openDatabase: typeof import("../db/index").openDatabase;
let closeDatabase: typeof import("../db/index").closeDatabase;
let getDb: typeof import("../db/index").getDb;
let upsertQuestion: typeof import("../db/questions").upsertQuestion;
let getSubmissionsForQuestion: typeof import("../db/submissions").getSubmissionsForQuestion;
let backfillSubmissions: typeof import("./backfill").backfillSubmissions;

beforeAll(async () => {
  ({ openDatabase, closeDatabase, getDb } = await import("../db/index"));
  ({ upsertQuestion } = await import("../db/questions"));
  ({ getSubmissionsForQuestion } = await import("../db/submissions"));
  ({ backfillSubmissions } = await import("./backfill"));
});

let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `leettui-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  openDatabase(dbPath);
  handler = async () => ({ submissionList: { hasNext: false, submissions: [] } });
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
});

// Seed an "attempted" question (status non-null) so it's picked up by the
// backfill's `status !== null` filter and its FK is satisfiable.
function seedAttempted(id: number, titleSlug: string): void {
  upsertQuestion({
    id,
    title: titleSlug,
    titleSlug,
    difficulty: "Easy",
    paidOnly: false,
    status: "notac",
    acRate: null,
  });
}

function fetchedAtFor(id: number): number | null {
  const rows = getDb().all<{ submissions_fetched_at: number | null }>(
    sql`SELECT submissions_fetched_at FROM questions WHERE id = ${id}`,
  );
  return rows[0]?.submissions_fetched_at ?? null;
}

function apiSub(
  id: number,
  titleSlug: string,
  overrides: Partial<ApiSubmission> = {},
): ApiSubmission {
  return {
    id: String(id),
    lang: "python3",
    timestamp: String(1_700_000_000 + id),
    statusDisplay: "Accepted",
    runtime: "5 ms",
    memory: "10 MB",
    title: titleSlug,
    titleSlug,
    isPending: "Not Pending",
    url: `/submissions/detail/${id}/`,
    ...overrides,
  };
}

describe("backfillSubmissions", () => {
  test("single page (hasNext:false) imports rows, sets the cursor, and never throws", async () => {
    seedAttempted(1, "two-sum");
    handler = async (slug, offset) => {
      expect(slug).toBe("two-sum");
      expect(offset).toBe(0);
      return {
        submissionList: {
          hasNext: false,
          submissions: [apiSub(100, "two-sum"), apiSub(101, "two-sum")],
        },
      };
    };

    expect(fetchedAtFor(1)).toBeNull();
    const result = await backfillSubmissions(undefined, undefined, 0);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
    }
    expect(getSubmissionsForQuestion(1)).toHaveLength(2);
    expect(fetchedAtFor(1)).not.toBeNull();
  });

  test("multi-page (hasNext:true then false) walks all pages with the inter-page delay applied", async () => {
    seedAttempted(1, "two-sum");
    const offsetsSeen: number[] = [];
    handler = async (_slug, offset) => {
      offsetsSeen.push(offset);
      if (offset === 0) {
        return { submissionList: { hasNext: true, submissions: [apiSub(1, "two-sum")] } };
      }
      return { submissionList: { hasNext: false, submissions: [apiSub(2, "two-sum")] } };
    };

    const start = Date.now();
    const DELAY = 30;
    const result = await backfillSubmissions(undefined, undefined, DELAY);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.imported).toBe(2);
    expect(offsetsSeen).toEqual([0, 1]);
    expect(elapsed).toBeGreaterThanOrEqual(DELAY);
    expect(getSubmissionsForQuestion(1)).toHaveLength(2);
  });

  test("progress callback fires once per completed question with (done, total)", async () => {
    seedAttempted(1, "two-sum");
    seedAttempted(2, "add-two-numbers");
    handler = async () => ({ submissionList: { hasNext: false, submissions: [] } });

    const calls: Array<[number, number]> = [];
    await backfillSubmissions((done, total) => calls.push([done, total]), undefined, 0);

    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  test("re-running after a full import inserts zero new rows (idempotent top-up, D-06)", async () => {
    seedAttempted(1, "two-sum");
    handler = async () => ({
      submissionList: { hasNext: false, submissions: [apiSub(100, "two-sum")] },
    });

    const first = await backfillSubmissions(undefined, undefined, 0);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.imported).toBe(1);
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);

    // Re-run: the stub returns the exact same (already-seen) submission.
    const second = await backfillSubmissions(undefined, undefined, 0);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.imported).toBe(0);
      expect(second.skipped).toBe(1);
    }
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);
  });

  test("AuthError returns reason:'auth-error', never throws, and keeps rows already written", async () => {
    seedAttempted(1, "two-sum");
    seedAttempted(2, "add-two-numbers");
    handler = async (slug) => {
      if (slug === "two-sum") {
        return { submissionList: { hasNext: false, submissions: [apiSub(1, "two-sum")] } };
      }
      throw new AuthError(401);
    };

    const result = await backfillSubmissions(undefined, undefined, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth-error");
      expect(result.imported).toBe(1);
    }
    // Partial data from the first (successful) question is preserved.
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);
  });

  test("a 429 that persists past retries returns reason:'rate-limited' without throwing", async () => {
    seedAttempted(1, "two-sum");
    let calls = 0;
    handler = async () => {
      calls++;
      throw new Error("GraphQL request failed: 429 Too Many Requests");
    };

    const result = await backfillSubmissions(undefined, undefined, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate-limited");
      expect(result.imported).toBe(0);
    }
    // Backoff retried multiple times before giving up.
    expect(calls).toBeGreaterThan(1);
  });

  test("a generic thrown Error returns reason:'network-error' without throwing", async () => {
    seedAttempted(1, "two-sum");
    handler = async () => {
      throw new Error("fetch failed: ECONNRESET");
    };

    const result = await backfillSubmissions(undefined, undefined, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("network-error");
      expect(result.imported).toBe(0);
    }
  });

  test("cancelling between pages returns reason:'cancelled' and keeps already-written rows", async () => {
    seedAttempted(1, "two-sum");
    const cancelRef = { cancelled: false };
    handler = async (_slug, offset) => {
      if (offset === 0) {
        cancelRef.cancelled = true; // simulate the user cancelling right after page 1 lands
        return { submissionList: { hasNext: true, submissions: [apiSub(1, "two-sum")] } };
      }
      // Should never be reached — cancellation must stop before the next page.
      return { submissionList: { hasNext: false, submissions: [apiSub(2, "two-sum")] } };
    };

    const result = await backfillSubmissions(undefined, cancelRef, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("cancelled");
      expect(result.imported).toBe(1);
    }
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);
  });

  test("a submission with no matching local question (unknown titleSlug) is skipped, no FK crash", async () => {
    seedAttempted(1, "two-sum");
    handler = async () => ({
      submissionList: {
        hasNext: false,
        // "ghost-slug" has no local question row — must not crash the FK.
        submissions: [apiSub(1, "two-sum"), apiSub(2, "ghost-slug")],
      },
    });

    const result = await backfillSubmissions(undefined, undefined, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
    }
    expect(getSubmissionsForQuestion(1)).toHaveLength(1);
  });

  test("never throws on any failure path — every case resolves to an { ok:false } result", async () => {
    seedAttempted(1, "two-sum");
    const throwers = [
      () => new AuthError(403),
      () => new Error("GraphQL request failed: 429 rate limited"),
      () => new Error("network is down"),
    ];

    for (const makeError of throwers) {
      handler = async () => {
        throw makeError();
      };
      const result = await backfillSubmissions(undefined, undefined, 0);
      expect(result.ok).toBe(false);
    }
  });
});
