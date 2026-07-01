---
phase: 01-submission-store-backfill
plan: 01
subsystem: database
tags: [sqlite, drizzle, migrations, tdd]

# Dependency graph
requires: []
provides:
  - "submissions sqliteTable (PK submissionId, idx_sub_question_time, idx_sub_submitted_at) in questions.db"
  - "questions.submissions_fetched_at nullable cursor column"
  - "Embedded migration drizzle/0002_marvelous_maverick.sql (SQL_BY_TAG-registered)"
  - "src/db/submissions.ts CRUD module: DbSubmission, insertSubmission, insertSubmissions, getSubmissionsForQuestion, setSubmissionsFetchedAt"
affects: [01-02-backfill-service, 01-03-append-on-submit, phase-2-per-problem-history, phase-3-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent CRUD via onConflictDoNothing, batch writes wrapped in getDb().transaction()"
    - "Runtime migration-apply test opens a real throwaway DB via openDatabase() to prove embedded migrations apply, not just type-compile"

key-files:
  created:
    - src/db/submissions.ts
    - src/db/submissions.test.ts
    - drizzle/0002_marvelous_maverick.sql
    - drizzle/meta/0002_snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/migrations.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "submissions.ts shipped with a type-checking stub before the real implementation (extra step beyond the plan) so the RED test commit satisfies the project's pre-commit typecheck hook while still failing on assertions"

patterns-established:
  - "TDD in a strict-typecheck-gated repo: stub the module signature first so RED is an assertion failure, not a compile error blocking the commit"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "submissions table (PK submissionId) + submissions_fetched_at column exist in questions.db after migration, verified at runtime"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions migration"
        status: pass
    human_judgment: false
  - id: D2
    description: "Idempotent insert — re-inserting a submissionId (single or batch) leaves row count at 1"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions CRUD > re-inserting the same submissionId is a no-op (dedupe)"
        status: pass
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions CRUD > batch insert dedupes duplicate submissionIds within and across calls"
        status: pass
    human_judgment: false
  - id: D3
    description: "getSubmissionsForQuestion returns rows newest-first by submittedAt, and [] for a question with no submissions"
    verification:
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions CRUD > returns rows newest-first by submittedAt"
        status: pass
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions CRUD > no submissions returns empty array"
        status: pass
    human_judgment: false
  - id: D4
    description: "setSubmissionsFetchedAt writes the D-07 resume/high-water cursor onto questions"
    verification:
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions CRUD > setSubmissionsFetchedAt writes the cursor onto questions"
        status: pass
    human_judgment: false
  - id: D5
    description: "FK enforcement: inserting a submission row for an unknown questionId throws"
    verification:
      - kind: unit
        ref: "src/db/submissions.test.ts#submissions CRUD > inserting a row with an unknown questionId throws a FOREIGN KEY error"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 1: Submission Store Schema, Migration & CRUD Summary

**New `submissions` SQLite table (PK `submissionId`) with idempotent Drizzle CRUD (`insertSubmission`/`insertSubmissions`/`getSubmissionsForQuestion`/`setSubmissionsFetchedAt`), shipped as embedded migration `0002_marvelous_maverick`, plus a `questions.submissions_fetched_at` cursor column — all verified at runtime, not just type-compiled.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-01
- **Tasks:** 3 (Task 3 was TDD: RED + GREEN commits)
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- `submissions` table added to `src/db/schema.ts` (PK `submissionId`, FK to `questions.id`, free-text `statusDisplay` for all verdicts per D-08, two indexes for Phase 2/3 reads) alongside the new nullable `questions.submissions_fetched_at` cursor column (D-07)
- Migration generated via `bun run db:generate` (`drizzle/0002_marvelous_maverick.sql`), embedded in `src/db/migrations.ts` (`SQL_BY_TAG` key matches the journal tag exactly), and proven to apply at runtime by opening a fresh throwaway DB in a test — not merely type-compiled
- `src/db/submissions.ts` CRUD module mirroring `recents.ts`: idempotent single/batch insert (`onConflictDoNothing`, batch wrapped in a transaction), newest-first per-question read, and the cursor-write function — with 10 co-located tests covering dedupe, ordering, empty-read, cursor write, and FK enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Add submissions table + submissions_fetched_at column to schema** - `6a616f8` (feat)
2. **Task 2: Generate, embed, and verify the migration applies at runtime** - `6c6a156` (feat)
3. **Task 3: submissions.ts CRUD module + co-located tests (TDD)**
   - `83d3038` (test) — RED: failing CRUD tests against a type-checking stub
   - `3b66f39` (feat) — GREEN: real implementation, all 10 tests pass

**Plan metadata:** (this commit, made after this SUMMARY)

_Note: Task 3 is TDD — RED (test) then GREEN (feat); no separate REFACTOR commit was needed, the GREEN implementation was already clean per `bun run check`._

## TDD Gate Compliance

- RED gate: `test(01-01): add failing CRUD tests for submissions.ts` (`83d3038`) — confirmed 6 CRUD assertions failing against a stub, 4 pre-existing tests still passing.
- GREEN gate: `feat(01-01): implement submissions.ts CRUD module` (`3b66f39`) — all 10 tests pass, immediately after RED.
- No REFACTOR commit — full gate (`bun run check`, 330 tests) was already green after GREEN.

## Files Created/Modified
- `src/db/schema.ts` - Added `submissions` sqliteTable + `questions.submissionsFetchedAt` column
- `src/db/migrations.ts` - Embedded `m0002` import + `SQL_BY_TAG` entry
- `src/db/submissions.ts` - CRUD module: `DbSubmission`, `insertSubmission`, `insertSubmissions`, `getSubmissionsForQuestion`, `setSubmissionsFetchedAt`
- `src/db/submissions.test.ts` - Migration-apply tests (Task 2) + CRUD tests (Task 3)
- `drizzle/0002_marvelous_maverick.sql` - Generated migration (submissions table + column)
- `drizzle/meta/_journal.json` - drizzle-kit journal entry for `0002_marvelous_maverick`
- `drizzle/meta/0002_snapshot.json` - drizzle-kit schema snapshot for the new migration

## Decisions Made
- Shipped `submissions.ts` as a type-checking stub before the real implementation during the RED step. The plan's TDD flow assumes a dynamically-typed or pre-existing module; this repo's pre-commit hook runs `tsc --noEmit`, so a genuinely-missing module would block the RED commit with a compile error rather than a clean test-assertion failure. The stub (correct signatures, no logic) let RED be a true behavioral failure while staying commit-able without `--no-verify`.

## Deviations from Plan

None - plan executed exactly as written. The stub-before-RED adjustment above is a TDD-mechanics detail necessitated by the project's zero-tolerance pre-commit gate, not a scope or requirement change — Task 3's acceptance criteria (dedupe, ordering, cursor, FK enforcement, `bun run check` green) are all met exactly as specified.

## Issues Encountered
- Biome's formatter flagged one line in the initial `setSubmissionsFetchedAt` implementation as too long (single-line chained call). Fixed by running `bun run format`, which reformatted it into a multi-line chain — no logic change, folded into the GREEN commit (`3b66f39`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/db/submissions.ts` is a ready-made import for plan 01-02's backfill service (`insertSubmissions` for batch writes, `setSubmissionsFetchedAt` for the resume/high-water cursor) and plan 01-03's append-on-submit hook (`insertSubmission`).
- The embedded migration is verified at runtime — the compiled-binary crash risk (`T-01-MIGRATE`) is closed for this table.
- No blockers for 01-02 or 01-03.

---
*Phase: 01-submission-store-backfill*
*Completed: 2026-07-01*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 4 task commit hashes (`6a616f8`, `6c6a156`, `83d3038`, `3b66f39`) confirmed in `git log`.
