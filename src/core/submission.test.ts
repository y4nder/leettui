// Append-on-submit coverage (D-08 — every verdict, not just accepted). Tests the
// pure append helper directly against a throwaway DB rather than driving
// submitSolution end-to-end (which would need live network calls) — mirrors
// db/submissions.test.ts's throwaway-DB harness.
//
// The capture branching helpers (`captureFromSubmitResult`/`captureFromRunResult`,
// Phase 2.2) are pure enough to test the same way: a throwaway DB row (for the
// `DbQuestion` shape) plus a real temp `tests/` dir (since `captureFailingCase`/
// `blessRunOutputs` are dir-injected fs writers, not mocked).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "../db";
import { upsertQuestion, type DbQuestion } from "../db/questions";
import { getSubmissionsForQuestion } from "../db/submissions";
import type { CheckResponse, ParsedResponse } from "../api/types";
import {
  appendSubmissionRecord,
  captureFromRunResult,
  captureFromSubmitResult,
  statusDisplayFromCode,
} from "./submission";

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

// Capture branching helpers (Phase 2.2, TCASE-04/TCASE-05). Both are
// `testsDir`-injected pure functions — a real temp dir (not the configured
// solutions dir) so the writers underneath (`captureFailingCase`/
// `blessRunOutputs`) exercise real fs behavior without touching user data.
describe("captureFromSubmitResult", () => {
  let testsDir: string;

  beforeEach(() => {
    testsDir = mkdtempSync(join(tmpdir(), "leettui-capture-"));
  });

  afterEach(() => {
    rmSync(testsDir, { recursive: true, force: true });
  });

  test("submit_wrong_answer captures a new failing case (D-01)", () => {
    const result: ParsedResponse = {
      type: "submit_wrong_answer",
      data: checkData({ last_testcase: "[1,2,3]", expected_output: "6" }),
    };

    const notes = captureFromSubmitResult(testsDir, result);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Captured");
    const files = readdirSync(testsDir);
    expect(files).toContain("case-01.txt");
    expect(files).toContain("case-01.out");
    expect(readFileSync(join(testsDir, "case-01.txt"), "utf-8")).toBe("[1,2,3]");
    expect(readFileSync(join(testsDir, "case-01.out"), "utf-8")).toBe("6");
  });

  test("runtime_error with last_testcase captures input-only (D-03)", () => {
    const result: ParsedResponse = {
      type: "runtime_error",
      data: checkData({ last_testcase: "[]" }),
    };

    const notes = captureFromSubmitResult(testsDir, result);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("input only");
    expect(existsSync(join(testsDir, "case-01.txt"))).toBe(true);
    expect(existsSync(join(testsDir, "case-01.out"))).toBe(false);
  });

  test("time_limit_exceeded / memory_limit_exceeded also capture input-only (D-03)", () => {
    for (const type of ["time_limit_exceeded", "memory_limit_exceeded"] as const) {
      const notes = captureFromSubmitResult(testsDir, {
        type,
        data: checkData({ last_testcase: `input-${type}` }),
      });
      expect(notes).toHaveLength(1);
    }
  });

  test("a verdict with no last_testcase captures nothing", () => {
    const result: ParsedResponse = {
      type: "runtime_error",
      data: checkData({}), // no last_testcase
    };
    expect(captureFromSubmitResult(testsDir, result)).toEqual([]);
    expect(readdirSync(testsDir)).toEqual([]);
  });

  test("submit_accepted captures nothing", () => {
    const result: ParsedResponse = {
      type: "submit_accepted",
      data: checkData({ status_code: 10 }),
    };
    expect(captureFromSubmitResult(testsDir, result)).toEqual([]);
  });

  test("compile_error / pending / timeout / unknown capture nothing", () => {
    expect(
      captureFromSubmitResult(testsDir, { type: "compile_error", data: checkData({}) }),
    ).toEqual([]);
    expect(captureFromSubmitResult(testsDir, { type: "pending" })).toEqual([]);
    expect(captureFromSubmitResult(testsDir, { type: "timeout", statusCode: 0 })).toEqual([]);
    expect(captureFromSubmitResult(testsDir, { type: "unknown", statusCode: 999 })).toEqual([]);
  });

  // Pitfall 5 (T-02.2-04): a capture/write failure must never turn a
  // successful submit into an error — the call site wraps the invocation in
  // its own try/catch. Simulate the underlying writer throwing by pointing
  // `testsDir` at a path that collides with an existing *file* (not a dir),
  // so any fs write beneath it throws ENOTDIR.
  test("a throwing writer degrades to no notes, never propagates (Pitfall 5)", () => {
    const collidingFile = join(testsDir, "not-a-directory");
    writeFileSync(collidingFile, "x");
    const bogusDir = join(collidingFile, "tests"); // parent is a file, not a dir

    const result: ParsedResponse = {
      type: "submit_wrong_answer",
      data: checkData({ last_testcase: "[1]", expected_output: "1" }),
    };

    let captureNotes: string[] = [];
    try {
      captureNotes = captureFromSubmitResult(bogusDir, result);
    } catch {
      captureNotes = [];
    }
    expect(captureNotes).toEqual([]);
  });
});

describe("captureFromRunResult", () => {
  let testsDir: string;

  beforeEach(() => {
    testsDir = mkdtempSync(join(tmpdir(), "leettui-bless-"));
    mkdirSync(testsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testsDir, { recursive: true, force: true });
  });

  test("run_accepted blesses missing .out for a seeded case, matched by content (D-02, D-07)", () => {
    writeFileSync(join(testsDir, "case-01.txt"), "[1,2,3]");

    const result: ParsedResponse = {
      type: "run_accepted",
      data: checkData({ expected_code_answer: ["6"] }),
    };

    const notes = captureFromRunResult(testsDir, ["[1,2,3]"], result);

    expect(notes).toEqual(["Blessed 1 expected output(s)"]);
    expect(readFileSync(join(testsDir, "case-01.out"), "utf-8")).toBe("6");
  });

  test("run_wrong_answer also blesses (D-02 fires regardless of verdict)", () => {
    writeFileSync(join(testsDir, "case-01.txt"), "[4,5]");
    const result: ParsedResponse = {
      type: "run_wrong_answer",
      data: checkData({ expected_code_answer: ["9"] }),
    };
    expect(captureFromRunResult(testsDir, ["[4,5]"], result)).toEqual([
      "Blessed 1 expected output(s)",
    ]);
  });

  test("a non-run type captures nothing", () => {
    const result: ParsedResponse = {
      type: "submit_accepted",
      data: checkData({ expected_code_answer: ["6"] }),
    };
    expect(captureFromRunResult(testsDir, ["[1,2,3]"], result)).toEqual([]);
  });

  test("no expected_code_answer captures nothing", () => {
    const result: ParsedResponse = { type: "run_accepted", data: checkData({}) };
    expect(captureFromRunResult(testsDir, ["[1,2,3]"], result)).toEqual([]);
  });
});
