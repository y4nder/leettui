---
phase: 01-submission-store-backfill
fixed_at: 2026-07-01T01:23:13Z
review_path: .planning/phases/01-submission-store-backfill/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-07-01T01:23:13Z
**Source review:** .planning/phases/01-submission-store-backfill/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### WR-01: `mapSubmission` validates `submissionId` for NaN but not `submittedAt`

**Files modified:** `src/core/backfill.ts`
**Commit:** a7af77b
**Applied fix:** Added a symmetric `Number.isNaN` guard on `parseInt(sub.timestamp, 10)` right after the existing `submissionId` guard in `mapSubmission`. An unparseable timestamp now returns `null` (the row is skipped and counted in `skipped`), matching the existing FK/pending-row skip pattern, instead of binding `NaN` → SQL `NULL` and throwing a `NOT NULL constraint failed` inside `insertSubmissions`' transaction, which previously aborted the entire backfill run and surfaced as a misleading "network-error". Verified against the existing `backfill.test.ts` suite (10/10 pass) — no test needed updating since the change only adds a new skip path, it doesn't alter any currently-tested behavior.

### WR-02: No upper bound on per-question pagination

**Files modified:** `src/core/backfill.ts`
**Commit:** 1c5564d
**Applied fix:** Added a `MAX_PAGES_PER_QUESTION = 500` constant and a `pages` counter incremented at the top of the per-question `while (hasNext)` loop; exceeding the cap returns `{ ok: false, reason: "network-error", imported, message: "..." }` instead of looping forever against a malformed API response that returns `hasNext: true` with an empty page indefinitely.

### WR-03: `handleStartBackfill` and `handleSyncDb` share `syncProgress` with no mutual exclusion

**Files modified:** `src/views/browse/handlers/shared.ts`, `src/views/browse/handlers/backfill.ts`, `src/views/browse/handlers/solve.ts`
**Commit:** fa4fbb2
**Applied fix:** Added a small shared module-level guard (`tryAcquireSync`/`releaseSync`, tracking which of `"backfill"` / `"db-sync"` is currently running) to `handlers/shared.ts`, the existing browse-handler helper module both files already import from. `handleStartBackfill` now claims the guard before starting (declining with an info message if a db-sync is already in flight) and releases it in its existing `finally` block alongside `clearSyncProgress()`. `handleSyncDb` does the same, wrapped in a new `finally` clause. This is the least-invasive of the two options the review suggested — a single "an operation is already in flight" guard — rather than giving backfill its own progress slice.

### WR-04: `BootFlow` passes a hardcoded `false` instead of `getBackfillNudgeShown()`

**Files modified:** `src/ui/components/onboarding/BootFlow.tsx`
**Commit:** 9bca0a4
**Applied fix:** Replaced the literal `false` argument to `shouldShowBackfillNudge(...)` with the actual `getBackfillNudgeShown()` call (reformatted onto its own line to satisfy Biome's line-width rule). Behavior is unchanged today (the enclosing `if (!getBackfillNudgeShown())` guarantees it's `false` at this call site) but the call site now genuinely reflects the function's documented contract instead of relying on co-location with that guard.

### IN-01: `BootFlow` bypasses the `db/` layer, querying `submissions` directly

**Files modified:** `src/db/submissions.ts`, `src/db/submissions.test.ts`, `src/ui/components/onboarding/BootFlow.tsx`
**Commit:** c2d79cd
**Applied fix:** Added `hasAnySubmissions(): boolean` to `src/db/submissions.ts` (a `LIMIT 1` existence check) plus a unit test (`hasAnySubmissions is false on an empty table and true once a row exists`). `BootFlow.tsx` now calls this accessor instead of building a raw `getDb().select().from(submissions)...` query inline, dropping its direct `db/schema` import and the now-unused `getDb` import.

### IN-02: `insertSubmissions`' doc comment says "batch insert" but it's row-by-row

**Files modified:** `src/db/submissions.ts`
**Commit:** b4db4b9
**Applied fix:** Reworded the doc comment on `insertSubmissions` to describe it accurately: an idempotent multi-row insert wrapped in a single transaction, where each row is still its own `INSERT` statement rather than one batched multi-row `VALUES (...), (...), ...` — the transaction wrapping (not statement batching) is what makes the whole call atomic. No behavior change, per the review's own "no functional requirement to do so" note.

## Skipped Issues

None — all findings were fixed.

## Verification

Ran the full project gate after all six fixes were committed:

```
bun run check
  biome check --error-on-warnings ./src ./scripts  → Checked 181 files, 0 issues
  tsc --noEmit                                       → no errors
  bun test                                           → 355 pass, 0 fail, 869 expect() calls, 32 files
```

---

_Fixed: 2026-07-01T01:23:13Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
