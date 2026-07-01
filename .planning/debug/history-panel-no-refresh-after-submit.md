---
status: diagnosed
trigger: "history-panel-no-refresh-after-submit — After a user submits a solution live (pressing `s` in the problem view, `problem.submitFocused` -> `handleProblemSubmit`), the per-problem History panel does not refresh to show the newly-created submission row (with its runtime percentile). The user has to do something else (unclear what) to see it."
created: 2026-07-01T00:00:00Z
updated: 2026-07-01T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — handleProblemSubmit never calls loadProblemSubmissions() after a successful submit, so the Zustand submissionsSlice state (problemSubmissions/submissionSummary) that HistoryPanel renders stays stale from problem-entry time; the DB itself is written correctly by appendSubmissionRecord.
test: Traced loadProblemSubmissions call sites across src/ (grep) and read src/views/problem/handlers.ts + src/core/submission.ts + src/views/problem/ProblemView.tsx in full.
expecting: n/a — root cause confirmed, diagnose-only mode, no fix applied.
next_action: none — investigation complete, return ROOT CAUSE FOUND to caller.

## Symptoms

expected: After a live submission completes (accepted or not), the History panel (src/ui/components/HistoryPanel.tsx, backed by src/ui/store/slices/submissionsSlice.ts) should reflect the new submission without requiring an app restart or manual reload — ideally immediately after the run/submit result comes back.
actual: User reports (verbatim): "it does not refresh automatically the history panel after s"
errors: None reported
reproduction: Test 5 in UAT (.planning/phases/02-per-problem-history-browse-badge/02-UAT.md) — open a problem with a local solution, press `s` to submit, wait for Accepted result, observe the History panel does not show the new row.
started: Discovered during UAT for Phase 02 (per-problem-history-browse-badge), immediately after Phase 02 execution completed.

## Eliminated

- hypothesis: HistoryPanel/ProblemView isn't subscribed to the right Zustand slice fields (a rendering-layer bug).
  evidence: ProblemView.tsx:120-121 subscribes to `problemSubmissions`/`submissionSummary` via `useAppStore((s) => ...)` (reactive selector) and passes them straight through to `<HistoryPanel submissions={problemSubmissions} summary={submissionSummary} .../>` at line 241-243. This is correctly wired — if the store state were updated, the panel would rerender.
  timestamp: 2026-07-01T00:04:00Z

## Evidence

- timestamp: 2026-07-01T00:02:00Z
  checked: src/ui/store/slices/submissionsSlice.ts (full file)
  found: `loadProblemSubmissions(questionId)` synchronously reads `getSubmissionsForQuestion(questionId)` and sets both `problemSubmissions` and `submissionSummary` (derived via `summarizeAcRuntime`). This is the ONLY action that refreshes the slice; there is no subscription/watcher — it must be called explicitly by a handler.
  implication: Any code path that writes a new submission row to the DB must also explicitly call `loadProblemSubmissions` again, or the store stays stale.

- timestamp: 2026-07-01T00:02:30Z
  checked: "grep -rn loadProblemSubmissions src (all call sites)"
  found: Exactly one call site in the whole codebase — src/views/problem/handlers.ts:124, inside `handleEnterProblemView` (called once when a problem is opened / navigate-replaced via Related panel).
  implication: There is no call to `loadProblemSubmissions` anywhere in the run/submit code path. The store is populated once on entry and never refreshed again while the user stays in the same ProblemView session.

- timestamp: 2026-07-01T00:03:00Z
  checked: src/views/problem/handlers.ts:362-376 (handleProblemSubmit)
  found: |
    export async function handleProblemSubmit(triggerKey: string) {
      await withFocusedSolution(triggerKey, "handleProblemSubmit", async (p, langSlug) => {
        const result = await submitSolution(p.question, langSlug);
        useAppStore.getState().setProblemResult(buildResultView(result));
      }, { loadingMessage: "Submitting solution...", errorTitle: "Submit error", solutionErrorArm: true });
    }
    After `submitSolution` resolves, the only store write is `setProblemResult(...)` (updates the inline Result panel). No call to `loadProblemSubmissions(p.question.id)`.
  implication: This is the exact spot where the refresh call is missing — `p.question.id` is already in scope, so a one-line addition would fix the Result panel's sibling stale-state bug too if it existed elsewhere.

- timestamp: 2026-07-01T00:03:30Z
  checked: src/core/submission.ts:102-121 (submitSolution) + :50-71 (appendSubmissionRecord)
  found: |
    submitSolution polls the result, then calls `appendSubmissionRecord(question, langSlug, result)` synchronously, which — for any result carrying a `submission_id` (i.e. every real submit, not just Accepted, per the D-08 comment) — calls `insertSubmission({...})` writing directly into the `submissions` SQLite table via db/submissions.ts. This happens BEFORE `handleProblemSubmit`'s `setProblemResult` call.
  implication: The DB write is correct and unconditional (confirmed by the D-08 comment: "every verdict, not just accepted, is stored"). The bug is purely on the read/refresh side — the SQLite row exists immediately after submit, but nothing tells the Zustand submissionsSlice to re-read it.

- timestamp: 2026-07-01T00:04:30Z
  checked: src/views/problem/handlers.ts:334-344 (handleProblemRun, for comparison)
  found: handleProblemRun also never calls loadProblemSubmissions — but `runSolution` never calls `appendSubmissionRecord` (only submit does, confirmed by the "only submitSolution calls it" comment at core/submission.ts:48-49), so Run correctly has no DB submission row to refresh for. This confirms the missing-refresh gap is specific to the submit path.
  implication: The fix belongs only in handleProblemSubmit (and its withFocusedSolution success path), not handleProblemRun.

## Resolution

root_cause: >
  `handleProblemSubmit` (src/views/problem/handlers.ts:362-376) never re-invokes
  `useAppStore.getState().loadProblemSubmissions(p.question.id)` after `submitSolution`
  resolves. `submitSolution` (src/core/submission.ts:102-121) does correctly persist the
  new submission row to SQLite via `appendSubmissionRecord`/`insertSubmission` (for every
  verdict, not just Accepted) — so the underlying data is always fresh and correct on
  disk. But the `submissionsSlice`'s in-memory `problemSubmissions`/`submissionSummary`
  state (which `HistoryPanel` renders, via `ProblemView.tsx`'s reactive Zustand selectors)
  is a one-time snapshot loaded only by `loadProblemSubmissions`, whose single call site
  in the entire codebase is `handleEnterProblemView` (fired once when the problem is
  opened/navigate-replaced). Nothing re-fires that load after a live submit, so the panel
  keeps rendering the pre-submit snapshot until the user exits and re-enters the problem
  view (or navigates via the Related panel, which internally calls
  `handleEnterProblemView` again) — matching the user's report that "it does not refresh
  automatically... [they] have to do something else" to see it.
fix: (not applied — diagnose-only mode)
verification: (not applicable — diagnose-only mode)
files_changed: []
