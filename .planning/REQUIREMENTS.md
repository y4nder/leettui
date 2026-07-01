# Requirements: leettui — Submission History & Analytics

**Defined:** 2026-06-26
**Core Value:** A LeetCode user grinding in the terminal can open one view and instantly see whether they're improving and keeping it up — solve streak, recent counts, and breakdown by difficulty/topic — backed by their real submission history, owned locally.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Data (Submission Store)

- [x] **DATA-01**: A `submissions` table is added via a new versioned Drizzle migration, living in the existing `questions.db` so the `*.db` gitignore protection applies automatically; rows are keyed by LeetCode `submissionId` (PRIMARY KEY) so writes are idempotent
- [x] **DATA-02**: User can backfill their existing LeetCode submission history into the local store via paginated `submissionList` (offset/limit, `hasNext`), persisting status, language, runtime, memory, and timestamp per attempt
- [x] **DATA-03**: Backfill is resumable (persisted cursor) and safely re-runnable — an interrupted or repeated backfill never duplicates rows (`onConflictDoNothing`) and resumes where it left off
- [x] **DATA-04**: Backfill is polite to the unofficial API (configurable inter-page delay + 429 backoff) and on-demand only — no background timers or polling
- [x] **DATA-05**: Backfill degrades gracefully — on auth/API/rate-limit/network failure it never crashes the TUI, surfaces a clean hint, and preserves any partial data (never-throws result union, mirroring `core/git.ts`)
- [ ] **DATA-06**: New submissions made through leettui append to the store automatically, capturing runtime/memory percentile for free from the existing `CheckResponse` (zero extra API calls)
- [ ] **DATA-07**: In-TUI backfill progress is shown via the `syncSlice` Zustand pattern without freezing the render loop

### History (Per-Problem)

- [ ] **HIST-01**: ProblemView shows a per-problem submission-history panel listing every attempt with status (AC/WA/TLE/CE), language, runtime, memory, and timestamp
- [ ] **HIST-02**: The history panel surfaces best (fastest AC) runtime vs. latest AC runtime for the problem
- [ ] **HIST-03**: Per-attempt runtime/memory percentile is shown inline in the history row when available — present but not prominent (never the dashboard headline)

### Dashboard

- [ ] **DASH-01**: A new top-level dashboard view is reachable via a global keybinding and routed on `mode === "dashboard"` (sibling to BrowseView/ProblemView)
- [ ] **DASH-02**: Dashboard shows total solved plus a breakdown by difficulty (Easy / Medium / Hard)
- [ ] **DASH-03**: Dashboard shows current streak and longest streak (consecutive solve-days), computed timezone-correctly against the user's local day boundaries
- [ ] **DASH-04**: Dashboard shows recent solve counts for the last 7 days and last 30 days
- [ ] **DASH-05**: Dashboard shows an activity heatmap (52-week × 7-day calendar grid, cell intensity by daily solve count) rendered with OpenTUI primitives — no new dependencies
- [ ] **DASH-06**: Dashboard shows a problems-per-week trend sparkline (~12 weeks) as Unicode block glyphs
- [ ] **DASH-07**: Dashboard shows a rolling 30-day consistency score (solve-days / 30) alongside the streak

### Browse Integration

- [ ] **BROWSE-01**: The browse question list shows a "solved/attempted before" badge (attempt count) derived from submission history, richer than LeetCode's binary solved/attempted

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Analytics

- **TOPIC-01**: By-topic attempt + AC-rate breakdown ("where am I weak?") via a submissions → `question_topics` join
- **LANG-01**: Language usage mix over time for multi-language solvers
- **BROWSE-02**: "Solved today" indicator in BrowseView (in-session daily-target reminder)

### Enrichment

- **PERF-01**: Lazy per-submission percentile enrichment for historical AC submissions via a single `submissionDetails` call on first view
- **RECO-01**: Weak-topic recommendation engine ("what should I practice next?") built on the by-topic data

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cross-user leaderboards / social comparison | leettui is a single-user local tool; a leaderboard needs a backend, accounts, and privacy handling — antithetical to offline-first/locally-owned |
| Runtime percentile as the dashboard headline | Core value is consistency & trajectory, not competitive perf chasing; foregrounding percentile contradicts that. Stored + shown per-attempt only |
| Real-time / background sync or streaming | Violates leettui's firm no-background-timers invariant (same reason git auto-commit is out of scope); backfill is on-demand, append happens at submit |
| Badge / achievement gamification | Distracts from the genuine consistency signal; shifts motivation from learning to badge-hunting. Streak + consistency score are the anchors |
| Solve-time tracking during active editing | leettui suspends/resumes `$EDITOR` with no IDE-level instrumentation; no timing seam exists and LeetCode's API doesn't provide it |
| Browser companion / web dashboard | Contradicts terminal-native, offline-first value; the data is plain SQLite, already inspectable via `bun run db:studio` |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Pending |
| DATA-07 | Phase 1 | Pending |
| HIST-01 | Phase 2 | Pending |
| HIST-02 | Phase 2 | Pending |
| HIST-03 | Phase 2 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 3 | Pending |
| DASH-06 | Phase 3 | Pending |
| DASH-07 | Phase 3 | Pending |
| BROWSE-01 | Phase 2 | Pending |

**Coverage:**

- v1 requirements: 18 total
- Mapped to phases: 18 ✓
- Unmapped: 0

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-26 after roadmap creation (traceability filled)*
