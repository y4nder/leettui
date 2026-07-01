import { desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { questions, submissions } from "./schema";

export interface DbSubmission {
  submissionId: number;
  questionId: number;
  titleSlug: string;
  lang: string;
  statusDisplay: string;
  runtime: string | null;
  memory: string | null;
  submittedAt: number;
  runtimePercentile: number | null;
  memoryPercentile: number | null;
}

// TODO(RED): not implemented yet — stub bodies exist only so the module
// type-checks while the failing tests are committed. GREEN fills these in.
export function insertSubmission(_row: DbSubmission): void {
  void _row;
}

export function insertSubmissions(_rows: DbSubmission[]): void {
  void _rows;
}

export function getSubmissionsForQuestion(_questionId: number): DbSubmission[] {
  void _questionId;
  return [];
}

export function setSubmissionsFetchedAt(_questionId: number, _now: number = Date.now()): void {
  void _questionId;
  void _now;
}

// Referenced so lint doesn't flag unused imports ahead of GREEN.
void desc;
void eq;
void getDb;
void questions;
void submissions;
