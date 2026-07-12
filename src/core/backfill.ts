// Never-throws, resumable, polite backfill service (DATA-02, DATA-03, DATA-04,
// DATA-05). Mirrors core/git.ts's never-throws discriminated-result contract
// and core/sync.ts's paginated-fetch -> batch-SQLite-write -> onProgress
// callback shape.
//
// Strategy (D-07, per-question): walks every locally attempted question
// (status != null) via fetchSubmissionList(titleSlug). `submissionsFetchedAt`
// on `questions` serves both D-07 roles — null means "never fully imported"
// (fresh run / resume target), non-null means "previously completed" (this
// run is a D-06 top-up). Every call re-visits every attempted question;
// `insertSubmissions`'s onConflictDoNothing plus the in-memory `knownIds`
// pre-check make a repeat visit a safe, cheap no-op — a page whose rows are
// ALL already known stops pagination early (RESEARCH.md Pattern 4: the API
// returns newest-first, so every older page is guaranteed already known too).

import { AuthError } from "@/api/client";
import { fetchSubmissionList } from "@/api/queries/submission-list";
import type { ApiSubmission, SubmissionListData } from "@/api/queries/submission-list";
import { errMessage } from "@/debug";
import { getAllQuestions, getQuestionBySlug } from "@/db/questions";
import {
  getSubmissionsForQuestion,
  insertSubmissions,
  setSubmissionsFetchedAt,
} from "@/db/submissions";
import type { DbSubmission } from "@/db/submissions";

export type BackfillFailReason =
  | "auth-error" // 401/403 — session expired
  | "rate-limited" // 429 after all backoff retries
  | "network-error" // fetch threw / any other unexpected error
  | "cancelled"; // user cancelled mid-run (D-05)

export type BackfillResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; reason: BackfillFailReason; imported: number; message: string };

// A plain mutable ref (no AbortController — simpler, same semantics) so the
// async loop can check cancellation between pages (D-05).
export interface CancelRef {
  cancelled: boolean;
}

const MAX_RETRIES = 5;

// Defensive circuit breaker for the per-question pagination loop: without it,
// an API response that returns `hasNext: true` alongside an empty
// `submissions` array on every page would loop forever (offset never
// advances). ~10k submissions/question is generous but finite.
const MAX_PAGES_PER_QUESTION = 500;

// Exponential-with-jitter backoff for 429s, capped at 30s. `baseDelayMs` reuses
// the caller's `interPageDelayMs` politeness knob as the backoff unit, so a
// caller (or a test) that wants faster/slower retries tunes one number.
async function withBackoff<T>(fn: () => Promise<T>, baseDelayMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!errMessage(e).includes("429")) throw e; // not a rate-limit — surface immediately
      if (attempt === MAX_RETRIES - 1) break; // retries exhausted
      const delay = Math.min(
        30_000,
        baseDelayMs * 2 ** attempt + Math.random() * (baseDelayMs / 2),
      );
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Map one API row to a DbSubmission, resolving `questionId` from the LOCAL DB
// by `titleSlug` (Pitfall 4 FK guard — never trust the outer per-question loop
// blindly; an unknown/renamed slug is skipped, never an FK crash). Also drops
// in-flight submissions (A9) — they surface complete on a later run.
function mapSubmission(sub: ApiSubmission): DbSubmission | null {
  if (sub.isPending !== "Not Pending") return null;
  const submissionId = parseInt(sub.id, 10);
  if (Number.isNaN(submissionId)) return null;
  // API timestamp is unix SECONDS — confirmed against the live API by the
  // 01-02 Task 2 spike (scripts/spike-submission-list.ts). Guarded the same
  // way as submissionId: an unparseable timestamp skips just this row rather
  // than throwing a NOT NULL constraint failure inside insertSubmissions'
  // transaction (which would otherwise abort the entire backfill run).
  const submittedAtSeconds = parseInt(sub.timestamp, 10);
  if (Number.isNaN(submittedAtSeconds)) return null;
  const question = getQuestionBySlug(sub.titleSlug);
  if (!question) return null;

  return {
    submissionId,
    questionId: question.id,
    titleSlug: sub.titleSlug,
    lang: sub.lang,
    statusDisplay: sub.statusDisplay,
    runtime: sub.runtime ?? null,
    memory: sub.memory ?? null,
    submittedAt: submittedAtSeconds * 1000,
    runtimePercentile: null, // only ever present via a live submit CheckResponse (01-03)
    memoryPercentile: null,
  };
}

export async function backfillSubmissions(
  onProgress?: (done: number, total: number) => void,
  cancelRef?: CancelRef,
  // Locked by the 01-02 Task 2 live spike: safe over 40 real requests spanning
  // both a zero-delay burst and a 1000ms cadence, with zero 429s observed.
  interPageDelayMs = 1000,
): Promise<BackfillResult> {
  let imported = 0;
  let skipped = 0;

  try {
    const attempted = getAllQuestions().filter((q) => q.status !== null);
    const total = attempted.length;
    let done = 0;

    for (const question of attempted) {
      if (cancelRef?.cancelled) {
        return { ok: false, reason: "cancelled", imported, message: "Cancelled by user" };
      }

      const knownIds = new Set(getSubmissionsForQuestion(question.id).map((s) => s.submissionId));
      let offset = 0;
      let hasNext = true;
      let pages = 0;

      while (hasNext) {
        if (cancelRef?.cancelled) {
          return { ok: false, reason: "cancelled", imported, message: "Cancelled by user" };
        }

        if (++pages > MAX_PAGES_PER_QUESTION) {
          return {
            ok: false,
            reason: "network-error",
            imported,
            message: `Pagination did not terminate for question ${question.id} after ${MAX_PAGES_PER_QUESTION} pages`,
          };
        }

        let page: SubmissionListData;
        try {
          page = await withBackoff(
            () => fetchSubmissionList(question.title_slug, offset),
            interPageDelayMs,
          );
        } catch (e) {
          if (e instanceof AuthError) {
            return { ok: false, reason: "auth-error", imported, message: errMessage(e) };
          }
          if (errMessage(e).includes("429")) {
            return { ok: false, reason: "rate-limited", imported, message: errMessage(e) };
          }
          return { ok: false, reason: "network-error", imported, message: errMessage(e) };
        }

        const rows: DbSubmission[] = [];
        // False only when EVERY row on this page was already a known duplicate —
        // the signal that lets a D-06 top-up stop paginating early.
        let anyNewOrUnresolved = false;

        for (const sub of page.submissionList.submissions) {
          const mapped = mapSubmission(sub);
          if (!mapped) {
            skipped++;
            anyNewOrUnresolved = true; // unresolved/pending row — not proof older pages are all-known
            continue;
          }
          if (knownIds.has(mapped.submissionId)) {
            skipped++;
            continue;
          }
          knownIds.add(mapped.submissionId);
          rows.push(mapped);
          anyNewOrUnresolved = true;
        }

        if (rows.length > 0) {
          insertSubmissions(rows);
          imported += rows.length;
        }

        const pageLength = page.submissionList.submissions.length;
        hasNext = page.submissionList.hasNext;

        if (pageLength > 0 && !anyNewOrUnresolved) break; // D-06 early stop

        if (hasNext) {
          offset += pageLength;
          await new Promise<void>((r) => setTimeout(r, interPageDelayMs));
        }
      }

      // Cursor advances only after ALL pages for this question succeed (D-07) —
      // a mid-question interruption re-does that question on resume, never
      // silently skipping rows.
      setSubmissionsFetchedAt(question.id);
      done++;
      onProgress?.(done, total);
    }

    return { ok: true, imported, skipped };
  } catch (e) {
    return { ok: false, reason: "network-error", imported, message: errMessage(e) };
  }
}
