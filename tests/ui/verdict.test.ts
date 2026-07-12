import { describe, expect, test } from "bun:test";
import {
  langAbbrev,
  parseRuntimeMs,
  summarizeAcRuntime,
  verdictColor,
  verdictGlyph,
} from "@/ui/verdict";
import { colors } from "@/ui/theme";
import type { DbSubmission } from "@/db/submissions";

// Mirrors db/submissions.test.ts's makeSubmission fixture shape.
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

describe("verdictColor", () => {
  test("Accepted -> success", () => {
    expect(verdictColor("Accepted")).toBe(colors.success);
  });

  test("Time Limit Exceeded -> warn", () => {
    expect(verdictColor("Time Limit Exceeded")).toBe(colors.warn);
  });

  test("Wrong Answer -> error", () => {
    expect(verdictColor("Wrong Answer")).toBe(colors.error);
  });

  test("Runtime Error -> error", () => {
    expect(verdictColor("Runtime Error")).toBe(colors.error);
  });

  test("Memory Limit Exceeded -> error", () => {
    expect(verdictColor("Memory Limit Exceeded")).toBe(colors.error);
  });

  test("Compile Error -> subtle", () => {
    expect(verdictColor("Compile Error")).toBe(colors.subtle);
  });

  test("an unmapped string -> fgDim fallback, never throws", () => {
    expect(verdictColor("Internal Error")).toBe(colors.fgDim);
  });
});

describe("verdictGlyph", () => {
  test("Accepted -> check", () => {
    expect(verdictGlyph("Accepted")).toBe("✓");
  });

  test("Wrong Answer -> cross", () => {
    expect(verdictGlyph("Wrong Answer")).toBe("✗");
  });
});

describe("parseRuntimeMs", () => {
  test("'52 ms' -> 52", () => {
    expect(parseRuntimeMs("52 ms")).toBe(52);
  });

  test("'45ms' (no space) -> 45", () => {
    expect(parseRuntimeMs("45ms")).toBe(45);
  });

  test("null -> null", () => {
    expect(parseRuntimeMs(null)).toBeNull();
  });

  test("'N/A' -> null, never throws", () => {
    expect(parseRuntimeMs("N/A")).toBeNull();
  });

  test("'1.5 s' (non-ms unit) -> null (narrow ms-only parser)", () => {
    expect(parseRuntimeMs("1.5 s")).toBeNull();
  });
});

describe("langAbbrev", () => {
  test("python3 -> py3", () => {
    expect(langAbbrev("python3")).toBe("py3");
  });

  test("javascript -> js", () => {
    expect(langAbbrev("javascript")).toBe("js");
  });

  test("an unmapped slug falls back to the raw slug", () => {
    expect(langAbbrev("brainfuck")).toBe("brainfuck");
  });
});

describe("summarizeAcRuntime", () => {
  test("fewer than 2 parseable AC rows -> null", () => {
    expect(summarizeAcRuntime([])).toBeNull();
    expect(
      summarizeAcRuntime([makeSubmission({ statusDisplay: "Accepted", runtime: "40 ms" })]),
    ).toBeNull();
  });

  test("prior best 42ms, latest 38ms -> improved", () => {
    // newest-first: latest (38ms) first, prior best (42ms) second.
    const rows = [
      makeSubmission({
        submissionId: 2,
        statusDisplay: "Accepted",
        runtime: "38 ms",
        submittedAt: 200,
      }),
      makeSubmission({
        submissionId: 1,
        statusDisplay: "Accepted",
        runtime: "42 ms",
        submittedAt: 100,
      }),
    ];
    expect(summarizeAcRuntime(rows)).toEqual({ bestMs: 42, latestMs: 38, direction: "improved" });
  });

  test("a slower re-solve -> regressed", () => {
    const rows = [
      makeSubmission({
        submissionId: 2,
        statusDisplay: "Accepted",
        runtime: "50 ms",
        submittedAt: 200,
      }),
      makeSubmission({
        submissionId: 1,
        statusDisplay: "Accepted",
        runtime: "30 ms",
        submittedAt: 100,
      }),
    ];
    expect(summarizeAcRuntime(rows)).toEqual({ bestMs: 30, latestMs: 50, direction: "regressed" });
  });

  test("an equal runtime -> matched", () => {
    const rows = [
      makeSubmission({
        submissionId: 2,
        statusDisplay: "Accepted",
        runtime: "40 ms",
        submittedAt: 200,
      }),
      makeSubmission({
        submissionId: 1,
        statusDisplay: "Accepted",
        runtime: "40 ms",
        submittedAt: 100,
      }),
    ];
    expect(summarizeAcRuntime(rows)).toEqual({ bestMs: 40, latestMs: 40, direction: "matched" });
  });

  test("non-AC and unparseable rows are excluded from the computation", () => {
    const rows = [
      // latest AC (38ms)
      makeSubmission({
        submissionId: 4,
        statusDisplay: "Accepted",
        runtime: "38 ms",
        submittedAt: 400,
      }),
      // a WA in between — excluded
      makeSubmission({
        submissionId: 3,
        statusDisplay: "Wrong Answer",
        runtime: "10 ms",
        submittedAt: 300,
      }),
      // an AC with an unparseable runtime — excluded
      makeSubmission({
        submissionId: 2,
        statusDisplay: "Accepted",
        runtime: "N/A",
        submittedAt: 200,
      }),
      // prior AC (42ms)
      makeSubmission({
        submissionId: 1,
        statusDisplay: "Accepted",
        runtime: "42 ms",
        submittedAt: 100,
      }),
    ];
    expect(summarizeAcRuntime(rows)).toEqual({ bestMs: 42, latestMs: 38, direction: "improved" });
  });
});
