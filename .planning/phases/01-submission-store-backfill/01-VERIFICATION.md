---
phase: 01-submission-store-backfill
verified: 2026-07-01T01:27:53Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
notes:
  - "Phase mode is `mvp` but the ROADMAP.md goal text ('leettui can import...') is not in strict 'As a ..., I want to ..., so that ...' user-story format (gsd_run query user-story.validate returns valid=false). Per MVP-mode-verification rules this would normally block MVP-narrowed verification. Proceeded with standard goal-backward verification instead (ROADMAP Success Criteria as the must-have contract) because: (1) the per-plan `<phase_user_story>` block in 01-01-PLAN.md IS correctly formatted and carries the same intent, (2) all 5 Success Criteria are concrete, independently testable truths, not vague, and (3) the phase already passed a blocking human-verify checkpoint. This is a documentation/format nit on ROADMAP.md, not a goal-achievement gap — flagged here for the maintainer, not treated as a blocker."
---

# Phase 1: Submission Store & Backfill Verification Report

**Phase Goal:** leettui can import the user's full LeetCode submission history into its local SQLite store and keep it current going forward — defensively, resumably, and on-demand.
**Verified:** 2026-07-01T01:27:53Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can trigger a backfill via the command palette with live, non-blocking in-TUI progress (ROADMAP SC1) | ✓ VERIFIED | `submissions.backfill` command registered in `src/ui/keymap/commands/system.ts:120` → `handleStartBackfill()` in `src/views/browse/handlers/backfill.ts` drives the existing `syncSlice` progress bar (`setSyncProgress`/`clearSyncProgress`) via `backfillSubmissions`'s `onProgress` callback; service is a plain `async` function so the render loop runs between `await`s. Human checkpoint (01-03 Task 4, approved 2026-07-01) confirmed the bar renders and the user could keep navigating. |
| 2 | Re-running/resuming an interrupted backfill never duplicates rows and continues where it stopped (ROADMAP SC2, DATA-03) | ✓ VERIFIED | `submissionId` PRIMARY KEY + `onConflictDoNothing` (`src/db/submissions.ts:24-38`); cursor (`questions.submissions_fetched_at`) set only after ALL pages for a question succeed (`src/core/backfill.ts:201`), so a mid-question interrupt re-does that question. Behavioral test `backfill.test.ts:154` ("re-running after a full import inserts zero new rows") passes. Human checkpoint step 2 (cancel mid-run, re-run resumes, no dupes) approved. |
| 3 | On session expiry/429/network failure, leettui surfaces a clean hint and preserves partial data instead of crashing; backfill stays polite and on-demand only (ROADMAP SC3, DATA-04/DATA-05) | ✓ VERIFIED | `backfillSubmissions` never throws — every external call wrapped, `AuthError`→`auth-error`, 429-bearing message→exponential-with-jitter `withBackoff` then `rate-limited`, generic throw→`network-error`, `cancelRef.cancelled`→`cancelled` (`src/core/backfill.ts:106-210`). Handler maps each to a clean message (`backfill.ts:46-78`). `interPageDelayMs=1000` (empirically validated by a live spike, see 01-02-SUMMARY.md) applied between pages; no background timers anywhere — only invoked from the palette command. Tests: `backfill.test.ts` lines 175/195/213/227/267 (AuthError, 429-exhausted, generic throw, cancel, and an explicit never-throws sweep) all pass. |
| 4 | New submissions made through leettui auto-append to the store, capturing runtime/memory percentile for free from the existing CheckResponse, zero extra API calls (ROADMAP SC4, DATA-06) | ✓ VERIFIED | `appendSubmissionRecord` called in `submitSolution` right after `pollResult` resolves (`src/core/submission.ts:117`), for every verdict (not just Accepted — D-08), building the row directly from the already-fetched `CheckResponse` fields (no new fetch). `runSolution` is untouched (runs use `interpret_id`, never carry a `submission_id`, so correctly never append — the ROADMAP's "(run/submit)" phrasing describes the two solve actions generically; only submit produces submission data to store, which matches the API and the zero-extra-API-calls requirement). Tests: `submission.test.ts` lines 76/108/122/135/141/148 cover accepted, non-accepted (D-08), status_msg preference, and all no-append paths. Human checkpoint step 4 (real submit → row appears with percentiles) approved. |
| 5 | Submission data lives in the existing `questions.db` keyed by `submissionId`, so the `*.db` gitignore covers it automatically (ROADMAP SC5, DATA-01) | ✓ VERIFIED | `submissions` table defined in `src/db/schema.ts:64-84` (same schema file/DB as `questions`); `src/config/paths.ts:17` confirms a single `DB_PATH = questions.db`; `.gitignore:40-42` covers `*.db`/`*.db-shm`/`*.db-wal` globally, no new path introduced. Human checkpoint step 6 approved. |
| 6 | `submissions` table (PK `submissionId`) + `submissions_fetched_at` cursor column exist at runtime after migration (DATA-01) | ✓ VERIFIED | Generated migration `drizzle/0002_marvelous_maverick.sql` creates `submissions` (PK `submission_id`, FK→`questions.id`, both indexes) and `ALTER TABLE questions ADD submissions_fetched_at`; embedded in `src/db/migrations.ts:18,23` with a `SQL_BY_TAG` key matching the journal tag exactly (`drizzle/meta/_journal.json:23`). Runtime-apply test `submissions.test.ts:65-83` opens a fresh throwaway DB and asserts table/column/both-indexes exist — passes. |
| 7 | Idempotent CRUD: inserting the same `submissionId` twice (single or batch) leaves row count at 1 (DATA-01/DATA-03) | ✓ VERIFIED | `onConflictDoNothing().run()` in both `insertSubmission`/`insertSubmissions` (`src/db/submissions.ts:24-38`), batch wrapped in `getDb().transaction()`. Tests `submissions.test.ts:104,112` pass. |
| 8 | Paginated `submissionList` backfill captures status/lang/runtime/memory/timestamp per attempt, walking multi-page results (DATA-02) | ✓ VERIFIED | `fetchSubmissionList` (`src/api/queries/submission-list.ts`) confirmed against the live API by the 01-02 spike (field names/units, `hasNext`, `PAGE_SIZE=20` all empirically confirmed, not guessed — see 01-02-SUMMARY.md's evidence table). `backfillSubmissions`'s per-question `while(hasNext)` loop pages until termination, now with a `MAX_PAGES_PER_QUESTION=500` circuit breaker (WR-02 fix). Tests `backfill.test.ts:92,117` (single-page and multi-page) pass. |
| 9 | A malformed/unparseable API row (bad timestamp) is skipped rather than aborting the entire backfill run (post-review fix WR-01) | ✓ VERIFIED | `mapSubmission` in `src/core/backfill.ts:87-88` guards `Number.isNaN(submittedAtSeconds)` symmetrically with the existing `submissionId` guard, returning `null` (counted as skipped) instead of inserting `NaN`→SQL `NULL` and throwing inside the transaction. Confirmed present in the actual file (not just claimed in REVIEW-FIX.md); commit `a7af77b` present in `git log`. |
| 10 | Concurrent backfill + manual DB sync do not silently blank out each other's progress bar (post-review fix WR-03) | ✓ VERIFIED | `src/views/browse/handlers/shared.ts:19-39` adds a module-level `tryAcquireSync`/`releaseSync` guard (`"backfill" | "db-sync"`); both `handleStartBackfill` (`backfill.ts:28-31,84`) and `handleSyncDb` (`solve.ts:28-31,46`) claim/release it, declining with an info message when the other is in flight. Commit `fa4fbb2` present in `git log`. |
| 11 | A command-palette action starts a cancelable, non-blocking backfill; progress clears on success, error, AND cancel (DATA-07) | ✓ VERIFIED | `handleStartBackfill`'s `try/finally` (`backfill.ts:34-85`) calls `clearSyncProgress()` + releases the sync guard unconditionally; `handleCancelBackfill` flips the shared `CancelRef` (no-op when idle, mirrors `update.dismiss`). Human checkpoint step 1-2 (progress non-blocking, cancel clears bar) approved 2026-07-01. |
| 12 | A one-time first-run nudge offers the backfill, fires at most once, suppressed when history already exists (DATA-06/07, D-01/D-02) | ✓ VERIFIED | `shouldShowBackfillNudge` (pure, `src/core/session.ts:122`) + `getBackfillNudgeShown`/`setBackfillNudgeShown` persisted flag; `BootFlow.tsx:180-188` calls `setBackfillNudgeShown()` unconditionally after the show-check (WR-04 fix confirmed: passes the real `getBackfillNudgeShown()`, not a hardcoded `false`, into `shouldShowBackfillNudge`). `BackfillNudge` mounted in `BrowseView.tsx:179` on `mode === "backfillNudge"`. Tests `session.test.ts:145,149,153,157` + `110` (cross-boot merge) pass. Human checkpoint step 5 (nudge fired once, no reappear) approved. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `submissions` table + `submissions_fetched_at` column | ✓ VERIFIED | Lines 16, 64-84 — matches plan exactly |
| `drizzle/0002_marvelous_maverick.sql` + journal | Generated migration, embedded | ✓ VERIFIED | Journal tag matches `SQL_BY_TAG` key in `migrations.ts:18,23` |
| `src/db/submissions.ts` | CRUD module | ✓ VERIFIED | Exports `DbSubmission`, `insertSubmission`, `insertSubmissions`, `getSubmissionsForQuestion`, `setSubmissionsFetchedAt`, `hasAnySubmissions` (the last added by the review-fix, IN-01) |
| `src/db/submissions.test.ts` | Migration-apply + CRUD tests | ✓ VERIFIED | 12 tests, all pass |
| `src/api/queries/submission-list.ts` | `fetchSubmissionList` query module | ✓ VERIFIED | Field shape confirmed against a live API spike (01-02-SUMMARY.md) |
| `scripts/spike-submission-list.ts` | Throwaway live-API probe | ✓ VERIFIED | Present on disk, not shipped in the compiled binary |
| `src/core/backfill.ts` | Never-throws resumable backfill service | ✓ VERIFIED | Exports `BackfillResult`, `BackfillFailReason`, `CancelRef`, `backfillSubmissions`; both post-review fixes (WR-01 NaN guard, WR-02 `MAX_PAGES_PER_QUESTION`) present |
| `src/core/backfill.test.ts` | Behavior contract tests | ✓ VERIFIED | 10 tests, all pass |
| `src/core/submission.ts` | Append-on-submit | ✓ VERIFIED | `statusDisplayFromCode` + `appendSubmissionRecord`, wired into `submitSolution` |
| `src/core/submission.test.ts` | Append-on-submit tests | ✓ VERIFIED | 8 tests, all pass |
| `src/views/browse/handlers/backfill.ts` | Palette handler | ✓ VERIFIED | `handleStartBackfill`/`handleCancelBackfill`, finally-clears progress, WR-03 sync guard |
| `src/views/browse/handlers/shared.ts` | Sync mutual-exclusion guard | ✓ VERIFIED | `tryAcquireSync`/`releaseSync` (WR-03 fix, not in the original plan's file list but the correct least-invasive location) |
| `src/ui/keymap/commands/system.ts` | Palette commands | ✓ VERIFIED | `submissions.backfill` (line 120), `submissions.cancelBackfill` (line 126) |
| `src/core/session.ts` | Nudge flag + pure decision fn | ✓ VERIFIED | `backfillNudgeShown`, `getBackfillNudgeShown`, `setBackfillNudgeShown`, `shouldShowBackfillNudge` |
| `src/ui/store/slices/uiSlice.ts` | Nudge UI state | ✓ VERIFIED | `"backfillNudge"` mode + `showBackfillNudge`/`hideBackfillNudge` |
| `src/ui/components/BackfillNudge.tsx` | First-run nudge popup | ✓ VERIFIED | `r`/Enter runs backfill, Esc/`l`/`q` dismiss |
| `src/ui/components/onboarding/BootFlow.tsx` | Nudge wiring | ✓ VERIFIED | Unconditional `setBackfillNudgeShown()` seeding (WR-04 fix confirmed) |
| `src/views/browse/BrowseView.tsx` | Mounts `BackfillNudge` | ✓ VERIFIED | Line 179, `mode === "backfillNudge"` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `migrations.ts` `SQL_BY_TAG` | journal `tag` | static string key match | ✓ WIRED | `"0002_marvelous_maverick"` matches exactly on both sides |
| `submissions.question_id` | `questions.id` | FK, enforced | ✓ WIRED | `PRAGMA foreign_keys = ON` (per `src/db/index.ts`); FK-violation test passes |
| `backfill.ts` per-page loop | `insertSubmissions` | batch write + `onConflictDoNothing` | ✓ WIRED | Called at `backfill.ts:183` |
| `backfill.ts` question loop | `setSubmissionsFetchedAt` | cursor advance | ✓ WIRED | Called only after the `while(hasNext)` loop exits successfully (`backfill.ts:201`) |
| `handleStartBackfill` | `clearSyncProgress` | `finally` block | ✓ WIRED | `backfill.ts:79-85`, unconditional |
| `submitSolution` | `appendSubmissionRecord` | direct call post-`pollResult` | ✓ WIRED | `submission.ts:117` |
| `BootFlow` | `showBackfillNudge`/`setBackfillNudgeShown` | boot sequence, post-sync | ✓ WIRED | `BootFlow.tsx:180-188`, unconditional set (WR-04-fixed) |
| `BrowseView` | `<BackfillNudge/>` | mode-gated mount | ✓ WIRED | `BrowseView.tsx:179` |
| `system.ts` commands | `handlers/backfill.ts` | import + `run:` delegation | ✓ WIRED | Both commands present and delegate |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration applies at runtime (fresh DB) | `bun test src/db/submissions.test.ts` | 12 pass | ✓ PASS |
| Backfill never throws on any failure path | `bun test src/core/backfill.test.ts` | 10 pass | ✓ PASS |
| Append-on-submit covers all verdicts | `bun test src/core/submission.test.ts` | 8 pass | ✓ PASS |
| Nudge flag + pure decision fn | `bun test src/core/session.test.ts` | 10 pass | ✓ PASS |
| Full project gate (lint + typecheck + full suite) | `bun run check` | Biome 181 files 0 issues, `tsc --noEmit` clean, 355 tests pass | ✓ PASS |
| Debt-marker scan on all 20 phase-modified files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER" ...` | no matches | ✓ PASS |
| Referenced commit hashes exist | `git cat-file -e <hash>` × 19 (all task + review-fix commits) | all present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| DATA-01 | 01-01 | `submissions` table (PK `submissionId`) + idempotent writes, migration | ✓ SATISFIED | schema.ts, migration, submissions.test.ts |
| DATA-02 | 01-02 | Paginated `submissionList` capturing status/lang/runtime/memory/timestamp | ✓ SATISFIED | submission-list.ts, backfill.ts, live-spike-confirmed field shape |
| DATA-03 | 01-02 | Resumable + idempotent (persisted cursor, onConflictDoNothing) | ✓ SATISFIED | backfill.ts cursor logic, D-06 top-up test |
| DATA-04 | 01-02 | Polite (inter-page delay + 429 backoff), on-demand only | ✓ SATISFIED | withBackoff, interPageDelayMs, no background timers found anywhere |
| DATA-05 | 01-02 | Never crashes on auth/429/network failure, preserves partial data | ✓ SATISFIED | discriminated BackfillResult, never-throws test sweep |
| DATA-06 | 01-03 | New submissions auto-append, zero extra API calls | ✓ SATISFIED | appendSubmissionRecord wired post-pollResult |
| DATA-07 | 01-03 | Non-blocking in-TUI progress via syncSlice | ✓ SATISFIED | setSyncProgress/clearSyncProgress wiring + human checkpoint |

No orphaned requirements — REQUIREMENTS.md's Phase 1 row set (DATA-01 through DATA-07) is exactly the set declared across the three plans' `requirements` frontmatter, and all seven are marked `Complete` in REQUIREMENTS.md's traceability table.

### Anti-Patterns Found

None. Scanned all 20 files touched by this phase (per the three SUMMARYs' key-files lists) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" — zero matches. No empty stub implementations, no hardcoded-empty return values feeding rendered/stored data.

### Code Review Cross-Check

The phase went through a full review cycle (`01-REVIEW.md`, standard depth, 21 files, 0 critical / 4 warning / 2 info) followed by a fix pass (`01-REVIEW-FIX.md`, 6/6 findings fixed). This verifier independently re-read the actual source (not just the fix report's claims) for all 6 findings and confirms every fix is genuinely present in the code, not just documented:

- **WR-01** (unguarded `NaN` timestamp abort) — confirmed fixed at `backfill.ts:87-88`.
- **WR-02** (unbounded pagination loop) — confirmed fixed at `backfill.ts:50,129,136-143` (`MAX_PAGES_PER_QUESTION`).
- **WR-03** (progress-bar mutual exclusion) — confirmed fixed via `handlers/shared.ts`'s `tryAcquireSync`/`releaseSync`, called from both `backfill.ts` and `solve.ts`.
- **WR-04** (hardcoded `false` instead of real nudge-shown flag) — confirmed fixed at `BootFlow.tsx:183`.
- **IN-01** (raw Drizzle query bypassing `db/` layer) — confirmed fixed: `hasAnySubmissions()` added to `submissions.ts`, `BootFlow.tsx` calls it instead of a raw query.
- **IN-02** (misleading "batch insert" doc comment) — confirmed fixed: comment at `submissions.ts:28-32` now accurately describes per-row inserts inside one transaction.

### Human Verification Required

None outstanding. Plan 01-03's Task 4 (`type="checkpoint:human-verify" gate="blocking"`) was run by the user against a real, authenticated LeetCode account and approved on 2026-07-01, covering exactly the runtime-behavior truths that automated checks cannot see: non-blocking progress under a real multi-page backfill, idempotent cancel/resume, correct (non-1970) dates, live append-on-submit, and the once-only nudge. The orchestrator independently spot-checked the resulting data via a direct `bun:sqlite` query (112 rows, 5 distinct verdicts, sane 2026 dates) rather than relying solely on the user's narration.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria plus the review-derived fix-verification truths are independently confirmed against the actual source, tests pass (355/355 on the full `bun run check` gate run once during this verification), all 7 requirement IDs are traced to concrete, wired implementation, and all 6 code-review findings are genuinely fixed in the code (not just claimed in the fix report). The only process note is the ROADMAP.md goal-text format (see frontmatter `notes`), which does not affect goal achievement.

---

_Verified: 2026-07-01T01:27:53Z_
_Verifier: Claude (gsd-verifier)_
