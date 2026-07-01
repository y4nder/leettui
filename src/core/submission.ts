import type { DbQuestion } from "../db/questions";
import { markAccepted, markAttempted, setSubmissionStats } from "../db/questions";
import type { ParsedResponse } from "../api/types";
import { fetchEditorData } from "../api/queries/editor-data";
import { fetchConsolePanelConfig } from "../api/queries/console-panel-config";
import { runCode } from "../api/rest/run";
import { submitCode } from "../api/rest/submit";
import { pollResult } from "../api/rest/check";
import { readSolutionFile } from "./solutions";
import { insertSubmission } from "../db/submissions";

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

export async function runSolution(question: DbQuestion, langSlug: string): Promise<ParsedResponse> {
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
  return result;
}

export async function submitSolution(
  question: DbQuestion,
  langSlug: string,
): Promise<ParsedResponse> {
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
  return result;
}
