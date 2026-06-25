# Phase 1: Submission Store & Backfill - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The irreducible data foundation for the submission-history & analytics milestone:
import the user's existing LeetCode submission history into the existing local
SQLite store (`questions.db`) and keep it current going forward — defensively,
resumably, and **on-demand only**. This phase delivers the `submissions` table +
migration, the resumable/idempotent backfill service, and automatic
append-on-submit. It does **not** surface the data (per-problem panel = Phase 2,
dashboard = Phase 3) — it only stores and keeps it current.

Discussion clarified the **user-facing behaviors** (how backfill is triggered,
how progress is shown, how a re-run behaves, what gets stored). The storage
mechanics were already locked by ROADMAP.md and are carried forward, not re-asked.
</domain>

<decisions>
## Implementation Decisions

### Trigger & Discovery
- **D-01:** Backfill is reachable two ways: (a) a **command-palette** action
  (always available, the canonical on-demand entry per ROADMAP success criterion 1),
  and (b) a **one-time first-run nudge** that fires once on the first launch
  *after this update lands*, offering to run the backfill now.
- **D-02:** The first-run nudge **reuses the existing version-change / changelog
  detection mechanism** (the Stage 18 "What's new" popup fires once on the first
  launch after an update; BootFlow onboarding is the structural analog). It must
  fire **once and only once** and never re-prompt thereafter — consistent with the
  no-nag / on-demand stance. A fresh install that has never backfilled is the
  natural trigger condition; the existing changelog "seeded caught-up" idea is the
  pattern to mirror so it doesn't double-fire.
- **D-03:** Rejected: a BootFlow onboarding step right after auth — fires before the
  user has context and before they may even care; the palette + one-time nudge gives
  discovery without front-loading.

### Progress Experience
- **D-04:** Progress is **non-blocking** — a `syncSlice`-style progress bar runs
  while the user keeps browsing/navigating; it must never freeze the render loop
  (DATA-07). This mirrors the existing first-run problem-set sync bar.
- **D-05:** The backfill is **cancelable** mid-run via an explicit action (e.g.
  Esc / a cancel command). Cancel preserves all partial data already written
  (consistent with the resumable + never-throws invariants) so a later run resumes.

### Refresh Semantics (re-running backfill)
- **D-06:** After the initial full import, re-running backfill is an **incremental
  top-up**: it fetches only submissions newer than the persisted cursor and stops
  early once it reaches already-seen data — cheap and polite to the unofficial API
  (DATA-04). The full historical paginated walk only happens on the first run (or a
  resumed-but-incomplete first run).
- **D-07:** Two distinct cursor concerns the planner must keep separate: (a) a
  **resume cursor** for an interrupted in-progress run (resume from the last
  page/offset so no rows are missed), and (b) a **high-water mark** for a completed
  import (so the next run is a top-up, not a full rescan). `submissionsFetchedAt`
  on `questions` is the persisted anchor; planner/research decides whether one
  field carries both roles or two are needed. Idempotent upsert (`onConflictDoNothing`
  on `submissionId` PK) is the safety net regardless.

### Import Scope
- **D-08:** Store **all** submissions — every attempt regardless of verdict
  (AC / WA / TLE / CE / RE / MLE), each with its status — not accepted-only. This
  matches DATA-02 ("per attempt") and is required by Phase 2's per-problem history
  panel (every attempt, newest-first) and the browse attempt-count badge. The
  modestly larger row count is acceptable; it is the superset every later phase reads.

### Claude's Discretion (deferred to research/planner — not user decisions)
- The configurable inter-page delay default and the 429 backoff curve — to be
  validated by the live rate-limit spike scheduled in plan 01-02 before locking.
- The exact failure-hint presentation (transient line vs. inline in the progress
  bar) — must be a clean, never-crash hint per DATA-05, but the surface is an
  implementation detail.
- The exact cancel keybinding and palette command titles.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning docs
- `.planning/PROJECT.md` — milestone scope, Core Value, locked Key Decisions
  (hybrid backfill-then-append; store in existing SQLite/Drizzle; on-demand only).
- `.planning/REQUIREMENTS.md` §Data — DATA-01 … DATA-07 (the requirements this
  phase satisfies; full text + acceptance intent).
- `.planning/ROADMAP.md` §"Phase 1: Submission Store & Backfill" — goal, 5 success
  criteria, and the 3 pre-scoped plans (01-01 schema/migration/CRUD, 01-02
  `submissionList` + resumable backfill service + rate-limit spike, 01-03
  append-on-submit + palette trigger + progress bar).

### Codebase maps (brownfield — read before touching code)
- `.planning/codebase/ARCHITECTURE.md` — layered unidirectional flow
  (UI → keymap → handlers → core → api/db/config); never-throws services;
  UI-vs-domain Zustand slice rule.
- `.planning/codebase/INTEGRATIONS.md` — LeetCode GraphQL/REST surface, cookie
  auth, SQLite/Drizzle storage location (`~/.local/share/leettui/questions.db`).
- `.planning/codebase/STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md` — directory
  layout, code style (zero-tolerance Biome gate, strict TS), co-located test pattern.

### Code seams to mirror (paths verified during scout)
- `src/db/schema.ts`, `src/db/migrations.ts`, `src/db/questions.ts`,
  `src/db/recents.ts` — Drizzle schema + embedded-migration + CRUD-module pattern;
  `recents.ts` is the closest analog for a new small data module.
- `src/ui/store/slices/syncSlice.ts` — the exact progress-bar slice pattern to
  reuse/extend for backfill progress (D-04).
- `src/core/sync.ts` — existing paginated GraphQL fetch-into-SQLite service
  (the backfill service's closest structural sibling).
- `src/core/git.ts` — the never-throws result-union reference DATA-05 mirrors.
- `src/api/client.ts`, `src/api/graphql.ts`, `src/api/queries/`, `src/api/rest/` —
  GraphQL client + query module pattern (`submissionList` query goes here) and the
  REST `check` path that yields `CheckResponse` for append-on-submit (D-08, DATA-06).
- `src/ui/keymap/` (command catalog) + `src/ui/components/onboarding/BootFlow.tsx`
  + the Stage 18 "What's new" changelog popup — the palette-command + one-time-nudge
  seams for D-01/D-02.

No external ADRs/specs beyond the planning docs and codebase maps above.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`syncSlice` (`src/ui/store/slices/syncSlice.ts`)**: ready-made
  `{current,total}` progress + set/clear actions; backfill progress reuses this
  pattern (extend or add a sibling slice) to satisfy DATA-07 non-blocking progress.
- **`core/sync.ts`**: existing paginated GraphQL-into-SQLite walk — the template
  for the backfill service's pagination + progress-callback shape.
- **`db/recents.ts` (+ test)**: a small, capped, co-located CRUD module — the
  closest analog for a new `submissions` data module with its co-located test.
- **`core/git.ts`**: never-throws result-union exemplar for DATA-05.
- **REST `check` → `CheckResponse`**: already returns runtime/memory/percentile on
  run/submit; append-on-submit (D-08/DATA-06) reads it for free, zero extra calls.

### Established Patterns
- **UI-vs-domain slice split**: backfill progress = UI slice; submission data
  reads/writes = domain slice. UI may call domain actions; domain never imports UI.
- **Embedded versioned migrations** (`src/db/migrations.ts`): new `submissions`
  table ships as a new migration embedded here, not a loose `drizzle/` file only.
- **Command catalog + per-scope `useBindings`**: the palette backfill command
  registers in the global catalog; any cancel binding mounts via the owning scope.
- **`*.db` gitignore protection**: storing in `questions.db` automatically keeps
  history out of the public solutions repo (ROADMAP success criterion 5).

### Integration Points
- `submissions` table joins to existing `questions` (by `questionId`/slug) — the
  read side Phases 2 & 3 depend on.
- Backfill command wires into `src/ui/keymap/` + a handler in `src/views/`.
- Append-on-submit hooks the existing run/submit result path
  (`src/views/problem/handlers.ts` → `core/submission` → REST `check`).
- First-run nudge wires into BootFlow / the changelog-version-change detection.
</code_context>

<specifics>
## Specific Ideas

- The first-run nudge should feel like the existing "What's new" popup — a single,
  dismissible, once-only prompt — not a blocking gate. "Run it now / later" with
  "later" always recoverable from the palette.
- Backfill must stay a quiet background-feeling task the user can ignore and keep
  browsing through, not a wall that stops the app.
</specifics>

<deferred>
## Deferred Ideas

- **Explicit "full re-import / rebuild" command** (force a complete rescan rather
  than incremental top-up) — not needed for Phase 1's MVP; the incremental top-up
  (D-06) plus idempotent upsert covers the normal case. Revisit if a user ever needs
  to repair a corrupted/partial store.
- Per-submission **percentile enrichment for historical rows** via a
  `submissionDetails` call — already tracked as v2 PERF-01; out of scope here
  (backfill captures what `submissionList` returns; live percentile comes free only
  on new submissions via `CheckResponse`).

None of the above is scope creep into this phase — discussion stayed within the
Phase 1 store/backfill boundary.
</deferred>

---

*Phase: 1-Submission Store & Backfill*
*Context gathered: 2026-06-26*
