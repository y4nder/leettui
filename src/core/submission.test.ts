// Append-on-submit coverage (D-08 — every verdict, not just accepted). Tests the
// pure append helper directly against a throwaway DB rather than driving
// submitSolution end-to-end (which would need live network calls) — mirrors
// db/submissions.test.ts's throwaway-DB harness.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "../db";
import { upsertQuestion, type DbQuestion } from "../db/questions";
import { getSubmissionsForQuestion } from "../db/submissions";
import type { CheckResponse, ParsedResponse } from "../api/types";
import { appendSubmissionRecord, statusDisplayFromCode } from "./submission";

let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `leettui-submission-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
});

function seedQuestion(id: number): DbQuestion {
  upsertQuestion({
    id,
    title: `Q ${id}`,
    titleSlug: `q-${id}`,
    difficulty: "Easy",
    paidOnly: false,
    status: null,
    acRate: null,
  });
  return {
    id,
    title: `Q ${id}`,
    title_slug: `q-${id}`,
    difficulty: "Easy",
    paid_only: 0,
    status: null,
    ac_rate: null,
    last_runtime: null,
    last_memory: null,
  };
}

function checkData(overrides: Partial<CheckResponse> = {}): CheckResponse {
  return { state: "SUCCESS", ...overrides };
}

describe("statusDisplayFromCode", () => {
  test("maps every known status code", () => {
    expect(statusDisplayFromCode(10)).toBe("Accepted");
    expect(statusDisplayFromCode(11)).toBe("Wrong Answer");
    expect(statusDisplayFromCode(12)).toBe("Memory Limit Exceeded");
    expect(statusDisplayFromCode(13)).toBe("Output Limit Exceeded");
    expect(statusDisplayFromCode(14)).toBe("Time Limit Exceeded");
    expect(statusDisplayFromCode(15)).toBe("Runtime Error");
    expect(statusDisplayFromCode(20)).toBe("Compile Error");
    expect(statusDisplayFromCode(30)).toBe("Timeout");
  });

  test("falls back to a sane default for an unknown code", () => {
    expect(statusDisplayFromCode(999)).toBe("Unknown");
  });
});

describe("appendSubmissionRecord", () => {
  test("an accepted submit inserts one row with percentiles populated", () => {
    const q = seedQuestion(1);
    const result: ParsedResponse = {
      type: "submit_accepted",
      data: checkData({
        submission_id: "111",
        status_code: 10,
        status_msg: "Accepted",
        status_runtime: "5 ms",
        status_memory: "10 MB",
        runtime_percentile: 90.1,
        memory_percentile: 50.2,
      }),
    };

    appendSubmissionRecord(q, "python3", result);

    const rows = getSubmissionsForQuestion(q.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      submissionId: 111,
      questionId: q.id,
      titleSlug: "q-1",
      lang: "python3",
      statusDisplay: "Accepted",
      runtime: "5 ms",
      memory: "10 MB",
      runtimePercentile: 90.1,
      memoryPercentile: 50.2,
    });
  });

  test("a non-accepted submit verdict also inserts a row (D-08), falling back to the code mapper", () => {
    const q = seedQuestion(2);
    const result: ParsedResponse = {
      type: "submit_wrong_answer",
      data: checkData({ submission_id: "222", status_code: 11 }),
    };

    appendSubmissionRecord(q, "javascript", result);

    const rows = getSubmissionsForQuestion(q.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.statusDisplay).toBe("Wrong Answer");
  });

  test("prefers status_msg over the code mapper when the API supplies it", () => {
    const q = seedQuestion(3);
    const result: ParsedResponse = {
      type: "compile_error",
      data: checkData({ submission_id: "333", status_code: 20, status_msg: "Compile Error" }),
    };

    appendSubmissionRecord(q, "rust", result);

    const rows = getSubmissionsForQuestion(q.id);
    expect(rows[0]?.statusDisplay).toBe("Compile Error");
  });

  test("a pending result (no submission_id) inserts nothing", () => {
    const q = seedQuestion(4);
    appendSubmissionRecord(q, "python3", { type: "pending" });
    expect(getSubmissionsForQuestion(q.id)).toHaveLength(0);
  });

  test("timeout/unknown results (no data field at all) insert nothing", () => {
    const q = seedQuestion(5);
    appendSubmissionRecord(q, "python3", { type: "timeout", statusCode: 0 });
    appendSubmissionRecord(q, "python3", { type: "unknown", statusCode: 999 });
    expect(getSubmissionsForQuestion(q.id)).toHaveLength(0);
  });

  test("a run-shaped result with no submission_id in its data inserts nothing", () => {
    const q = seedQuestion(6);
    const result: ParsedResponse = {
      type: "run_accepted",
      data: checkData({ status_code: 10 }), // no submission_id — a run's interpret_id path
    };
    appendSubmissionRecord(q, "python3", result);
    expect(getSubmissionsForQuestion(q.id)).toHaveLength(0);
  });
});
