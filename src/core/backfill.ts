// Never-throws, resumable, polite backfill service (DATA-02, DATA-03, DATA-04,
// DATA-05). Type-checking stub — RED step (TDD): correct exported signatures so
// the failing test commit is a real assertion failure, not a compile error
// under this repo's strict pre-commit typecheck gate. GREEN replaces the body.

import type { ApiSubmission, SubmissionListData } from "../api/queries/submission-list";

export type BackfillFailReason = "auth-error" | "rate-limited" | "network-error" | "cancelled";

export type BackfillResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; reason: BackfillFailReason; imported: number; message: string };

export interface CancelRef {
  cancelled: boolean;
}

export async function backfillSubmissions(
  _onProgress?: (done: number, total: number) => void,
  _cancelRef?: CancelRef,
  _interPageDelayMs = 1000,
): Promise<BackfillResult> {
  return { ok: true, imported: 0, skipped: 0 };
}

// Referenced so the unused-import lint doesn't fire on these types while the
// stub doesn't yet use them.
type _Unused = ApiSubmission | SubmissionListData;
