import type { DbQuestion } from "../db/questions";
import { markAccepted, markAttempted, setSubmissionStats } from "../db/questions";
import type { ParsedResponse } from "../api/types";
import { fetchEditorData } from "../api/queries/editor-data";
import { fetchConsolePanelConfig } from "../api/queries/console-panel-config";
import { runCode } from "../api/rest/run";
import { submitCode } from "../api/rest/submit";
import { pollResult } from "../api/rest/check";
import { readSolutionFile } from "./solutions";

export class SolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolutionError";
  }
}

// Maps a CheckResponse status_code to its display string — the fallback used
// when a submit result's `status_msg` isn't present (D-08: every verdict, not
// just accepted, gets a display string).
// TODO(RED): not implemented yet — stub body exists only so the module
// type-checks while the failing tests are committed. GREEN fills this in.
export function statusDisplayFromCode(_code: number): string {
  void _code;
  return "";
}

// Builds + inserts a `submissions` row for a submit result carrying a
// `submission_id` (D-08 — every verdict, not just accepted). No-op for a
// result with none (a run's `interpret_id` never reaches this call site, and
// pending/timeout/unknown carry no submission_id).
// TODO(RED): not implemented yet — stub body exists only so the module
// type-checks while the failing tests are committed. GREEN fills this in.
export function appendSubmissionRecord(
  _question: DbQuestion,
  _langSlug: string,
  _result: ParsedResponse,
): void {
  void _question;
  void _langSlug;
  void _result;
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
