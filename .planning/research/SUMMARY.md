# Project Research Summary

**Project:** leettui — submission history & analytics milestone  
**Domain:** Terminal UI for LeetCode with offline-first local analytics layer  
**Researched:** 2026-06-26  
**Confidence:** MEDIUM-HIGH (API and architecture derived from codebase; LeetCode GraphQL verified against JacobLinCool/LeetCode-Query; community consensus on rate limits and UX patterns)

---

## Executive Summary

Building leettui's submission history & analytics layer is a **brownfield integration task**, not greenfield architecture. The required data is already reachable via LeetCode's unofficial GraphQL API (`submissionList` paginated query); the challenge is **storing it safely, resumably, and offline** without hammering the rate-limited API or duplicating data.

The four researchers converged on a single strict pattern: **offset-based pagination (not cursor), idempotent upsert by submission ID, per-page throttling (300–500 ms), percentile deferred (not included in bulk backfill), and data stored in the existing SQLite alongside questions**. This sidesteps N+1 API calls, cookie-expiry mid-backfill, timezone bugs, and render-loop blocking by enforcing specific design decisions upfront rather than bolting them on after a naive implementation fails.

The roadmap should **follow the build order rigidly** — data model first, then backfill service, then UI — because each layer has hard dependencies. Skipping a phase or swapping their order will compound complexity. The open questions (exact submissionList field set, real rate-limit threshold, lazy percentile UI placement) can be validated during planning's research-phase gates without blocking execution.

---

## Key Findings

### Recommended Stack

All four researchers affirm: **no new dependencies needed**. The stack is closed.

**Core technologies:**

- **SQLite + Drizzle on bun:sqlite** (0.44.4 / 0.31.10) — Reuse the existing persistence layer. Add a `submissions` table + `submissionsFetchedAt` column on `questions` via Drizzle migrations (3-step process: edit schema, `bun run db:generate`, embed in `migrations.ts`). No new persistence concerns.

- **Zustand domain slice (submissionsSlice)** — Reuse the UI/domain split. New `submissionsSlice.ts` owns `problemSubmissions` (per-problem history) and `dashboardStats` (aggregates). Ephemeral `backfillProgress` lives in `uiSlice` (parallel to `syncSlice.syncProgress`). No new state library.

- **OpenTUI React intrinsics** — Render progress bars, heatmaps, and sparklines using existing `<box>`, `<text>`, `<scrollbox>` primitives + Unicode block glyphs. Reuse `smoothBar()` and theme tokens from `progress.ts`. No charting library.

- **LeetCode GraphQL (unofficial)** — New `src/api/queries/submission-list.ts` query following the existing `fetchQuestionList` pattern (30 lines, no external HTTP library). No new client dependency; reuse `src/api/client.ts` and `gqlQuery`.

**Why this stack:**
- Fits perfectly into the existing `Bun/OpenTUI/SQLite/Drizzle/Zustand` architecture — no parallel stack needed, no dependency creep.
- Avoids charting/date libraries (`date-fns`, `moment`, `blessed-contrib`) that would compete with OpenTUI's renderer or break leettui's lean-deps ethos.
- The LeetCode API fields (`submissionList`, `submissionDetails`) are known via community reference (`JacobLinCool/LeetCode-Query` raw GraphQL source); no discovery phase needed.

---

### Expected Features

**Table stakes (MVP — Phase 1):**
1. **Submission store** — Backfill via paginated `submissionList`, append on submit.
2. **Per-problem history panel** — Attempts (AC/WA/TLE/etc.) with runtime, memory, timestamp, displayed in ProblemView.
3. **Dashboard view** — Streak (current + longest), recent counts (7d, 30d), total solved by difficulty, activity heatmap.
4. **Graceful degradation** — Backfill failures surface a clean "re-auth" or "rate-limited, resume later" message; never crash.

**Competitive differentiators (v1.x):**
- **Offline ownership** — History is local SQLite, not dependent on LeetCode availability or future API breakage. Consistent with the git-backup ethos.
- **Problems-over-time trend** — Weekly sparkline showing trajectory ("Am I improving?").
- **Consistency score** — Rolling percentage (solves in last 30d / 30), kinder than a rigid streak (survives a missed day).
- **Activity heatmap** — Contribution-graph style 52-week calendar visualization (table-stakes in UX; highest complexity table-stakes item).
- **Per-problem history integrated in ProblemView** — No browser context switch; see your full attempt history the moment you open a problem.

**Explicitly NOT building (anti-features):**
- Percentile as a dashboard headline — Project north star is "consistency & trajectory," not competitive rank chasing. Percentile is stored per submission (from live CheckResponse) and shown on request per attempt, never prominent.
- Background sync timer — Violates leettui's no-background-timers invariant. Backfill is on-demand user-initiated.
- N+1 percentile calls in backfill — Historical submissions store percentile as `null`; only going-forward submissions get percentile from the existing `CheckResponse`.
- Lazy per-submission enrichment in backfill — Will defer to a future phase; a 500-submission history = 500 serial API calls (~10 min, high 429 risk).

**All four researchers converged here:** Do not fetch `submissionDetails` for every historical submission. The APIs are not the constraint; the rate-limit cost is.

---

### Architecture Approach

**The layer graph is fixed; the new feature slots in cleanly:**

```
┌─ UI (React + OpenTUI)
│  DashboardView, HistoryPanel, backfillProgress indicator
│
├─ View handlers (async orchestrators)
│  handleOpenDashboard, handleStartBackfill (in src/views/dashboard/handlers.ts)
│  handleEnterProblemView extended (load per-problem submissions)
│
├─ Core business logic
│  historyBackfill.ts (never-throws, resumable, paginated with throttle)
│  submission.ts extended (append-on-submit into submissions table)
│
└─ Data (API + DB)
   src/api/queries/submission-list.ts (new GraphQL query)
   src/db/submissions.ts (new CRUD module: insert, per-problem reads, aggregates)
   src/db/schema.ts (submissions table + submissionsFetchedAt column on questions)
```

**Major components and their scope:**

1. **`submissions` table** — Append-only; rows never updated post-insert. Indexed on `(questionId, submittedAt)` for per-problem reads and time-series queries.

2. **`submissionsFetchedAt` cursor column on `questions`** — Resumable backfill checkpoint. One write per question after successfully fetching its submission history. Atomically co-written with the submitted rows in the same transaction.

3. **`src/core/historyBackfill.ts`** — Batch service (batchSize=10 questions default). Mirrors `src/core/git.ts` exactly: never throws, returns discriminated `BackfillResult { ok, reason?, message? }`. Handles rate limit (300–500 ms inter-page delay, exponential backoff on 429), session expiry (catch `AuthError`, abort gracefully with resume cursor), and progress callback for UI.

4. **`submissionsSlice`** — Domain state. Actions: `loadProblemSubmissions(questionId)`, `loadDashboardStats()`. Both are synchronous DB reads (no async needed — SQLite is in-process). Streak calculation is a pure function from aggregated dates.

5. **`DashboardView`** — Top-level view routed by `mode === "dashboard"` in `app.tsx`. Owns full-screen layout: streak header, heatmap, sparkline, difficulty breakdown. Not a popup/overlay (wrong idiom for multi-section content).

6. **`HistoryPanel`** — New focusable panel in ProblemView (right column, below Related). Lists submissions newest-first with status, language, runtime, memory, timestamp.

**Why this structure:**
- **No new async in React:** In-TUI backfill uses Zustand store (`uiSlice.backfillProgress`), not `withSuspendedRenderer` (which is for external process handoff like `$EDITOR` or lazygit). This avoids render-loop blocking.
- **Idempotent re-run:** `submissionId` is PRIMARY KEY; `INSERT OR IGNORE` in the backfill loop makes re-running safe. The resume cursor on `questions.submissionsFetchedAt` makes re-run cheap.
- **Clean error boundary:** Backfill catches all errors internally and returns a discriminated result; view handler decides what to display. No unhandled throws propagate to the TUI.

---

### Critical Pitfalls

Researched and documented; each has a prevention strategy locked to a specific phase:

1. **N+1 per-submission detail call for percentile** — **Prevention:** Store `runtimePercentile` / `memoryPercentile` as NULL in the backfill; skip the `submissionDetails` call entirely. Going-forward submissions get percentile from the existing `CheckResponse` (already polled on submit). **Phase:** Data model. **Why phase 1:** Schema must document this decision before any backfill code is written.

2. **Rate limiting / soft-ban from hammering the API** — **Prevention:** Inter-page delay (300–500 ms, empirically 500 ms is safer), exponential backoff on 429 (wait 5 s, retry once, then abort). Do NOT parallelize with `Promise.all`. Cap backfill at configurable page limit (e.g., 100 pages = ~2000 submissions). **Phase:** Backfill implementation. **Confidence:** LOW on exact threshold; 300–500 ms is community consensus; a live spike during planning's backfill-phase research can validate against a real account.

3. **Non-resumable backfill from interruption** — **Prevention:** Store `submissionId` as PRIMARY KEY (idempotent upsert via `INSERT OR IGNORE`). Persist `submissionsFetchedAt` cursor on `questions`. On abort, commit progress so far; next run resumes from cursor, not offset 0. **Phase:** Data model. **Why phase 1:** Cursor and idempotency constraints must be in the schema.

4. **Timezone off-by-one breaking streaks** — **Prevention:** Pure, unit-tested streak function using `new Date(epochSeconds * 1000).toLocaleDateString('en-CA')` (returns `YYYY-MM-DD` in local timezone, handles DST). All streak/heatmap bucketing uses local date strings, never raw epoch arithmetic. Test with UTC+X and UTC-X boundary timestamps. **Phase:** Analytics module (before dashboard). **Confidence:** HIGH on the solution; this is documented JS/Intl behavior.

5. **Cookie session expiry mid-backfill** — **Prevention:** Wrap page-fetch in try/catch for `AuthError` specifically. On `AuthError`: commit progress, persist cursor, surface "Session expired — re-auth (Ctrl+P) then restart backfill", abort cleanly. Do NOT attempt automatic re-auth inside backfill. **Phase:** Backfill implementation. **Why:** Error handling is not optional polish; it's part of leettui's "never-crash on missing capability" invariant.

6. **Backfill blocking the TUI render loop** — **Prevention:** Run backfill as async, update `uiSlice.backfillProgress` after each page, render a non-blocking progress indicator. Mirror the `syncSlice` pattern. Do NOT use `withSuspendedRenderer` (that's for external process handoff). Do NOT use `Promise.all` for all pages (starves the renderer). **Phase:** Backfill UI integration. **Why:** Render-loop blocking is immediately visible and requires refactoring to fix; prevent it upfront.

7. **Corrupt or inconsistent data from missing DB index** — **Prevention:** Migration must include indexes: `(questionId, submittedAt)` for per-problem history, `(submittedAt)` for streak/trend. Run `EXPLAIN QUERY PLAN` on analytics queries with 1000+ synthetic rows before shipping. Wrap dashboard queries in never-throw pattern. **Phase:** Data model. **Why:** Index design is part of the schema, not a performance optimization added later.

**All researchers converged on these seven.** No surprises; well-documented failure modes.

---

## Implications for Roadmap

### Suggested Phase Structure

**All four researchers agree on this strict build order.** Do not swap phases; each depends on the previous.

#### Phase 1: Data Model & Migration (Dependency Foundation)

**Rationale:** Everything downstream depends on the schema. Cursor semantics, idempotency, and index design must be locked here.

**Deliverables:**
- `src/db/schema.ts`: Add `submissions` table (id PK, questionId FK, statusDisplay, lang, runtime, memory, timestamp, runtimePercentile/memoryPercentile nullable).
- `src/db/schema.ts`: Add `submissionsFetchedAt` column to `questions` (resume cursor, nullable).
- `drizzle/000N_submissions.sql`: Generated migration (via `bun run db:generate`).
- `src/db/migrations.ts`: Embed the migration (mandatory for compiled binary).
- `src/db/submissions.ts`: CRUD module (upsertSubmission, getSubmissionsForQuestion, getUnfetchedQuestions, getAcceptedCountByDifficulty, getDailySolves).
- `src/db/questions.ts`: Extend with `markSubmissionsFetched(questionId)`.

**Avoids pitfalls:** 3 (resumability), 7 (missing index), 1 (percentile schema decision).

**Research needed:** Exact field set from `submissionList` — validate against a live account's API response (STACK.md notes MEDIUM confidence; a spike fetches 1–2 pages of real data to confirm field names match the GraphQL source).

---

#### Phase 2: Backfill Service & Append-on-Submit (Data Fetching)

**Rationale:** Core data import logic. Must be defensive, resumable, rate-aware.

**Deliverables:**
- `src/api/queries/submission-list.ts`: `fetchSubmissionList(questionSlug, offset, limit)` query (30 lines, mirrors `fetchQuestionList`).
- `src/core/historyBackfill.ts`: Batch service (`backfillHistoryBatch({ batchSize?, onProgress? })`). Implements offset-based pagination, inter-page delay (500 ms), exponential backoff on 429, `AuthError` handling, idempotent insert (`onConflictDoNothing`).
- `src/core/submission.ts`: Extend `submitSolution` to call `upsertSubmission` with data from `CheckResponse` (id, questionId, status, lang, runtime, memory, runtimePercentile, submittedAt).

**Avoids pitfalls:** 2 (rate limiting), 5 (session expiry), 1 (no N+1 percentile fetch in backfill).

**Research needed:** Real rate-limit threshold — set inter-page delay conservatively (500 ms), but validate during a live backfill spike against a real account with 500+ submissions to measure actual 429 frequency. If 500 ms is too aggressive, increase to 1–2 s.

---

#### Phase 3: Domain State & Slice (Zustand Integration)

**Rationale:** Bridge between DB and UI. Owns data transformations (streak calculation, aggregates).

**Deliverables:**
- `src/ui/store/slices/submissionsSlice.ts`: Domain slice with `problemSubmissions: DbSubmission[]` and `dashboardStats: DashboardStats` (solveStreak, weekCount, monthCount, byDifficulty, byTopic, dailySolves). Actions: `loadProblemSubmissions(questionId)`, `loadDashboardStats()` (both sync).
- `src/core/analytics.ts` (optional): Pure functions for streak calculation (`computeStreak(timestamps)`), date bucketing, trend rollup.
- `src/ui/store/index.ts`: Register `submissionsSlice`.
- `src/ui/store/slices/uiSlice.ts`: Add `"dashboard"` to `AppMode`, add `backfillProgress: BackfillProgress | null`, add `showDashboard()` / `hideDashboard()` actions.
- `src/ui/store/slices/problemSlice.ts`: Add `"history"` to `ProblemPanel`, add `focusedHistoryIndex`, add `moveFocusedHistory(delta)` action.

**Avoids pitfalls:** 4 (timezone streaks via pure function), 6 (backfill progress stored in Zustand, not in component state).

**Research needed:** None — slice patterns are directly extracted from the codebase.

---

#### Phase 4: Per-Problem History Panel (ProblemView Extension)

**Rationale:** Highest-value UI surface; users see their history immediately upon opening a problem.

**Deliverables:**
- `src/ui/components/HistoryPanel.tsx`: Focusable panel listing submissions (newest-first) with status, lang, runtime, memory, relative timestamp. Mirrors `RelatedPanel.tsx` pattern.
- `src/ui/keymap/bindings.ts`: Add `historyPanelBindings` (mounted when `focusedPanel === "history"`).
- `src/views/problem/handlers.ts`: Extend `handleEnterProblemView` to call `loadProblemSubmissions(question.id)`.
- `src/views/problem/ProblemView.tsx`: Mount `HistoryPanel` in right column, update `PROBLEM_PANEL_NEIGHBORS`.

**Avoids pitfalls:** None specific; inherits safety from Phase 1 + 3.

**Research needed:** None — reuses established panel patterns from the codebase.

---

#### Phase 5: Dashboard View (New Top-Level View)

**Rationale:** Aggregates all submissions into a single "progress at a glance" surface. Full-screen view (not popup) because it has multiple sections.

**Deliverables:**
- `src/views/dashboard/DashboardView.tsx`: Layout with streak header, heatmap, sparkline (problems/week over 12 weeks), difficulty breakdown, topic breakdown (if time). Subscribes to `themeVersion`, `dashboardStats`, `backfillProgress`.
- `src/views/dashboard/handlers.ts`: `handleOpenDashboard()` (load stats, set mode), `handleStartBackfill()` (run batch service, pipe progress to Zustand), `handleExitDashboard()`.
- `src/ui/keymap/commands/dashboard.ts`: Catalog (`dashboard.open`, `dashboard.exit`, `dashboard.backfill`, `dashboard.backfillCancel`).
- `src/ui/keymap/bindings.ts`: Add `dashboardBindings` (mounted by DashboardView), add `p` → `dashboard.open` to `browseGlobalBindings`.
- `src/app.tsx`: Add router case `if (mode === "dashboard") return <DashboardView />`.
- `src/ui/components/analytics.ts`: Utility functions (sparkline, heatmap builder, difficulty bars) — pure, unit-testable, no dependencies.

**Avoids pitfalls:** 6 (backfill progress via Zustand, not blocking), none others (all mitigated in earlier phases).

**Research needed:** Heatmap grid layout optimization if 52 weeks × 7 rows causes performance issues on older terminals (likely not, but worth a smoke test).

---

### Phase Ordering Rationale

- **Phase 1 must come first:** Schema and migration are prerequisites for every other phase. Cursor semantics, idempotency, and indexing are architectural decisions that cannot be retrofitted.
- **Phase 2 follows Phase 1:** Backfill service needs the table and migration in place; append-on-submit needs the schema.
- **Phase 3 follows Phases 1+2:** Domain slice reads from the DB (Phase 1) and calls backfill service (Phase 2).
- **Phase 4 follows Phase 3:** History panel reads from `submissionsSlice.problemSubmissions`.
- **Phase 5 follows Phases 3+2:** Dashboard reads `submissionsSlice.dashboardStats` and triggers `backfillHistoryBatch()`.

**No parallelization.** Each phase has a hard dependency on all prior phases. This ensures that problems are discovered and fixed early (e.g., schema bugs are caught in Phase 1 dev testing, not in Phase 5 production).

---

### Research Flags

**Phases that need `/gsd-plan-phase --research-phase N` during roadmap planning:**

- **Phase 2 (Backfill service):** Research flag: **Rate-limit threshold validation.** STACK.md notes LOW confidence (300–500 ms is community consensus, real threshold is unknown). During Phase 2 planning, run a live backfill spike against a real account with 500+ submissions to measure actual 429 frequency and validate inter-page delay. No plan blocker — defer to an early backfill-phase task if needed.

- **Phase 2 (Backfill service):** Research flag: **Exact submissionList field set at scale.** STACK.md verifies field names against JacobLinCool/LeetCode-Query source (MEDIUM confidence), but a live call against a real account confirms pagination behavior at scale (offset/limit/hasNext mechanics on a user with 1000+ submissions). No plan blocker — fetch 1–2 pages live during planning to validate.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Schema):** HIGH confidence — directly extracted from codebase Drizzle/migrations patterns (`src/db/schema.ts`, `src/db/CLAUDE.md`).
- **Phase 3 (Zustand):** HIGH confidence — slice patterns directly from codebase (`src/ui/store/slices/`).
- **Phase 4 (Panel):** HIGH confidence — panel patterns from codebase (`RelatedPanel.tsx`, `SolutionsPanel.tsx`).
- **Phase 5 (Dashboard):** MEDIUM confidence — layout/OpenTUI rendering verified against `progress.ts`, `ProgressBar.tsx`; component routing verified from codebase.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | MEDIUM-HIGH | Verified via JacobLinCool/LeetCode-Query source; LeetCode is undocumented so GraphQL schema can change without notice. No new dependencies needed (HIGH confidence) — primitives already exist (progressBar, sparkline via Unicode, theme tokens). |
| **Features** | MEDIUM | Table-stakes derived from LeetCode UI + community analytics tools; anti-features are explicit from PROJECT.md. MVP feature set is tight and achievable. Differentiators are stretch-goal material. |
| **Architecture** | HIGH | Entirely derived from existing codebase patterns (Drizzle migrations, Zustand slices, panel conventions, never-throws pattern, git.ts model). No novel architecture needed. |
| **Pitfalls** | MEDIUM | Seven critical pitfalls identified and mapped to prevention phases. N+1 API cost and rate limiting are community-observed (not contractual guarantees). Timezone streak is well-documented JS behavior (HIGH on solution). |

**Overall confidence:** MEDIUM-HIGH. Architecture is solid and proven in codebase. API is well-understood via community reference. The main unknowns are the real rate-limit threshold and exact field set at scale — both can be validated during Phase 2 planning without blocking execution.

---

## Gaps to Address

1. **Real rate-limit threshold:** Recommend a live backfill spike during Phase 2 planning against a real account with 500+ submissions. Measure the actual 429 frequency at 300 ms, 500 ms, 1 s inter-page delays. Update the inter-page delay in `historyBackfill.ts` based on results.

2. **Lazy percentile enrichment UI placement:** Percentile is stored but not surfaced in Phase 1 dashboard. Decide during Phase 5 whether to show percentile in the per-problem history panel (on-request collapse), inline per-row (subtle, not prominent), or defer to v1.x. Current design: show it inline but dim/secondary.

3. **Backfill page cap validation:** Recommend a configurable page limit (default 100 pages = ~2000 submissions). Validate this is sufficient for 95th percentile of real users during Phase 2 planning. Update the config documentation if different.

4. **Topic breakdown complexity:** FEATURES.md marks "by-topic AC breakdown" as P2 (v1.x). Phase 5 can preview it if time permits, but defer full implementation if it would delay dashboard launch. Requires `questions.question_topics` join; low implementation cost if scheduled.

5. **Heatmap performance at scale:** Render a 52×7 heatmap with `<text>` cells in `<box>` grid. Test with 5000+ synthetic rows in a 80-column terminal to verify no render lag. Likely fine (OpenTUI is efficient), but worth a smoke test during Phase 5.

---

## Sources

### Primary (HIGH confidence)

- `src/db/schema.ts`, `src/db/migrations.ts`, `src/db/CLAUDE.md` — Drizzle/SQLite migration workflow, existing table/index patterns
- `src/ui/store/slices/` — Zustand slice conventions (questionsSlice, uiSlice, problemSlice)
- `src/core/git.ts` — Never-throws result-object pattern, gitignore coverage
- `src/ui/progress.ts`, `src/ui/components/ProgressBar.tsx` — OpenTUI rendering patterns for analytics
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md` — Layer graph, component boundaries

### Secondary (MEDIUM confidence)

- [JacobLinCool/LeetCode-Query raw submissions.graphql](https://raw.githubusercontent.com/JacobLinCool/LeetCode-Query/main/src/graphql/submissions.graphql) — `submissionList` field names, pagination semantics
- [leetcode-query npm](https://www.npmjs.com/package/leetcode-query) — Rate-limit conventions (20 req/10 sec safety ceiling; community reports ~60 requests before 429)
- [trophy.so streak DST guide](https://trophy.so/blog/streak-timezone-dst-handling) — Timezone-correct streak implementation
- [MDN Date docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) — `toLocaleDateString('en-CA')` behavior

### Tertiary (MEDIUM, needs validation)

- Real rate-limit threshold — Community consensus is 300–500 ms inter-page delay; exact threshold depends on LeetCode's current infrastructure. **Action:** Validate during Phase 2 planning with live backfill.
- `submissionList` field set at scale — Verified against source; `pageSize` hard limit of 20 confirmed via multiple libraries. **Action:** Fetch 1–2 pages live during Phase 2 planning to confirm pagination behavior.

---

## Ready for Roadmap

All four research streams have converged on a cohesive design. The build order is strict, the pitfalls are mapped to phases, and the unknowns are scoped for planning-phase research gates.

**Next step:** `/gsd-roadmap --research SUMMARY.md` to generate the phase-by-phase roadmap with task breakdowns, timelines, and UAT criteria.

---

*Research synthesis: 2026-06-26*  
*Four researchers: STACK, FEATURES, ARCHITECTURE, PITFALLS*  
*Confidence: MEDIUM-HIGH — ready for requirements definition and planning*
