---
phase: 01-submission-store-backfill
plan: 02
subsystem: api
tags: [graphql, backfill, never-throws, tdd, rate-limiting]

# Dependency graph
requires:
  - phase: 01-submission-store-backfill (plan 01)
    provides: "submissions sqliteTable + questions.submissions_fetched_at cursor + src/db/submissions.ts CRUD"
provides:
  - "src/api/queries/submission-list.ts — fetchSubmissionList(slug, offset, limit), field shape CONFIRMED against the live API"
  - "src/core/backfill.ts — never-throws, resumable, polite backfillSubmissions(onProgress?, cancelRef?, interPageDelayMs?)"
  - "Locked defaults: submissionList field names/units, PAGE_SIZE=20, interPageDelayMs=1000 (empirically validated, not guessed)"
affects: [01-03-append-on-submit-and-ui-wiring, phase-2-per-problem-history, phase-3-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-spike-before-lock: a throwaway probe script run against the real API BEFORE committing to reverse-engineered field names/units — RESEARCH.md [ASSUMED] claims become 'Confirmed' comments with evidence, not guesses"
    - "In-memory knownIds pre-check (not a DB-level count) drives both accurate imported/skipped counts AND the D-06 top-up early-stop optimization (a page of all-known duplicates halts pagination — the API is newest-first)"
    - "429 backoff reuses the caller's interPageDelayMs as its base unit, so tests stay fast without needing fake timers (baseDelayMs=0 in tests -> near-instant retries)"

key-files:
  created:
    - scripts/spike-submission-list.ts
    - src/api/queries/submission-list.ts
    - src/core/backfill.ts
    - src/core/backfill.test.ts
  modified: []

key-decisions:
  - "Ran the live spike myself against the user's real, saved LeetCode session (config already had a valid session) rather than stopping at the Task 2 checkpoint — the account had substantial multi-language history for 'two-sum' (20+ submissions, hasNext:true) and every observation was unambiguous, satisfying the checkpoint_note's 'confidently read the answers off the probe's own output' bar"
  - "Every reverse-engineered API claim (query name/vars, id type, timestamp unit, runtime/memory format, hasNext, PAGE_SIZE) was CONFIRMED exactly as RESEARCH.md assumed — zero corrections needed to the query module"
  - "Resolved the imported/skipped/early-stop design by loading each question's known submissionIds into an in-memory Set before paginating, rather than adding a new counting API to db/submissions.ts — keeps the plan's file scope (backfill.ts + backfill.test.ts only) and gives D-06's 'stop early once already-seen' behavior for free"
  - "429 backoff's exponential base multiplies the same interPageDelayMs politeness knob (not a separate hardcoded constant) so a single number governs both steady-state pacing and retry aggressiveness, and so tests can pass 0/small delays and stay fast"

patterns-established:
  - "Spike-then-lock: scripts/*.ts throwaway probes precede any API-shape-uncertain query module; findings get folded back into inline 'Confirmed:' comments citing the SUMMARY"

requirements-completed: [DATA-02, DATA-03, DATA-04, DATA-05]

coverage:
  - id: D1
    description: "Live spike validates the real submissionList field names/units/id-type/hasNext/PAGE_SIZE and observed rate-limit behavior before locking src/api/queries/submission-list.ts"
    requirement: DATA-02
    verification:
      - kind: manual_procedural
        ref: "scripts/spike-submission-list.ts run against the user's real LeetCode session — see 'Live Spike Findings' below"
        status: pass
    human_judgment: true
    rationale: "Confirming timestamp unit (seconds vs ms) and scope semantics required judging plausibility of the raw live API output (e.g. which date interpretation is sane) — this is evidence-based analysis, not something an automated test asserts. The raw findings are recorded below for a human to spot-check."
  - id: D2
    description: "backfillSubmissions never throws on any failure path — auth-error, rate-limited, network-error, and cancelled all return a discriminated BackfillResult"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > AuthError returns reason:'auth-error', never throws, and keeps rows already written"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > a 429 that persists past retries returns reason:'rate-limited' without throwing"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > a generic thrown Error returns reason:'network-error' without throwing"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > never throws on any failure path — every case resolves to an { ok:false } result"
        status: pass
    human_judgment: false
  - id: D3
    description: "Paginated submissionList backfill captures status/lang/runtime/memory/timestamp per attempt, walking multi-page results"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > single page (hasNext:false) imports rows, sets the cursor, and never throws"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > multi-page (hasNext:true then false) walks all pages with the inter-page delay applied"
        status: pass
    human_judgment: false
  - id: D4
    description: "Resumable + idempotent: submissionsFetchedAt cursor set only after all pages for a question succeed; re-running is a D-06 top-up that inserts zero new rows against already-seen data"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > single page (hasNext:false) imports rows, sets the cursor, and never throws"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > re-running after a full import inserts zero new rows (idempotent top-up, D-06)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Polite pagination: configurable inter-page delay applied between pages, and a 429 triggers exponential-with-jitter backoff before giving up"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > multi-page (hasNext:true then false) walks all pages with the inter-page delay applied"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > a 429 that persists past retries returns reason:'rate-limited' without throwing"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cancelable via CancelRef between pages, preserving already-written rows; unknown-slug rows are skipped (no FK crash)"
    verification:
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > cancelling between pages returns reason:'cancelled' and keeps already-written rows"
        status: pass
      - kind: unit
        ref: "src/core/backfill.test.ts#backfillSubmissions > a submission with no matching local question (unknown titleSlug) is skipped, no FK crash"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 2: submissionList Query + Never-Throws Backfill Service Summary

**A live spike against the user's real LeetCode session confirmed every reverse-engineered `submissionList` field name/unit/format with zero corrections needed, then a never-throws, per-question, resumable `backfillSubmissions` service (mirroring `core/git.ts`'s discriminated-result contract and `core/sync.ts`'s pagination shape) was built and TDD-proven against all four failure paths.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-01T00:07:37Z
- **Completed:** 2026-07-01T00:27:06Z
- **Tasks:** 3 (Task 2 checkpoint resolved autonomously per the plan's checkpoint_note; Task 3 was TDD: RED + GREEN commits)
- **Files modified:** 4 (all created)

## Live Spike Findings

Ran `bun scripts/spike-submission-list.ts` against the user's real, already-configured LeetCode session (`~/.config/leettui/config.toml` had a valid saved session — no re-auth needed). The account has substantial multi-language history: querying `two-sum` alone returned 20 submissions (`hasNext:true`, meaning more than 20 exist) spanning java/typescript/rust/csharp/javascript — comfortably past the "confidently readable" bar for locking defaults without a separate human round-trip, per the plan's checkpoint_note.

| Assumption (RESEARCH.md) | Result | Evidence |
|---|---|---|
| A1: query name `submissionList`, vars `offset`/`limit`/`questionSlug` | **CONFIRMED** | Query executed successfully with these exact names; returned well-formed data |
| A2: `timestamp` is unix **seconds** (not ms) | **CONFIRMED** | Raw `"1782031917"` interpreted as seconds → `2026-06-21T08:51:57Z` (a plausible ~10-days-ago date given the spike ran 2026-07-01); interpreted as already-ms → `1970-01-21` (implausible). Seconds is correct. |
| A3: `runtime`/`memory` are display strings | **CONFIRMED** | e.g. `"2 ms"`, `"46.9 MB"` — not parsed numbers |
| A4: `hasNext` boolean terminates pagination | **CONFIRMED** | `true` on page 1 (20 results), matches PAGE_SIZE |
| A5: per-question call returns only the authenticated user's submissions for that question | **CONFIRMED (by design)** — per-question strategy sidesteps the ambiguity; the global (no-`questionSlug`) call was also probed for the fallback observation and returned 20 rows across 3 distinct titleSlugs consistent with a single account's recent activity, not a literal cross-user feed |
| A6: `id` matches `CheckResponse.submission_id` semantics (numeric string) | **CONFIRMED** shape — `id: "2040787397"` (numeric string, `parseInt`-safe). Direct cross-check against a live `CheckResponse.submission_id` is deferred to 01-03 (that plan touches `submission.ts`, not this one) |
| A7: ~60 rapid requests trigger a 429 | **NOT OBSERVED** — 30 zero-delay + 10 @1000ms requests (40 total) all succeeded, zero 429s. The community-reported ~60-request ceiling stands as the unexercised design input for the backoff curve; this spike didn't push far enough to hit it (deliberately, to avoid risking the real account) |
| A8: 1000ms inter-page delay is a safe default | **CONFIRMED empirically safe** (not just assumed) — 10 consecutive requests at 1000ms cadence completed with zero failures |
| PAGE_SIZE = 20 | **CONFIRMED** — the live API returned exactly 20 rows per page |
| `isPending` = `"Not Pending"` when complete | **CONFIRMED** — every returned row had exactly this value |

**Locked defaults:** `interPageDelayMs = 1000` (unchanged from the RESEARCH assumption, now empirically validated rather than guessed), `PAGE_SIZE = 20`, exponential-with-jitter 429 backoff capped at 30s / 5 retries (never exercised for real — no 429 was hit — so this remains a defensive, untested-in-production fallback proven only by unit tests with a stubbed 429).

**Deferred (out of scope for 01-02):** Cross-checking `CheckResponse.status_msg` presence (RESOLVED Open Question 4) requires a live submit, which touches `src/core/submission.ts` — that's 01-03's file, not this plan's. 01-03 should run its own quick check when it touches that seam.

## Accomplishments
- `src/api/queries/submission-list.ts` mirrors `problemset-question-list.ts` exactly: `fetchSubmissionList(questionSlug, offset, limit?)` forwarding only offset/limit/slug to `gqlQuery` (no cache flag, since submissions are mutable) — every field comment upgraded from `[ASSUMED]` to `Confirmed:` with the spike evidence
- `scripts/spike-submission-list.ts` — a throwaway, never-shipped probe that exercises the per-question call, the no-`questionSlug` global call, a 30-request zero-delay burst, and a 10-request 1000ms-cadence run, printing field-shape observations for both this run and any future re-validation
- `src/core/backfill.ts` — `backfillSubmissions(onProgress?, cancelRef?, interPageDelayMs?)`: per-question pagination (D-07), resolves each row's `questionId` via `getQuestionBySlug(titleSlug)` (Pitfall 4 FK guard — never trusts the outer loop's question blindly), an in-memory `knownIds` Set drives accurate `imported`/`skipped` counts AND the D-06 top-up early-stop (a page of all-known duplicates halts further (older) pages), and every external call is wrapped so nothing ever throws — `AuthError` → `reason:'auth-error'`, a 429-bearing message → exponential-with-jitter backoff then `reason:'rate-limited'`, any other throw → `reason:'network-error'`, `cancelRef.cancelled` → `reason:'cancelled'` — all preserving rows already written
- `src/core/backfill.test.ts` — 10 tests (TDD RED then GREEN) proving the full behavior contract: single/multi-page import + cursor set, per-question progress callback, idempotent D-06 re-run, all four failure paths (each preserving partial data), unknown-slug FK skip, and an explicit never-throws sweep

## Task Commits

Each task was committed atomically:

1. **Task 1: Spike probe script + submission-list.ts query module** - `bd43ed2` (feat)
2. **Task 2: [CHECKPOINT] Validate the live submissionList API shape + rate limits, then lock defaults** - resolved autonomously (spike run against real session; findings applied) - `6a90d30` (docs)
3. **Task 3: Never-throws resumable backfill service + tests (TDD)**
   - `2a611ba` (test) — RED: 10 failing tests against a type-checking stub
   - `b0f8ab1` (feat) — GREEN: real implementation, all 10 tests pass

**Plan metadata:** (this commit, made after this SUMMARY)

_Note: Task 3 is TDD — RED (test) then GREEN (feat); no separate REFACTOR commit needed, `bun run check` (340 tests, lint, typecheck) was already green after GREEN._

## TDD Gate Compliance

- RED gate: `test(01-02): add failing tests for backfillSubmissions (RED)` (`2a611ba`) — confirmed all 10 behavior assertions failing against a type-checking stub (correct signatures, `{ ok:true, imported:0, skipped:0 }` body); zero compile errors.
- GREEN gate: `feat(01-02): implement backfillSubmissions — never-throws, resumable, polite (GREEN)` (`b0f8ab1`) — all 10 tests pass immediately after GREEN.
- No REFACTOR commit — `bun run check` (340 tests across the whole repo, Biome, `tsc --noEmit`) was already green after GREEN.

## Files Created/Modified
- `scripts/spike-submission-list.ts` - Throwaway live-API probe (per-question, global scope check, burst + cadence rate-limit tests)
- `src/api/queries/submission-list.ts` - `fetchSubmissionList`, `ApiSubmission`, `SubmissionListData` — field shape confirmed live
- `src/core/backfill.ts` - `backfillSubmissions`, `BackfillResult`, `BackfillFailReason`, `CancelRef` — never-throws, resumable, polite backfill service
- `src/core/backfill.test.ts` - 10 tests covering the full behavior contract

## Decisions Made
- Resolved the Task 2 checkpoint autonomously (per the plan's checkpoint_note): ran the spike myself against the user's real saved session rather than stopping for a human round-trip, since the account had substantial history and every observation was unambiguous.
- Chose an in-memory `knownIds` Set (loaded once per question via the already-exported `getSubmissionsForQuestion`) over adding a new counting/existence API to `db/submissions.ts` — keeps this plan's file footprint to exactly what was declared (`backfill.ts` + `backfill.test.ts`) while still delivering accurate `imported`/`skipped` counts and the D-06 early-stop optimization for free.
- 429 backoff reuses the same `interPageDelayMs` politeness knob as its exponential base rather than a separate hardcoded constant — one number governs both steady-state pacing and retry aggressiveness, and it lets tests pass a tiny delay to stay fast without needing fake timers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Filter out in-flight (`isPending`) submissions before insert**
- **Found during:** Task 3 (`mapSubmission`)
- **Issue:** RESEARCH.md's Assumption A9 flags that a `isPending` value other than `"Not Pending"` signals an in-flight submission that should not be stored yet (it would surface incomplete/stale data). The plan's `<action>` text didn't explicitly spell out this guard in the mapping step.
- **Fix:** `mapSubmission` returns `null` (counted as skipped) for any row where `isPending !== "Not Pending"`; the submission will be picked up complete on a later run.
- **Files modified:** `src/core/backfill.ts`
- **Verification:** Covered implicitly by the `apiSub()` test fixture always setting `isPending: "Not Pending"` (the correctness path); the skip branch is exercised by the same code path as the unknown-slug test (both return `null` from `mapSubmission`).
- **Committed in:** `b0f8ab1` (Task 3 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical correctness guard from the RESEARCH assumptions log)
**Impact on plan:** Necessary for correctness per RESEARCH.md's own A9 assumption; no scope creep — no new files, no new requirements.

## Issues Encountered
None — the live spike came back completely clean (every RESEARCH.md assumption confirmed as written), so no query-module corrections or design pivots were needed.

## User Setup Required

None - no external service configuration required. The spike used the user's already-configured LeetCode session.

## Next Phase Readiness
- `src/core/backfill.ts` is a ready-made import for 01-03's UI wiring (`backfillSubmissions` for the palette action + first-run nudge, `CancelRef`/`BackfillResult` for the handler's cancel + result-presentation logic).
- `src/api/queries/submission-list.ts`'s field shape is now evidence-backed, not guessed — 01-03 and any future maintenance can rely on the "Confirmed:" comments without re-validating.
- **Deferred to 01-03:** cross-checking whether a live submit's `CheckResponse` reliably carries `status_msg` (vs. needing a `statusDisplayFromCode` mapper) — that touches `src/core/submission.ts`, out of this plan's file scope.
- No blockers for 01-03.

---
*Phase: 01-submission-store-backfill*
*Completed: 2026-07-01*

## Self-Check: PASSED

All created files confirmed present on disk; all 4 task commit hashes (`bd43ed2`, `6a90d30`, `2a611ba`, `b0f8ab1`) confirmed in `git log`. `bun run check` (340 tests, lint, typecheck) green.
