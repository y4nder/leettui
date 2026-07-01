---
phase: 01-submission-store-backfill
plan: 03
subsystem: ui
tags: [zustand, keymap, opentui, session, tdd, backfill]

# Dependency graph
requires:
  - phase: 01-submission-store-backfill (plan 01)
    provides: "submissions sqliteTable + questions.submissions_fetched_at cursor + src/db/submissions.ts CRUD"
  - phase: 01-submission-store-backfill (plan 02)
    provides: "src/core/backfill.ts — never-throws, resumable backfillSubmissions(onProgress?, cancelRef?, interPageDelayMs?)"
provides:
  - "src/core/submission.ts — appendSubmissionRecord + statusDisplayFromCode; every submit verdict (D-08) auto-appends to the submissions store"
  - "src/views/browse/handlers/backfill.ts — handleStartBackfill/handleCancelBackfill driving the existing syncSlice progress bar, cancelable, clears in a finally"
  - "submissions.backfill / submissions.cancelBackfill palette commands"
  - "src/core/session.ts — backfillNudgeShown flag + getBackfillNudgeShown/setBackfillNudgeShown/shouldShowBackfillNudge"
  - "uiSlice backfillNudge mode + BackfillNudge.tsx one-time first-run popup, wired into BootFlow + BrowseView"
affects: [phase-2-per-problem-history, phase-3-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD-under-strict-typecheck stub-then-implement (mirrors 01-01/01-02): RED commits ship type-checking stub bodies (`void _param;` to satisfy noUnusedVariables) so failing assertions are behavioral, not compile errors, under the repo's pre-commit tsc gate"
    - "Bare-mode popups (mirrors GitInitPrompt/ChangeLocationPrompt): BackfillNudge uses a plain useKeyboard layer in its own uiSlice mode rather than a registered keymap Command + bindings.ts entry, since no key-bearing layer is mounted in that mode"

key-files:
  created:
    - src/core/submission.test.ts
    - src/views/browse/handlers/backfill.ts
    - src/ui/components/BackfillNudge.tsx
  modified:
    - src/core/submission.ts
    - src/views/browse/handlers/index.ts
    - src/ui/keymap/commands/system.ts
    - src/core/session.ts
    - src/core/session.test.ts
    - src/ui/store/slices/uiSlice.ts
    - src/ui/components/onboarding/BootFlow.tsx
    - src/views/browse/BrowseView.tsx

key-decisions:
  - "Task 1/Task 3 RED commits shipped type-checking stubs before the real GREEN implementation (same TDD-under-strict-typecheck pattern 01-01 established), so RED failures are assertion failures, not compile errors, under the repo's zero-tolerance pre-commit gate"
  - "appendSubmissionRecord is a separately-exported pure(ish) function (not inlined in submitSolution) so Task 1's tests exercise it directly against a throwaway DB with constructed ParsedResponse values, with no live API needed"
  - "BackfillNudge uses a bare useKeyboard layer in a dedicated uiSlice mode (like GitInitPrompt/ChangeLocationPrompt) instead of registered keymap Command entries + bindings.ts — kept the deviation footprint to one file (BrowseView.tsx) instead of three (bindings.ts + commands/modal.ts + BrowseView.tsx)"
  - "Deferred requirements mark-complete for DATA-06/DATA-07 and the ROADMAP plan-progress table's 'Complete' status text until the Task 4 human checkpoint is approved — the code is committed and unit/TDD-verified, but the plan's own success_criteria explicitly requires human-verified non-blocking progress, idempotent cancel/resume, correct dates, and append-on-submit against a real account before the slice can be called done"

patterns-established:
  - "Bare-mode confirm/dismiss popups reuse useKeyboard rather than the keymap Command catalog when the popup has no reason to appear in the command palette or help screen"

requirements-completed: []
# DATA-06/DATA-07 are mechanically implemented and unit-tested here, but NOT
# marked complete in REQUIREMENTS.md yet — the plan's own success_criteria
# requires the Task 4 human checkpoint (real account, live TUI) before the
# end-to-end slice can be considered done. Mark complete after checkpoint approval.

coverage:
  - id: D1
    description: "Every leettui submit verdict (not just Accepted) auto-appends to the submissions store with runtime/memory percentile from the existing CheckResponse — zero extra API calls"
    requirement: DATA-06
    verification:
      - kind: unit
        ref: "src/core/submission.test.ts#appendSubmissionRecord > an accepted submit inserts one row with percentiles populated"
        status: pass
      - kind: unit
        ref: "src/core/submission.test.ts#appendSubmissionRecord > a non-accepted submit verdict also inserts a row (D-08), falling back to the code mapper"
        status: pass
      - kind: unit
        ref: "src/core/submission.test.ts#appendSubmissionRecord > a pending result (no submission_id) inserts nothing"
        status: pass
    human_judgment: false
  - id: D2
    description: "statusDisplayFromCode maps every known CheckResponse status code to its display string, preferring the API's own status_msg when present"
    verification:
      - kind: unit
        ref: "src/core/submission.test.ts#statusDisplayFromCode > maps every known status code"
        status: pass
      - kind: unit
        ref: "src/core/submission.test.ts#appendSubmissionRecord > prefers status_msg over the code mapper when the API supplies it"
        status: pass
    human_judgment: false
  - id: D3
    description: "A command-palette action starts a cancelable, non-blocking backfill; progress clears on success, error, AND cancel (finally block)"
    requirement: DATA-07
    verification:
      - kind: other
        ref: "grep -c finally / clearSyncProgress in src/views/browse/handlers/backfill.ts (both > 0) + bun run check (lint/typecheck/348-then-354 tests)"
        status: pass
    human_judgment: true
    rationale: "The handler's non-blocking behavior (render loop never freezes during a real multi-page backfill) and cancel/resume idempotency against a real LeetCode account can only be confirmed by watching the live interactive TUI — this is exactly Task 4's blocking human-verify checkpoint, not yet run."
  - id: D4
    description: "One-time first-run nudge: fires at most once (unconditional seeding), suppressed when submission history already exists, reuses the changelog version-change detection pattern"
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "src/core/session.test.ts#shouldShowBackfillNudge > true only when not shown, no data, and mode is browse"
        status: pass
      - kind: unit
        ref: "src/core/session.test.ts#session merge > recording the backfill nudge shown flag coexists with position + solutions dir + changelog version"
        status: pass
    human_judgment: false
  - id: D5
    description: "End-to-end demonstrable slice against a real LeetCode account: non-blocking progress bar, idempotent cancel/resume with correct dates, append-on-submit on a real submit, once-only nudge, and submissions staying inside the *.db gitignore"
    verification: []
    human_judgment: true
    rationale: "Requires launching the real leettui TUI against the user's real, authenticated LeetCode account, watching a live progress bar for freezing, cancelling mid-run, and submitting an actual solution — genuinely not automatable. This is Task 4 (type=\"checkpoint:human-verify\" gate=\"blocking\"), which has NOT yet been run."

# Metrics
duration: 20min
completed: 2026-07-01
status: blocked
---

# Phase 1 Plan 3: Append-on-Submit + Backfill Trigger + First-Run Nudge Summary

**Tasks 1-3 committed and green (append-on-submit for every submit verdict, a cancelable non-blocking backfill palette command, and a one-time first-run nudge) — Task 4's blocking human-verify checkpoint (real LeetCode account, live TUI) has NOT yet been run, so this plan is not yet complete.**

## Performance

- **Duration:** ~20 min (Tasks 1-3 only; Task 4 pending)
- **Completed (Tasks 1-3):** 2026-07-01
- **Tasks:** 3 of 4 (Task 1 and Task 3 were TDD: RED + GREEN commits each; Task 2 was a single feat commit)
- **Files modified:** 11 (3 created, 8 modified — 1 modification beyond the plan's declared file list, see Deviations)

## Accomplishments
- `src/core/submission.ts` gained `statusDisplayFromCode(code)` (the CheckResponse status-code → display-string map) and `appendSubmissionRecord(question, langSlug, result)`, wired into `submitSolution` right after `pollResult` resolves — every submit verdict (WA/TLE/CE/RE/MLE, not just Accepted — D-08) now inserts a `submissions` row with percentiles from the existing CheckResponse, zero extra API calls; `runSolution` is untouched since runs use `interpret_id` and never carry a `submission_id`
- `src/views/browse/handlers/backfill.ts` drives the never-throws `backfillSubmissions` service (01-02) through the existing `syncSlice` progress bar — no new UI, the bar renders for free in both Browse and Problem views. `clearSyncProgress()` runs in a `finally` block so the bar clears on success, error, AND cancel (Pitfall 6), never freezing. Two new palette commands (`submissions.backfill`, `submissions.cancelBackfill`) wire it up; a second start while one is running is a no-op info message, and cancel is a no-op when idle (mirrors `update.dismiss`)
- `src/core/session.ts` gained the `backfillNudgeShown` flag + `getBackfillNudgeShown`/`setBackfillNudgeShown` accessors (mirroring the changelog-version accessor pair) and the pure `shouldShowBackfillNudge(nudgeShown, hasAnySubmissions, mode)` decision function
- `uiSlice` gained a bare `"backfillNudge"` mode + `showBackfillNudge`/`hideBackfillNudge` (follows the `showGitInit`/`showGitRemote` pattern); `BackfillNudge.tsx` is a light, dismissible popup (not a blocking gate) using a plain `useKeyboard` layer (mirrors `GitInitPrompt`/`ChangeLocationPrompt`) — `r`/Enter runs the backfill now, Esc/`l`/`q` dismiss
- `BootFlow.tsx` wires the nudge in right after `syncIfEmpty`/`clearSyncProgress` (needs the now-open DB to check for existing submission rows); `setBackfillNudgeShown()` is called UNCONDITIONALLY after the show-check — mirrors `setLastShownChangelogVersion`'s seeding invariant exactly, so the nudge can fire at most once, ever

## Task Commits

Each task was committed atomically:

1. **Task 1: Append-on-submit (all verdicts) + statusDisplay helper + tests (TDD)**
   - `369da88` (test) — RED: 8 failing tests against type-checking stubs
   - `5d6e0e4` (feat) — GREEN: real implementation, all 8 tests pass
2. **Task 2: Backfill view handler + palette/cancel commands + non-blocking progress wiring** - `3be2079` (feat)
3. **Task 3: First-run nudge — session flag + uiSlice action + BackfillNudge + BootFlow wiring (TDD)**
   - `c7b0330` (test) — RED: 2 failing tests against type-checking stubs (9 pre-existing session tests still pass)
   - `536f050` (feat) — GREEN: real implementation across session.ts/uiSlice.ts/BackfillNudge.tsx/BootFlow.tsx/BrowseView.tsx, all 11 session tests pass

**Task 4: [CHECKPOINT] Verify the end-to-end backfill + append slice against a real account** — NOT YET RUN. See "CHECKPOINT REACHED" in the executor's return message; this SUMMARY documents Tasks 1-3 only.

_Note: no separate REFACTOR commits were needed for either TDD task — each GREEN implementation was already clean per `bun run check`._

## TDD Gate Compliance

- Task 1 RED gate: `test(01-03): add failing tests for append-on-submit (RED)` (`369da88`) — 5 of 8 assertions failing against the stub (3 pass trivially since the stub is a no-op and those cases assert nothing was inserted).
- Task 1 GREEN gate: `feat(01-03): append every submit verdict to the submissions store (GREEN)` (`5d6e0e4`) — all 8 tests pass immediately after GREEN.
- Task 3 RED gate: `test(01-03): add failing tests for the backfill nudge flag (RED)` (`c7b0330`) — 2 of 11 session tests failing against the stub (9 pre-existing tests untouched and still passing).
- Task 3 GREEN gate: `feat(01-03): one-time first-run backfill nudge (GREEN)` (`536f050`) — all 11 session tests pass immediately after GREEN.
- No REFACTOR commits — `bun run check` (354 tests, Biome, `tsc --noEmit`) was already green after each GREEN.

## Files Created/Modified
- `src/core/submission.ts` - `statusDisplayFromCode` + `appendSubmissionRecord`, wired into `submitSolution`
- `src/core/submission.test.ts` - 8 tests covering the append-on-submit behavior contract
- `src/views/browse/handlers/backfill.ts` - `handleStartBackfill`/`handleCancelBackfill`
- `src/views/browse/handlers/index.ts` - barrel re-export for `./backfill`
- `src/ui/keymap/commands/system.ts` - `submissions.backfill`/`submissions.cancelBackfill` palette commands
- `src/core/session.ts` - `backfillNudgeShown` field + `getBackfillNudgeShown`/`setBackfillNudgeShown`/`shouldShowBackfillNudge`
- `src/core/session.test.ts` - cross-boot merge test + pure `shouldShowBackfillNudge` tests
- `src/ui/store/slices/uiSlice.ts` - `"backfillNudge"` mode + `showBackfillNudge`/`hideBackfillNudge`
- `src/ui/components/BackfillNudge.tsx` - the one-time first-run nudge popup
- `src/ui/components/onboarding/BootFlow.tsx` - post-sync nudge wiring (unconditional `setBackfillNudgeShown()` seeding)
- `src/views/browse/BrowseView.tsx` - mounts `<BackfillNudge/>` on `mode === "backfillNudge"` (deviation, see below)

## Decisions Made
- Task 1/Task 3 RED commits shipped type-checking stubs (mirroring 01-01's established pattern) so the pre-commit `tsc --noEmit` gate stays green while the failing tests are genuinely behavioral.
- `appendSubmissionRecord` is exported as its own function so it can be unit-tested directly against a throwaway DB with constructed `ParsedResponse` values, with no live network call needed.
- Deferred `requirements mark-complete` for DATA-06/DATA-07 and the ROADMAP "Complete" status text until Task 4's human checkpoint is approved (see Deviations/Next Phase Readiness) — the underlying code is done and unit-tested, but the plan's own success_criteria requires a human-verified live-account run first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Mounted `BackfillNudge` in `BrowseView.tsx`**
- **Found during:** Task 3
- **Issue:** The plan's `files_modified` frontmatter listed `src/ui/components/BackfillNudge.tsx` and the `uiSlice.ts`/`BootFlow.tsx` wiring, but no file actually renders the component on a mode match — without that, the nudge component exists but can never appear or receive input, making the whole first-run-nudge feature (D-01) unreachable.
- **Fix:** Added a one-line mount (`{mode === "backfillNudge" && <BackfillNudge />}`) to `BrowseView.tsx`, alongside the existing `ChangelogPopup`/`RecentPopup` mode-gated mounts it already has.
- **Files modified:** `src/views/browse/BrowseView.tsx`
- **Verification:** `bun run check` green (354 tests); manually traced the render path — `BootFlow` → `showBackfillNudge()` sets `mode: "backfillNudge"` → `App` routes to `BrowseView` (mode !== "problem") → the new mount renders `<BackfillNudge/>`.
- **Committed in:** `536f050` (Task 3 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical — component would otherwise be unreachable)
**Impact on plan:** Necessary for the first-run nudge to actually function; no scope creep, no new requirements — a single one-line addition to an existing file that already contains four analogous mode-gated mounts.

## Issues Encountered
None beyond the deviation above — both TDD tasks' RED commits failed exactly as expected (behavioral assertion failures against stubs, not compile errors), and every GREEN commit passed `bun run check` on the first attempt.

## User Setup Required

None - no external service configuration required. Task 4's checkpoint needs the user's *existing* authenticated LeetCode session (no new setup), just an interactive terminal session to watch and drive.

## Next Phase Readiness

**This plan is NOT complete.** Tasks 1-3 are committed, tested, and `bun run check` green (354 tests), but Task 4 — a `type="checkpoint:human-verify" gate="blocking"` end-to-end verification against a real LeetCode account — has not been run. Per the plan's own success_criteria, the phase's "end-to-end slice is demonstrable" claim and DATA-06/DATA-07 cannot be marked done until a human:

1. Confirms the palette backfill shows non-blocking progress that never freezes the render loop.
2. Confirms cancel mid-run clears progress and a re-run resumes without duplicating rows.
3. Confirms stored `submitted_at` dates are sane (not 1970) and statuses span multiple verdicts.
4. Confirms a real submit auto-appends a row with runtime/memory percentile, no extra network call.
5. Confirms the nudge fired once and does not reappear.
6. Confirms `submissions` lives inside `questions.db` (covered by the existing `*.db` gitignore).

Once approved: mark DATA-06/DATA-07 complete in REQUIREMENTS.md, flip this SUMMARY's `status` to `complete`, check off the `01-03-PLAN.md` bullet and the Phase 1 top-level checkbox in ROADMAP.md, and the phase closes out — Phase 2 (per-problem history) and Phase 3 (dashboard) both depend on this store being live and populated.

---
*Phase: 01-submission-store-backfill*
*Tasks 1-3 completed: 2026-07-01 — Task 4 pending human checkpoint*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 5 task commit hashes
(`369da88`, `5d6e0e4`, `3be2079`, `c7b0330`, `536f050`) confirmed in `git log`.
`bun run check` green (354 tests). Task 4 checkpoint intentionally not
self-checked here — it requires a human.
