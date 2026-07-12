import type { DbQuestion } from "@/db/questions";
import { markAccepted, markAttempted, setSubmissionStats } from "@/db/questions";
import type { ParsedResponse } from "@/api/types";
import { fetchEditorData } from "@/api/queries/editor-data";
import { fetchConsolePanelConfig } from "@/api/queries/console-panel-config";
import { runCode } from "@/api/rest/run";
import { submitCode } from "@/api/rest/submit";
import { pollResult } from "@/api/rest/check";
import {
  readSolutionFile,
  getTestsDir,
  captureFailingCase,
  blessRunOutputs,
} from "@/core/solutions";
import { insertSubmission } from "@/db/submissions";

export class SolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolutionError";
  }
}

// Maps a CheckResponse status_code to its display string — the fallback used
// when a submit result's `status_msg` isn't present (D-08: every verdict, not
// just accepted, gets a display string). Codes per src/api/CLAUDE.md.
export function statusDisplayFromCode(code: number): string {
  switch (code) {
    case 10:
      return "Accepted";
    case 11:
      return "Wrong Answer";
    case 12:
      return "Memory Limit Exceeded";
    case 13:
      return "Output Limit Exceeded";
    case 14:
      return "Time Limit Exceeded";
    case 15:
      return "Runtime Error";
    case 20:
      return "Compile Error";
    case 30:
      return "Timeout";
    default:
      return "Unknown";
  }
}

// Builds + inserts a `submissions` row for a submit result carrying a
// `submission_id` (D-08 — every verdict, not just accepted, is stored — WA/
// TLE/CE/RE/MLE included, not just Accepted). No-op for a result with none: a
// run's `interpret_id` never reaches this call site (only submitSolution
// calls it), and pending/timeout/unknown carry no `data.submission_id`.
export function appendSubmissionRecord(
  question: DbQuestion,
  langSlug: string,
  result: ParsedResponse,
): void {
  if (!("data" in result)) return; // pending/timeout/unknown/internal_error — no CheckResponse
  const data = result.data;
  if (!data.submission_id) return; // defensive: only submits carry a submission_id

  insertSubmission({
    submissionId: parseInt(data.submission_id, 10),
    questionId: question.id,
    titleSlug: question.title_slug,
    lang: langSlug,
    statusDisplay: data.status_msg ?? statusDisplayFromCode(data.status_code ?? 0),
    runtime: data.status_runtime ?? null,
    memory: data.status_memory ?? null,
    submittedAt: Date.now(), // CheckResponse has no timestamp field
    runtimePercentile: data.runtime_percentile ?? null,
    memoryPercentile: data.memory_percentile ?? null,
  });
}

function loadCode(question: DbQuestion, langSlug: string): string {
  const code = readSolutionFile(question.id, question.title_slug, langSlug);
  if (code == null) {
    throw new SolutionError("Could not read solution file.");
  }
  return code;
}

// Submit-side capture branch (D-01, D-03, D-08). Branches on the already-parsed
// `ParsedResponse.type` — no new response parsing (Pitfall 3). Only
// `submit_wrong_answer` captures both input + expected output; RE/TLE/MLE
// capture input-only (D-03 — `expected_output` is never present on those
// verdicts, and `undefined` must never be substituted with a placeholder like
// "N/A", Pitfall 1). Every other verdict (compile_error, submit_accepted,
// pending, …) captures nothing.
//
// `testsDir` is caller-injected (mirroring `captureFailingCase`/`blessRunOutputs`'s
// own dir-injected shape) rather than resolved internally via `getTestsDir` —
// keeps this helper pure/config-free and directly unit-testable against a temp
// dir, matching every other writer in `core/solutions/`.
export function captureFromSubmitResult(testsDir: string, result: ParsedResponse): string[] {
  if (
    result.type !== "submit_wrong_answer" &&
    result.type !== "runtime_error" &&
    result.type !== "time_limit_exceeded" &&
    result.type !== "memory_limit_exceeded"
  ) {
    return [];
  }
  const { last_testcase } = result.data;
  if (!last_testcase) return [];

  const expectedOutput =
    result.type === "submit_wrong_answer" ? (result.data.expected_output ?? undefined) : undefined;
  const captured = captureFailingCase(testsDir, last_testcase, expectedOutput);
  return [captured.note];
}

// Run-side blessing branch (D-02, D-07, D-08). Any completed run (accepted or
// wrong-answer) blesses missing `.out`s for existing seeded cases from
// `expected_code_answer[]` — LeetCode-authoritative data regardless of the
// user's verdict. Every other run-shaped type captures nothing. `testsDir`
// dir-injected for the same reason as `captureFromSubmitResult`.
export function captureFromRunResult(
  testsDir: string,
  exampleTestcaseList: string[],
  result: ParsedResponse,
): string[] {
  if (result.type !== "run_accepted" && result.type !== "run_wrong_answer") return [];
  const blessed = blessRunOutputs(testsDir, exampleTestcaseList, result.data.expected_code_answer);
  return blessed.length > 0 ? [`Blessed ${blessed.length} expected output(s)`] : [];
}

export async function runSolution(
  question: DbQuestion,
  langSlug: string,
): Promise<{ response: ParsedResponse; captureNotes: string[] }> {
  const code = loadCode(question, langSlug);
  const [config, editorData] = await Promise.all([
    fetchConsolePanelConfig(question.title_slug),
    fetchEditorData(question.title_slug),
  ]);
  const testCases = config.question.exampleTestcaseList.join("\n");

  const runResponse = await runCode(
    question.title_slug,
    langSlug,
    editorData.question.questionId,
    code,
    testCases,
  );

  const result = await pollResult(runResponse.interpret_id);
  markAttempted(question.id);

  let captureNotes: string[] = [];
  try {
    const testsDir = getTestsDir(question.id, question.title_slug);
    captureNotes = captureFromRunResult(testsDir, config.question.exampleTestcaseList, result);
  } catch {
    captureNotes = []; // never let a capture failure turn a successful run into an error (Pitfall 5)
  }

  return { response: result, captureNotes };
}

export async function submitSolution(
  question: DbQuestion,
  langSlug: string,
): Promise<{ response: ParsedResponse; captureNotes: string[] }> {
  const code = loadCode(question, langSlug);
  const editorData = await fetchEditorData(question.title_slug);

  const submitResponse = await submitCode(
    question.title_slug,
    langSlug,
    editorData.question.questionId,
    code,
  );

  const result = await pollResult(submitResponse.submission_id);
  appendSubmissionRecord(question, langSlug, result);
  if (result.type === "submit_accepted") {
    markAccepted(question.id);
    setSubmissionStats(
      question.id,
      result.data.status_runtime ?? null,
      result.data.status_memory ?? null,
    );
  } else {
    markAttempted(question.id);
  }

  let captureNotes: string[] = [];
  try {
    const testsDir = getTestsDir(question.id, question.title_slug);
    captureNotes = captureFromSubmitResult(testsDir, result);
  } catch {
    captureNotes = []; // never let a capture failure turn a successful submit into an error (Pitfall 5)
  }

  return { response: result, captureNotes };
}
