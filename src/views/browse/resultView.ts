import type { ParsedResponse } from "../../api/types";
import type { LocalRunReport, CaseStatus } from "../../core/testRunner";

export type ResultKind = "accepted" | "wrong" | "error" | "info" | "pending";

export interface ResultMetric {
  label: string;
  value: string;
  subtle?: string;
}

export interface ResultDiff {
  testcase?: string;
  expected: string;
  actual: string;
}

export interface ResultCase {
  name: string;
  status: CaseStatus;
  expected?: string;
  actual?: string;
}

export interface ResultView {
  kind: ResultKind;
  title: string;
  metrics?: ResultMetric[];
  diff?: ResultDiff;
  error?: string;
  outputs?: { label: string; value: string }[];
  cases?: ResultCase[];
}

export function info(title: string): ResultView {
  return { kind: "info", title };
}

export function errorView(title: string, error?: string): ResultView {
  return { kind: "error", title, error };
}

function pickError(short: string | undefined, full: string | undefined): string {
  return full ?? short ?? "Unknown error";
}

function pairOutputs(
  actual: string[] | undefined,
  expected: string[] | undefined
): { label: string; value: string }[] {
  const a = (actual ?? []).filter((s) => s !== "");
  const e = (expected ?? []).filter((s) => s !== "");
  const out: { label: string; value: string }[] = [];
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== undefined) out.push({ label: `Output ${i + 1}`, value: a[i]! });
    if (e[i] !== undefined) out.push({ label: `Expected ${i + 1}`, value: e[i]! });
  }
  return out;
}

export function buildResultView(result: ParsedResponse): ResultView {
  switch (result.type) {
    case "pending":
      return { kind: "pending", title: "Still pending..." };

    case "run_accepted": {
      const d = result.data;
      return {
        kind: "accepted",
        title: "✓ Run Accepted",
        metrics: [
          { label: "Runtime", value: d.status_runtime ?? "N/A" },
          { label: "Memory", value: d.status_memory ?? "N/A" },
          {
            label: "Tests",
            value: `${d.total_correct ?? 0}/${d.total_testcases ?? 0}`,
          },
        ],
        outputs: (d.code_answer ?? [])
          .filter((a) => a !== "")
          .map((a, i) => ({ label: `Output ${i + 1}`, value: a })),
      };
    }

    case "run_wrong_answer": {
      const d = result.data;
      return {
        kind: "wrong",
        title: "✗ Wrong Answer (Run)",
        metrics: [
          {
            label: "Tests",
            value: `${d.total_correct ?? 0}/${d.total_testcases ?? 0}`,
          },
        ],
        outputs: pairOutputs(d.code_answer, d.expected_code_answer),
      };
    }

    case "submit_accepted": {
      const d = result.data;
      const runtimePct =
        d.runtime_percentile !== undefined
          ? `faster than ${d.runtime_percentile.toFixed(1)}%`
          : undefined;
      const memoryPct =
        d.memory_percentile !== undefined
          ? `less than ${d.memory_percentile.toFixed(1)}%`
          : undefined;
      return {
        kind: "accepted",
        title: "✓ Accepted!",
        metrics: [
          {
            label: "Runtime",
            value: d.status_runtime ?? "N/A",
            subtle: runtimePct,
          },
          {
            label: "Memory",
            value: d.status_memory ?? "N/A",
            subtle: memoryPct,
          },
        ],
      };
    }

    case "submit_wrong_answer": {
      const d = result.data;
      return {
        kind: "wrong",
        title: "✗ Wrong Answer",
        metrics: [
          {
            label: "Tests",
            value: `${d.total_correct ?? 0}/${d.total_testcases ?? 0}`,
          },
        ],
        diff: {
          testcase: d.last_testcase ?? undefined,
          expected: d.expected_output ?? "N/A",
          actual: d.code_output ?? "N/A",
        },
      };
    }

    case "compile_error":
      return {
        kind: "error",
        title: "✗ Compile Error",
        error: pickError(result.data.compile_error, result.data.full_compile_error),
      };

    case "runtime_error":
      return {
        kind: "error",
        title: "✗ Runtime Error",
        error: pickError(result.data.runtime_error, result.data.full_runtime_error),
      };

    case "time_limit_exceeded":
      return { kind: "error", title: "✗ Time Limit Exceeded" };
    case "memory_limit_exceeded":
      return { kind: "error", title: "✗ Memory Limit Exceeded" };
    case "output_limit_exceeded":
      return { kind: "error", title: "✗ Output Limit Exceeded" };
    case "internal_error":
      return { kind: "error", title: "✗ Internal Error (LeetCode server error)" };
    case "timeout":
      return { kind: "error", title: "✗ Timeout (polling exceeded)" };
    case "unknown":
      return {
        kind: "error",
        title: `✗ Unknown status (code: ${result.statusCode})`,
      };
  }
}

// Turns a local-runner report into a ResultView. The verdict hinges on whether
// any case had a `.out` to compare against: with no expected outputs, the run
// is informational (kind "info"), never a green pass.
export function buildLocalRunView(report: LocalRunReport): ResultView {
  switch (report.kind) {
    case "unsupported":
      return info(`Local run not supported for ${report.langSlug} (no harness generator).`);
    case "no-harness":
      return errorView(
        `No ${report.harnessFilename} found in the ${report.langSlug} folder — cannot run locally.`
      );
    case "no-cases":
      return info("No test cases. Add tests/case-NN.txt (e.g. by recreating the solution).");
    case "ran": {
      const { cases } = report;
      const verdicts = cases.filter((c) => c.status === "pass" || c.status === "fail");
      const passed = cases.filter((c) => c.status === "pass").length;
      const hasVerdict = verdicts.length > 0;

      const kind: ResultKind = hasVerdict
        ? passed === verdicts.length
          ? "accepted"
          : "wrong"
        : "info";

      const title = hasVerdict
        ? `${passed === verdicts.length ? "✓" : "✗"} Local: ${passed}/${verdicts.length} passed`
        : `Ran ${cases.length} case${cases.length === 1 ? "" : "s"} (no expected outputs)`;

      const metrics: ResultMetric[] = hasVerdict
        ? [{ label: "Passed", value: `${passed}/${verdicts.length}` }]
        : [];

      return { kind, title, metrics, cases };
    }
  }
}
