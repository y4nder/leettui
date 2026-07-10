# Roadmap: leettui — Submission History & Analytics

## Overview

This milestone adds a submission history & analytics layer to leettui across three phases, each a vertical slice that builds strictly on the prior one. **Phase 1** lays the irreducible data foundation: a `submissions` table inside the existing `questions.db`, a resumable/idempotent backfill of the user's LeetCode history, and automatic append-on-submit — all defensive, polite, and on-demand. **Phase 2** surfaces that data where the user already works: a per-problem submission-history panel in ProblemView and an attempt-count badge in the browse list. **Phase 3** aggregates everything into a new full-screen progress dashboard — streak, recent counts, difficulty breakdown, consistency score, activity heatmap, and trend sparkline — answering the core question "am I improving and keeping it up?". The strict build order is non-negotiable: the submission store must exist before anything can read it, so Phase 1 is the foundation every later phase depends on.

**Inserted before Phase 3 (2026-07-01):** two QoL phases for the offline test harness — **Phase 2.1** (manage local `case-NN.out` expected outputs so `leettui test` grades pass/fail) and **Phase 2.2** (auto-capture wrong-answer run/submit cases into offline regression tests, feeding 2.1's grading). These were promoted from the backlog and deliberately sequenced **ahead of** the Progress Dashboard, which is deferred behind them. Revised execution order: 1 → 2 → 2.1 → 2.2 → 3.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Submission Store & Backfill** - Resumable, idempotent import of LeetCode history into the local store, plus append-on-submit (all 3 plans complete, Task 4 human-verify checkpoint approved 2026-07-01)
- [x] **Phase 2: Per-Problem History & Browse Badge** - Attempt history surfaced in ProblemView and a "worked-on-before" badge in the browse list (completed 2026-07-01)
- [x] **Phase 2.1: Local Test-Case Output Management** *(INSERTED 2026-07-01)* - Populate/edit `case-NN.out` (accept-current-output / add-case) so local `leettui test` actually grades pass/fail — via a CLI verb and/or a ProblemView surface (completed 2026-07-10)
- [ ] **Phase 2.2: Auto-Capture Failing Cases** *(INSERTED 2026-07-01)* - On a wrong-answer run/submit, auto-write the failing LeetCode input + expected output into `tests/` as a reproducible offline regression case (feeds 2.1's grading)
- [ ] **Phase 3: Progress Dashboard** *(deferred behind 2.1/2.2)* - A new full-screen view: streak, recent counts, difficulty breakdown, consistency score, heatmap, and trend

## Phase Details

### Phase 1: Submission Store & Backfill

**Goal**: leettui can import the user's full LeetCode submission history into its local SQLite store and keep it current going forward — defensively, resumably, and on-demand.
**Mode:** mvp
**Depends on**: Nothing (first phase of this milestone; extends the existing leettui app)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07
**Success Criteria** (what must be TRUE):

  1. User can trigger a backfill (via the command palette) that imports their LeetCode submission history into the local store, with live in-TUI progress that never freezes the render loop.
  2. Re-running or resuming an interrupted backfill never duplicates rows and continues from where it stopped (idempotent upsert + persisted cursor).
  3. On session expiry, API rate-limiting (429), or network failure mid-backfill, leettui surfaces a clean hint and preserves partial data instead of crashing; backfill stays polite (inter-page delay + backoff) and on-demand only — no background timers.
  4. New submissions made through leettui (run/submit) are automatically recorded in the store, capturing runtime/memory percentile for free from the existing CheckResponse (zero extra API calls).
  5. The submission data lives in the existing `questions.db` keyed by `submissionId`, so the `*.db` gitignore protection covers it automatically (history is never pushed to a public solutions repo).

**Plans**: 3/3 plans complete — Task 4 (blocking human-verify checkpoint) approved 2026-07-01

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Submissions schema + embedded migration + CRUD module — table in `questions.db` keyed by `submissionId` PK, `(questionId, submittedAt)` + `submittedAt` indexes, `submissionsFetchedAt` cursor on `questions` (DATA-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — `submissionList` GraphQL query + never-throws resumable backfill service — offset/limit pagination, inter-page delay + 429 backoff, AuthError handling; includes a live spike validating the real rate-limit threshold and the field set/pagination at scale (DATA-02, DATA-03, DATA-04, DATA-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Append-on-submit + palette trigger + first-run nudge + syncSlice progress bar — upsert from CheckResponse on submit, backfill command, cancelable non-blocking in-TUI progress (DATA-06, DATA-07) — Tasks 1-3 committed and TDD-verified; Task 4 blocking human-verify checkpoint approved 2026-07-01 — see 01-03-SUMMARY.md

### Phase 2: Per-Problem History & Browse Badge

**Goal**: Users see their full attempt history for a problem the moment they open it, and the browse list flags problems they have worked on before.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: HIST-01, HIST-02, HIST-03, BROWSE-01
**Success Criteria** (what must be TRUE):

  1. Opening a problem shows a focusable history panel listing every attempt (AC/WA/TLE/CE) with language, runtime, memory, and timestamp, newest first.
  2. The history panel surfaces best (fastest AC) runtime versus latest AC runtime so the user can tell whether a re-solve improved.
  3. Per-attempt runtime/memory percentile appears inline in a history row when available — shown subtly, never as a headline (and cleanly absent for historical rows).
  4. The browse question list shows an attempt-count badge on problems the user has submitted before, richer than LeetCode's binary solved/attempted mark.

**Plans**: 3/3 plans complete

Plans:
**Wave 1** *(both plans independent — zero file overlap, run in parallel)*

- [x] 02-01-PLAN.md — Per-problem History panel: verdict/runtime utils (`verdict.ts`) → `submissionsSlice` + `HistoryPanel` + ProblemView 4th-panel placement → focus/keymap wiring (navigate-only, Enter reserved) (HIST-01, HIST-02, HIST-03)
- [x] 02-02-PLAN.md — Browse attempt-count badge: `getSubmissionCountsByQuestion` aggregate → `attemptCounts` map + `QuestionList` `×N` badge in the ◆ slot → backfill-completion refresh (BROWSE-01)

**Gap closure** *(from 02-UAT.md — tests 5 & 6, both diagnosed)*

- [x] 02-03-PLAN.md — Refresh the History panel after a live submit (`handleProblemSubmit` → `loadProblemSubmissions`, HIST-03) + fixed-width browse `×N` badge so columns stay aligned (`QuestionList` marker `.padStart`, BROWSE-01)

**UI hint**: yes

### Phase 2.1: Local Test-Case Output Management *(INSERTED)*

**Goal**: The user can populate and edit a case's expected output (`case-NN.out`) without hand-writing files, so local `leettui test` grades real pass/fail instead of the verdict-less `ran`. Closes the gap that seeded `tests/case-NN.txt` ship inputs only.
**Mode:** mvp
**Depends on**: Existing offline test harness (`src/core/testRunner.ts`, `src/core/solutions/`, `src/cli/`) — pre-milestone; no dependency on Phase 1/2 data.
**Requirements**: TCASE-01, TCASE-02, TCASE-03
**Success Criteria** (what must be TRUE):

  1. From the editor inner-loop (`:!leettui …`), the user can snapshot the current run's stdout into `case-NN.out` (a golden/accept-output workflow) so the next `leettui test` grades that case pass/fail.
  2. The user can add a brand-new local case (input + expected-output pair) without hand-creating files, and it is picked up by `discoverCases`/`pairCases` on the next run.
  3. The case-writing path reuses the existing `tests/` layout and `compareOutput` grading (JSON-normalized), and is safe/idempotent (never clobbers an unrelated case).
  4. (If a TUI surface is chosen) a ProblemView action lets the user add/edit a case and "accept current output as expected" without leaving the TUI.

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 02.1-01-PLAN.md — `leettui test --save` golden-snapshot slice: `saveGoldenOutputs` core writer (never-throws, overwrite-on-purpose, skips error/timeout) + `present.ts` created/changed/unchanged/skipped report + reminder + `exitCodeForSave`, argv-threaded `runCli`, TCASE requirements formalized (TCASE-01, TCASE-03)

**Wave 2** *(blocked on Wave 1 — shares `src/cli/index.ts` + the solutions barrel, and the add→save→grade round-trip needs `--save`)*

- [x] 02.1-02-PLAN.md — `leettui test --add-case` slice: `nextCaseName`/`addCase` core input-writer (next sequential `case-NN.txt` via `discoverCases`, never-throws) + CLI stdin/file-arg wiring, picked up by `discoverCases`/`pairCases` on the next run (TCASE-02)

**Design note**: Resolved in discuss-phase to **CLI-only** (D-01) — a `--save`/`--add-case` flag pair on the existing `test` verb; the ProblemView/TUI surface is deferred. Seams: new write helpers alongside `seedTests` in `src/core/solutions/`, flag wiring in `src/cli/`.

**UI hint**: yes *(only if the ProblemView surface is chosen; the CLI-only path is non-UI)*

### Phase 2.2: Auto-Capture Failing Cases *(INSERTED)*

**Goal**: When a `run`/`submit` comes back wrong-answer, leettui auto-captures the failing input and expected output from LeetCode's `CheckResponse` into a new local `tests/case-NN.txt` + `case-NN.out`, turning any online failure into a permanent, reproducible **offline** regression case runnable via `leettui test`.
**Mode:** mvp
**Depends on**: Phase 2.1 (reuses its case-writing/`.out` helpers) — and the existing `CheckResponse` parsing in `src/core/submission.ts`.
**Requirements**: TBD (define in discuss/plan) — provisional TCASE-04..05
**Success Criteria** (what must be TRUE):

  1. A wrong-answer verdict from `run`/`submit` writes the failing LeetCode input as a new `tests/case-NN.txt` and its `expected_output` as the sibling `case-NN.out`, using 2.1's case-writing seam.
  2. Capture is non-destructive and de-duplicated (an identical failing case is not written twice; existing cases are never overwritten).
  3. The captured case is immediately gradeable offline — `leettui test` runs it and reports pass once the solution is fixed — closing the online→offline debug loop.
  4. Capture never destabilizes the run/submit path: a parse/write failure degrades cleanly (the submit result still renders), consistent with the never-throws contract of the surrounding services.

**Plans**: 0 plans (not yet planned)

Plans:

- [ ] TBD — run `/gsd-discuss-phase 2.2` then `/gsd-plan-phase 2.2`

**Design note**: The failing-case fields (`last_testcase`/`input`, `expected_output`, `code_output`) live in the `CheckResponse` already parsed by `src/core/submission.ts`; the write path is the same tests-dir seam introduced in 2.1. Touches the run/submit handlers in `views/problem`.

### Phase 3: Progress Dashboard

**Goal**: Users can open one full-screen dashboard and instantly read whether they are improving and keeping it up — streak, recent counts, difficulty breakdown, and a consistency heatmap.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):

  1. A global keybinding opens a new full-screen dashboard view (sibling to browse/problem, routed on `mode === "dashboard"`), and Esc/q returns to browse.
  2. The dashboard shows total solved with an Easy/Medium/Hard breakdown plus last-7-day and last-30-day solve counts.
  3. The dashboard shows current and longest streak computed against the user's local day boundaries (timezone-correct), alongside a rolling 30-day consistency score.
  4. The dashboard renders an activity heatmap (52-week × 7-day grid) and a ~12-week problems-per-week trend sparkline using OpenTUI primitives and Unicode glyphs — no new dependencies.

**Plans**: 3 plans

Plans:

- [ ] 03-01: Pure, unit-tested analytics module (streak/consistency/date-bucketing, timezone-correct via `toLocaleDateString('en-CA')`) + `dashboardStats` aggregate queries and slice (DASH-02, DASH-03, DASH-04, DASH-07)
- [ ] 03-02: `DashboardView` + `app.tsx` routing + dashboard commands/bindings + global open keybinding (DASH-01)
- [ ] 03-03: Activity heatmap grid + problems-per-week trend sparkline rendered with OpenTUI primitives (DASH-05, DASH-06)

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 2.1 → 2.2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Submission Store & Backfill | 3/3 | Complete    | 2026-07-01 |
| 2. Per-Problem History & Browse Badge | 3/3 | Complete    | 2026-07-01 |
| 2.1 Local Test-Case Output Management | 2/2 | Complete    | 2026-07-10 |
| 2.2 Auto-Capture Failing Cases | 0/0 | Not started (INSERTED) | - |
| 3. Progress Dashboard | 0/3 | Deferred behind 2.1/2.2 | - |
