# Roadmap: leettui — Submission History & Analytics

## Overview

This milestone adds a submission history & analytics layer to leettui across three phases, each a vertical slice that builds strictly on the prior one. **Phase 1** lays the irreducible data foundation: a `submissions` table inside the existing `questions.db`, a resumable/idempotent backfill of the user's LeetCode history, and automatic append-on-submit — all defensive, polite, and on-demand. **Phase 2** surfaces that data where the user already works: a per-problem submission-history panel in ProblemView and an attempt-count badge in the browse list. **Phase 3** aggregates everything into a new full-screen progress dashboard — streak, recent counts, difficulty breakdown, consistency score, activity heatmap, and trend sparkline — answering the core question "am I improving and keeping it up?". The strict build order is non-negotiable: the submission store must exist before anything can read it, so Phase 1 is the foundation every later phase depends on.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Submission Store & Backfill** - Resumable, idempotent import of LeetCode history into the local store, plus append-on-submit
- [ ] **Phase 2: Per-Problem History & Browse Badge** - Attempt history surfaced in ProblemView and a "worked-on-before" badge in the browse list
- [ ] **Phase 3: Progress Dashboard** - A new full-screen view: streak, recent counts, difficulty breakdown, consistency score, heatmap, and trend

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

**Plans**: 3 plans

Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Submissions schema + embedded migration + CRUD module — table in `questions.db` keyed by `submissionId` PK, `(questionId, submittedAt)` + `submittedAt` indexes, `submissionsFetchedAt` cursor on `questions` (DATA-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — `submissionList` GraphQL query + never-throws resumable backfill service — offset/limit pagination, inter-page delay + 429 backoff, AuthError handling; includes a live spike validating the real rate-limit threshold and the field set/pagination at scale (DATA-02, DATA-03, DATA-04, DATA-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Append-on-submit + palette trigger + first-run nudge + syncSlice progress bar — upsert from CheckResponse on submit, backfill command, cancelable non-blocking in-TUI progress (DATA-06, DATA-07)

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

**Plans**: 2 plans

Plans:

- [ ] 02-01: `submissionsSlice` per-problem reads + `problemSlice` history-panel state + `HistoryPanel` component wired into ProblemView (mirrors RelatedPanel) (HIST-01, HIST-02, HIST-03)
- [ ] 02-02: Browse attempt-count badge derived from submission history (BROWSE-01)

**UI hint**: yes

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
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Submission Store & Backfill | 0/3 | Not started | - |
| 2. Per-Problem History & Browse Badge | 0/2 | Not started | - |
| 3. Progress Dashboard | 0/3 | Not started | - |
