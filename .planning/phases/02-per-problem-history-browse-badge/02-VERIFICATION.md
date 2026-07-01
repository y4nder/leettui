---
phase: 02-per-problem-history-browse-badge
verified: 2026-07-01T12:45:00Z
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9 must-haves verified (7 items deferred to human verification)
  gaps_closed:
    - "The live-submitted row shows a dim `(top N%)` parenthetical after the runtime; backfilled rows show no percentile text at all (no dash/placeholder)." — UAT test 5 (HIST-03): History panel now auto-refreshes after a live submit
    - "The submitted problem shows `×N` in the marker slot ... never-attempted problem shows blank ... solution-file-only problem shows `◆`." — UAT test 6 (BROWSE-01): browse badge is now fixed-width, columns stay aligned
  gaps_remaining: []
  regressions: []
---

# Phase 2: Per-Problem History & Browse Badge Verification Report

**Phase Goal:** Users see their full attempt history for a problem the moment they open it, and the browse list flags problems they have worked on before.
**Verified:** 2026-07-01T12:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (02-03-PLAN.md / 02-03-SUMMARY.md)

## Context

This is a re-verification following UAT (`02-UAT.md`). The initial automated verification (2026-07-01T03:15:40Z) passed all 9 automated must-haves but deferred 7 items to human verification (`status: human_needed`). The user then ran a live-terminal UAT pass covering all 7 items: 5 passed outright (tests 1, 2, 3, 4, 7), and 2 surfaced real gaps (test 5 / HIST-03, test 6 / BROWSE-01). Both gaps were root-caused via dedicated debug sessions (now moved to `.planning/debug/resolved/`) and closed by a single gap-closure plan, `02-03-PLAN.md` (`gap_closure: true`), executed and documented in `02-03-SUMMARY.md`. `02-UAT.md` frontmatter is now `status: resolved` with both gap entries marked `status: resolved`.

This report re-verifies the two closed gaps directly against the code (not the UAT/SUMMARY narrative), and re-confirms the other 9 previously-passed automated must-haves (plus the 5 UAT-confirmed items) have not regressed.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening a problem shows a History panel listing every attempt newest-first with color-coded verdict glyph, language, runtime, memory, relative timestamp (HIST-01) | ✓ VERIFIED | Unchanged since initial verification — `HistoryPanel.tsx`, `getSubmissionsForQuestion`, `handleEnterProblemView` all untouched by 02-03 (confirmed by `git diff --stat` showing only `handlers.ts` + `QuestionList.tsx` changed). UAT test 1: pass. |
| 2 | History is the 4th right-column panel, focusable via Tab/[5], navigable via j/k/gg/G, Enter unbound (D-08/09/10) | ✓ VERIFIED | Unchanged (`problemSlice.ts`, `bindings.ts` untouched by 02-03). UAT test 4: pass. |
| 3 | History panel always renders, even with zero submissions ("No attempts yet") (D-04) | ✓ VERIFIED | Unchanged (`HistoryPanel.tsx` untouched). UAT test 3: pass. |
| 4 | History panel surfaces best vs. latest AC runtime, gated on 2+ AC, colored direction arrow (HIST-02, D-05/06/07) | ✓ VERIFIED | Unchanged (`verdict.ts` untouched). UAT test 2: pass. |
| 5 | **Per-attempt runtime percentile appears inline when available, cleanly absent for backfilled rows, AND the History panel reflects a live submission's new row (with percentile) without exiting/re-entering the problem (HIST-03, D-03)** | ✓ VERIFIED | **Gap closed.** `src/views/problem/handlers.ts:362-377` — `handleProblemSubmit`'s success callback now calls `useAppStore.getState().loadProblemSubmissions(p.question.id)` immediately after `submitSolution(p.question, langSlug)` resolves and before `setProblemResult(...)`. `submitSolution` (`core/submission.ts`) persists the new row to SQLite via `appendSubmissionRecord` for every verdict before its promise resolves, so the re-read is guaranteed fresh. `loadProblemSubmissions` is the sole action populating `submissionsSlice.problemSubmissions`/`submissionSummary`, which `HistoryPanel` renders reactively — confirmed by `grep -n "loadProblemSubmissions" src/views/problem/handlers.ts` returning exactly 2 hits (line 124: the pre-existing call in `handleEnterProblemView`; line 368: the new call in `handleProblemSubmit`), matching the plan's own verify step. `handleProblemRun` (line 334-344) is unchanged — correctly not given the same call, since `runSolution` never persists a submission row. UAT test 5, originally `issue` (major — "does not refresh automatically"), is now `resolved` in `02-UAT.md`. |
| 6 | The browse question list shows a raw attempt-count badge (`×N`) on 1+-submission problems, no badge on never-attempted problems (BROWSE-01, D-11) | ✓ VERIFIED | Unchanged core logic (`QuestionList.tsx:76`: `attemptCount = attemptCounts.get(q.id) ?? 0`) plus the gap fix below. |
| 7 | The count includes every submission regardless of verdict (D-12) | ✓ VERIFIED | Unchanged (`getSubmissionCountsByQuestion` untouched by 02-03). |
| 8 | **The badge reuses the ◆ slot with D-13/D-14 precedence, AND renders as a fixed-width column so `×N` digit-count variance does not shift trailing columns out of alignment (D-13/D-14 + UAT test 6)** | ✓ VERIFIED | **Gap closed.** `src/ui/components/QuestionList.tsx:79-81`: a new `markerStr` const, computed alongside the pre-existing `idStr`/`acStr`/`runtimeStr` fixed-width columns, holds the same D-14 precedence value (`attemptCount > 0 ? ×N : hasSolution ? ◆ : " "`) and is right-aligned via `.padStart(3, " ")` — matching the sibling columns' idiom exactly. Line 91 renders `<text fg={colors.accent}>{markerStr}</text>` in the same slot (between the status icon and `idStr` cells) — no new column added, no sibling column moved (D-13 preserved), precedence order unchanged (D-14 preserved). `grep -q 'markerStr'` and `grep -q 'padStart(3'` both succeed in the file. UAT test 6, originally `issue` (cosmetic — "kinda misaligned the ui"), is now `resolved` in `02-UAT.md`. |
| 9 | After a backfill import, badges update without restarting the app, on every exit path (RESEARCH Pitfall 4) | ✓ VERIFIED | Unchanged (`backfill.ts` untouched by 02-03). UAT test 7: pass. |

**Score:** 9/9 phase-goal truths verified (0 present-but-behavior-unverified); plus 2 additional gap-closure truths (folded into truths 5 and 8 above) — 11/11 total must-haves across initial + gap-closure plans.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/views/problem/handlers.ts` | `handleProblemSubmit` re-loads submissions after submit resolves | ✓ VERIFIED | `loadProblemSubmissions(p.question.id)` call present at line 368, before `setProblemResult`; `handleProblemRun` correctly unchanged |
| `src/ui/components/QuestionList.tsx` | Marker cell pre-padded to fixed width like `idStr`/`acStr`/`runtimeStr` | ✓ VERIFIED | `markerStr` const at lines 79-81, `.padStart(3, " ")`, rendered at line 91 |
| All 7 artifacts from initial verification (`verdict.ts`, `HistoryPanel.tsx`, `submissionsSlice.ts`, `db/submissions.ts`, `attemptCounts`/`refreshAttemptCounts`, badge render) | Unchanged | ✓ VERIFIED (no regression) | `git diff --stat` since `02-03-PLAN.md` creation shows only the 2 files above touched — every other artifact from the initial verification is byte-identical |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `handleProblemSubmit` | `submissionsSlice.problemSubmissions`/`submissionSummary` | `loadProblemSubmissions(p.question.id)` call after `submitSolution` resolves | WIRED | `handlers.ts:368` — new link, confirmed present and correctly ordered before `setProblemResult` |
| `submissionsSlice` (post-submit refresh) | `HistoryPanel` re-render | Reactive Zustand selector in `ProblemView.tsx` (unchanged) | WIRED | Component subscribes to store state, not a one-time snapshot — re-population via `loadProblemSubmissions` triggers a re-render automatically |
| `QuestionList` marker string | `.padStart(3, " ")` | `markerStr` const, same computation block as `idStr`/`acStr`/`runtimeStr` | WIRED | `QuestionList.tsx:79-81,91` |
| All key links from initial verification (`handleEnterProblemView`→`submissionsSlice`, `problemSlice`→focus/cursor, `questionsSlice`→`attemptCounts`, `BrowseView`→`QuestionList`, backfill `finally`→`refreshAttemptCounts`) | — | Unchanged | WIRED (no regression) | Confirmed unchanged — none of these files were touched by 02-03 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `HistoryPanel` (post-submit) | `problemSubmissions` (re-fetched) | `getSubmissionsForQuestion(questionId)` — real Drizzle query, re-run after `submitSolution` has already written the new row via `appendSubmissionRecord` | Yes | ✓ FLOWING |
| `QuestionList` badge | `markerStr` (formatted) | `attemptCounts.get(q.id)` (real aggregate, unchanged) → local `.padStart(3)` string formatting | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| type safety across both gap-closure edits | `bun run typecheck` | clean, no errors | ✓ PASS |
| zero-warning lint gate | `bun run lint` (biome check --error-on-warnings) | "Checked 185 files in 59ms. No fixes applied." | ✓ PASS |
| full workspace test suite (regression check, run once) | `bun test` | 378 pass, 0 fail, 896 expect() calls | ✓ PASS (matches 02-03-SUMMARY.md's claimed count exactly) |
| `loadProblemSubmissions` call-site count | `grep -n "loadProblemSubmissions" src/views/problem/handlers.ts` | 2 hits: line 124 (`handleEnterProblemView`, pre-existing) + line 368 (`handleProblemSubmit`, new) | ✓ PASS |
| `markerStr`/`padStart(3` presence | `grep -q 'markerStr'` / `grep -q 'padStart(3'` in `QuestionList.tsx` | both found | ✓ PASS |
| debt-marker scan on touched files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` on both files | no matches | ✓ PASS |
| scope containment (no unintended files touched) | `git diff --stat 641a861..HEAD -- src/` | exactly 2 files, 5 insertions/3 deletions total | ✓ PASS |
| live-terminal confirmation of both fixes | *(already exercised once by the user)* | UAT test 5 and test 6 marked `status: resolved` in `02-UAT.md` after the fix was applied | ✓ PASS — treated as human-confirmed per task instructions; not re-run live in this session |

### Probe Execution

Not applicable — this phase is not a migration/CLI/tooling phase and declares no `scripts/*/tests/probe-*.sh`. Skipped (same as initial verification).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| HIST-01 | 02-01-PLAN.md | ProblemView shows a per-problem submission-history panel listing every attempt with status/lang/runtime/memory/timestamp | ✓ SATISFIED | Truths 1-3 (unchanged, UAT-confirmed) |
| HIST-02 | 02-01-PLAN.md | History panel surfaces best (fastest AC) vs. latest AC runtime | ✓ SATISFIED | Truth 4 (unchanged, UAT-confirmed) |
| HIST-03 | 02-01-PLAN.md, 02-03-PLAN.md | Per-attempt runtime/memory percentile shown inline; History panel reflects live submissions in-session | ✓ SATISFIED | Truth 5 — gap closed via `handlers.ts:368`, UAT test 5 now resolved |
| BROWSE-01 | 02-02-PLAN.md, 02-03-PLAN.md | Browse question list shows a "solved/attempted before" badge (attempt count), fixed-width and column-aligned | ✓ SATISFIED | Truths 6, 7, 9 (unchanged, UAT-confirmed) + Truth 8 — gap closed via `QuestionList.tsx:79-81,91`, UAT test 6 now resolved |

**Orphaned requirements check:** REQUIREMENTS.md maps exactly HIST-01, HIST-02, HIST-03, BROWSE-01 to Phase 2 — all marked `[x]` complete in the requirements checklist and "Complete" in the traceability table. `02-03-PLAN.md` frontmatter declares `requirements: [HIST-03, BROWSE-01]`, consistent with which requirements the two UAT gaps mapped to. No orphaned requirements found.

### Anti-Patterns Found

None. Re-scanned the 2 files touched by the gap-closure plan (`src/views/problem/handlers.ts`, `src/ui/components/QuestionList.tsx`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|not available|coming soon` — zero matches. The diff is minimal and additive (1 line added in `handlers.ts`; a new const + one render-line change in `QuestionList.tsx`), matching the "localized, single-file, no interdependency" scope both the plan and SUMMARY describe.

### Human Verification Required

None. The two items that previously blocked `passed` status (UAT tests 5 and 6) have been closed by code fixes verified directly above (not merely claimed by SUMMARY.md), and the user has already exercised both fixes live and marked them `resolved` in `02-UAT.md`. The remaining 5 human-verification items from the initial verification (tests 1, 2, 3, 4, 7) were already confirmed `pass` by the user during the same UAT session and are unaffected by this gap-closure plan (no code they depend on was touched — confirmed via `git diff --stat`).

### Gaps Summary

No gaps remain. Both UAT-surfaced gaps are closed and independently re-verified against the code:

1. **HIST-03 / UAT test 5 (major):** `handleProblemSubmit` now calls `loadProblemSubmissions(p.question.id)` right after `submitSolution` resolves, so the History panel reflects a live submission in-session without exiting and re-entering the problem. Confirmed via direct code read of `src/views/problem/handlers.ts:368` plus the exact call-count grep the plan specified.
2. **BROWSE-01 / UAT test 6 (cosmetic):** the browse `×N`/`◆`/blank marker cell is now a fixed-width `markerStr` (`.padStart(3, " ")`), computed alongside the pre-existing fixed-width `idStr`/`acStr`/`runtimeStr` columns, so digit-count variance no longer shifts trailing columns out of alignment. Confirmed via direct code read of `src/ui/components/QuestionList.tsx:79-81,91`.

Both fixes are scope-contained (only the 2 named files changed since the gap-closure plan was authored), pass `typecheck`/`lint`/the full 378-test suite with zero regressions, and carry no debt markers. The phase goal — "Users see their full attempt history for a problem the moment they open it, and the browse list flags problems they have worked on before" — is now fully achieved and verified, including the in-session freshness and visual-alignment properties the initial pass could not close without a live-terminal UAT pass.

---

*Verified: 2026-07-01T12:45:00Z*
*Verifier: Claude (gsd-verifier)*
*Sources: 02-03-PLAN.md, 02-03-SUMMARY.md, 02-UAT.md (status: resolved), previous 02-VERIFICATION.md (status: human_needed, superseded by this report)*
