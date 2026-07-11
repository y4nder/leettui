# Phase 3: Progress Dashboard - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A new **full-screen dashboard view** (sibling to browse/problem, routed on
`mode === "dashboard"`) that aggregates the submission history Phases 1–2
already store into a single "am I improving and keeping it up?" screen. It reads
**only** the local `submissions` table — no new API calls, fully offline.

Deliverables (all locked by ROADMAP/REQUIREMENTS, DASH-01..07):
- Total solved + Easy/Medium/Hard breakdown
- Current + longest streak (timezone-correct via local day boundaries)
- Last-7-day and last-30-day solve counts
- Rolling 30-day consistency score (solve-days / 30)
- 52-week × 7-day activity heatmap
- ~12-week problems-per-week trend sparkline

All rendered with OpenTUI primitives + Unicode glyphs — **no new dependencies**.

Discussion clarified **HOW** to present and compute this — the "solve" unit,
the on-screen layout, the interaction/open model, and the heatmap/empty-state
treatment. The data layer (schema, backfill, append-on-submit) was locked in
Phases 1–2 and is carried forward, not re-decided.
</domain>

<decisions>
## Implementation Decisions

### The "Solve" Unit — one definition threads through EVERY stat
- **D-01:** The single counting unit across the **entire** dashboard is a
  **first-time distinct problem solve**. A problem contributes **exactly once**,
  on the date of its **first Accepted submission** (`MIN(submittedAt)` where
  `statusDisplay` is Accepted, grouped by `questionId`). **Re-solving an
  already-solved problem never counts anywhere** — not toward total, streak,
  counts, heatmap, or consistency.
- **D-02:** **Total solved** (DASH-02) = count of distinct problems ever AC'd;
  the **Easy/Medium/Hard breakdown** buckets each distinct problem by its
  difficulty at that first-AC event. Matches LeetCode's own "solved" number and
  the Phase 2 browse badge's mental model.
- **D-03:** A day is a **"solve-day"** (for current/longest streak DASH-03 and
  the 30-day consistency score DASH-07) iff **≥1 problem was solved for the
  first time that day**. A day where you only re-solved old problems is **not**
  a solve-day.
- **D-04:** **Heatmap cell intensity** (DASH-05), the **7-/30-day counts**
  (DASH-04), and the **trend sparkline** (DASH-06) are all driven by the
  **number of first-time solves per day/week** — the same D-01 unit. A
  re-solve-only day is **blank on the heatmap, adds nothing to the counts and
  sparkline, and doesn't extend the streak** — one consistent unit, no split
  "activity vs progress" semantics on the screen.
- **Rationale:** the north star is consistency & trajectory of *new* problems
  solved; a single unit keeps every number on the screen coherent and
  unit-testable. Grounded in Phase 1 D-08 (store every attempt) — we store all
  verdicts but the dashboard reads only first-time ACs.

### Layout & Hierarchy
- **D-05:** Arrangement = **summary cards → heatmap → trend**, top-to-bottom
  and scannable. Order: a compact block of headline numbers first, then the
  52-week activity heatmap, then the ~12-week trend sparkline at the bottom.
- **D-06:** **The current streak leads** as the most prominent element (the
  literal "am I keeping it up?" answer), e.g. `🔥 12-day streak (best 21)`,
  followed by total+breakdown, then 7d/30d counts + consistency %.
- **D-07:** The dashboard is a **scrollable viewport** (not a fixed static-fit
  layout). On a tall terminal everything shows at once; on a short one it
  scrolls. **Reuse the existing popup-scroller pattern** (`registerPopupScroller`
  / `popup.scrollHalfDown/Up`) that `ResultFullscreen` and the changelog popup
  already use — no bespoke scroll math, no graceful-degradation/hide rules
  needed.

### Interactivity & Open Model
- **D-08:** The dashboard is **read-only** in this phase: `j/k` +
  `Ctrl+d`/`Ctrl+u` scroll (jump distance = `[scroll] jump_rows`), `Esc`/`q`
  exits. Nothing is focusable or clickable — mirrors `ResultFullscreen` /
  `EasterEgg` / changelog. (Drill-down is a **deferred idea**, see below.)
- **D-09:** Opened with the global key **`p`** ("progress"). Free in browse
  today; planner must confirm `p` is also free in problem view (it appears
  unbound there). Add the binding to **both** `browseGlobalBindings` **and**
  `problemGlobalBindings` (one `dashboard.open` command + two bindings, the same
  shape as `solutions.openWorkspace`/`W` and `update.dismiss`), plus a command
  palette entry.
- **D-10:** **Truly global** — `p` opens the dashboard from **both browse and
  problem view** (DASH-01's "global keybinding").
- **D-11:** **Esc/q returns to the origin mode.** Opening from a problem and
  pressing Esc pops **back to that problem** (its solutions/scroll state intact);
  opening from browse returns to browse. The dashboard **remembers the mode it
  was opened from** — stash a return-mode (e.g. `dashboardReturnMode` on the
  store, or restore in the close action) and **preserve `problemSlice.problem`**
  while `mode === "dashboard"` so returning to the problem is a plain
  `setMode("problem")`. This deliberately extends DASH-01's literal "returns to
  browse" wording (which assumed browse-only open) to keep problem context.

### Heatmap Treatment & Empty-Data State
- **D-12:** Heatmap intensity is encoded by **color** (GitHub-style): every cell
  is the **same filled glyph**, and intensity ramps **dim → bright over the
  theme accent/success token family**; an empty (no-solve) day is the dim track
  color. ~4 filled levels + empty. Uses `theme.ts` tokens so it honors the
  active theme (must not hardcode a fixed green).
- **D-13:** **Empty-state CTA when the store is empty, real render when sparse.**
  Zero submissions in the local store (`hasAnySubmissions()` is false) →
  show a friendly empty-state message pointing at backfill (e.g. "No submission
  history yet — run backfill from Ctrl+P") instead of a wall of zeros. Any data
  at all → render the real dashboard even when sparse (a mostly-empty heatmap is
  fine and honest).

### Claude's Discretion
- **Heatmap intensity bucketing** — the exact count→level thresholds (fixed
  thresholds like 1 / 2–3 / 4–6 / 7+, vs relative quantiles). Fixed thresholds
  are the sane default; planner's call.
- **Exact theme tokens** for the 4-step heatmap color ramp (which accent/success
  shades) and for the streak/consistency accents — follow the established
  `theme.ts` / `difficultyColor()` / `statusColor()` conventions.
- **Sparkline scaling** — whether the ~12-week bars scale to the window max or a
  fixed cap, and the exact Unicode block set (`▁▂▃▄▅▆▇█`).
- **Exact stat-card wording/glyphs** (e.g. `🔥` for streak, `·` separators) and
  the precise column layout within the summary block.
- **Streak edge cases** — whether "current streak" tolerates *today* having no
  solve yet (i.e. a streak counted through yesterday stays "current" until
  end-of-today) vs breaking immediately at the first gap. Timezone correctness
  is locked (`toLocaleDateString('en-CA')` for local day keys); the today-grace
  detail is discretion.
- The exact new aggregate queries in `src/db/submissions.ts` (none compute
  first-AC-per-problem or per-day solve buckets yet — see code_context).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning docs
- `.planning/ROADMAP.md` §"Phase 3: Progress Dashboard" — goal, 4 success
  criteria, and the 3 pre-scoped plans (03-01 analytics module + `dashboardStats`
  aggregates/slice; 03-02 `DashboardView` + `app.tsx` routing + commands/bindings
  + global open key; 03-03 heatmap grid + trend sparkline). Also fixes the
  timezone approach (`toLocaleDateString('en-CA')`) and "no new dependencies".
- `.planning/REQUIREMENTS.md` §Dashboard — DASH-01..DASH-07 full requirement
  text (the locked WHAT; this doc is the HOW).
- `.planning/PROJECT.md` — Core value + Key Decisions: dashboard north star =
  **consistency & trajectory, not percentile chasing** (grounds D-01/D-06);
  percentile optimization + social comparison are explicitly Out of Scope.
- `.planning/phases/01-submission-store-backfill/01-CONTEXT.md` — Phase 1 D-08
  (store every attempt regardless of verdict) — the dashboard reads only
  first-time ACs *out of* that all-verdicts store.
- `.planning/phases/02-per-problem-history-browse-badge/02-CONTEXT.md` — Phase 2
  presentation conventions (verdict color-coding, `relativeTime.ts`, windowed
  list patterns) and the browse attempt-count badge (a different unit — all
  submissions — vs the dashboard's first-time-solve unit; keep them distinct).

### Codebase maps (brownfield — read before touching code)
- `.planning/codebase/ARCHITECTURE.md` — layered flow, UI-vs-domain Zustand
  slice split (the new `dashboardStats`/analytics is **domain**; view focus/scroll
  is **ui**).
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md` — code
  style, directory layout, co-located `*.test.ts` pattern (the analytics module
  is pure and MUST be unit-tested).
- `.planning/codebase/STACK.md` — OpenTUI/React/Bun/Drizzle, no-new-deps
  constraint.

### Code seams to mirror (paths verified during codebase scout)
- `src/ui/store/slices/uiSlice.ts:21-39` — the `AppMode` union; add
  `"dashboard"`. `setMode` is the mode setter.
- `src/app.tsx` — the thin router (`mode === "problem" ? <ProblemView> :
  <BrowseView>`); add the `mode === "dashboard"` branch → `<DashboardView>`.
- `src/ui/components/ResultFullscreen.tsx` — closest analog for a full-screen,
  read-only, scrollable overlay/view: gates binding layers, re-binds scroll
  keys, uses the shared popup scroller. Model the DashboardView's
  bindings/scroll on it. (`EasterEgg.tsx` is the minimal "own mode, dismiss on
  key" analog.)
- `src/ui/components/ChangelogPopup.tsx` — reuses `registerPopupScroller` +
  `popup.scrollHalfDown/Up` × `getScrollJumpRows()` for `j/k` + `Ctrl+d`/`Ctrl+u`
  scrolling — the exact scroll wiring for D-07.
- `src/db/submissions.ts` — existing query surface: `getSubmissionsForQuestion`,
  `getSubmissionCountsByQuestion` (all-verdict per-question count — the browse
  badge's unit, NOT the dashboard's), `hasAnySubmissions()` (D-13's empty check).
  **No first-AC-per-problem or per-day solve-bucket aggregate exists yet** —
  new queries needed for D-01..D-04.
- `src/db/schema.ts` (`submissions` table) — `submissionId` PK, `questionId`,
  `lang`, `statusDisplay`, `runtime`/`memory`, `submittedAt` (seconds),
  percentiles. `submittedAt` + `(questionId, submittedAt)` indexes exist (Phase 1)
  — supports the first-AC and per-day grouping efficiently.
- `src/ui/keymap/` barrel — `commands/browse.ts` + `commands/problem.ts` (add a
  `dashboard.open` command), `bindings.ts` (`browseGlobalBindings` +
  `problemGlobalBindings` for D-09/D-10, mirroring `solutions.openWorkspace`/`W`).
- `src/ui/theme.ts` — `colors` proxy + `difficultyColor()`/`statusColor()`
  conventions for the heatmap color ramp (D-12) and difficulty-breakdown colors;
  `themeVersion` repaint pattern if the view subscribes to theme changes.
- `src/ui/components/ProgressBar.tsx` / `src/ui/progress.ts` — existing pure
  bar/sweep geometry + Unicode block usage — reference for the sparkline glyph
  math (DASH-06), keeps it framework-free and unit-testable.

No external ADRs/specs beyond the planning docs and codebase maps above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`hasAnySubmissions()`** (`src/db/submissions.ts`) — the exact zero-data check
  behind D-13's empty-state CTA.
- **`registerPopupScroller` + `popup.scrollHalfDown/Up`** (keymap) and the
  `ResultFullscreen`/`ChangelogPopup` scroll wiring — D-07's scrollable viewport
  drops onto this directly; `getScrollJumpRows()` supplies the jump distance.
- **`theme.ts`** tokens + `difficultyColor()` — the heatmap color ramp (D-12) and
  E/M/H breakdown colors reuse the semantic token family, no hardcoded colors.
- **`src/ui/progress.ts`** pure block-geometry helpers — analogous approach for
  the sparkline's Unicode bars (pure + unit-tested).
- **`relativeTime.ts`** — if any "last solved N days ago" style stamp is shown.

### Established Patterns
- **UI-vs-domain slice split** — a new **domain** slice/module for
  `dashboardStats` (aggregate reads over `submissions`); a **ui** concern for the
  dashboard's scroll/return-mode state. The analytics computation must be a
  **pure, unit-tested module** (streak/consistency/date-bucketing), per plan
  03-01 and the repo's co-located-test convention — timezone-correct via
  `toLocaleDateString('en-CA')` day keys.
- **New AppMode + thin `app.tsx` router branch** — the established way to add a
  top-level view (browse/problem today).
- **One command + two global bindings** — `solutions.openWorkspace` (`W`) is the
  precedent for a global action bound in both browse and problem scopes (D-09/D-10).
- **Full-screen read-only overlay/view gating** — `ResultFullscreen` shows how to
  gate off other binding layers and re-bind only scroll/exit keys (D-08).

### Integration Points
- `AppMode` union (`uiSlice.ts`) gains `"dashboard"`; `app.tsx` routes it to the
  new `DashboardView`.
- New aggregate queries land in `src/db/submissions.ts`; the pure analytics
  module consumes their rows (or does the first-AC/per-day bucketing in JS —
  planner's call) and feeds a `dashboardStats` domain slice.
- The `dashboard.open` command + `p` bindings wire into `browseGlobalBindings`
  and `problemGlobalBindings`; the close/exit restores the origin mode (D-11),
  which requires **not** clearing `problemSlice.problem` on open.
- Heatmap/sparkline render with `theme.ts` tokens; if the view should repaint on
  a live theme switch, subscribe to `themeVersion` like Browse/ProblemView.

</code_context>

<specifics>
## Specific Ideas

- Summary block target: `🔥 12-day streak (best 21)` leads, then
  `234 solved   E 120 · M 98 · H 16`, then `7d: 9   30d: 34   consistency 60%`
  (see the approved layout preview).
- Heatmap target: 7 rows × 52 cols of a single filled glyph, color ramping
  dim→bright accent per daily first-time-solve count; empty days = dim track.
- Trend target: `Trend (12 wk) ▂▃▅▇▆▄▃▅▆▇▅▃` — ~12 Unicode block bars, one per
  week of first-time solves.
- Empty state target: a single centered "No submission history yet — run backfill
  from Ctrl+P" message when `hasAnySubmissions()` is false.

</specifics>

<deferred>
## Deferred Ideas

- **Dashboard drill-down / focusable widgets** — Enter on the Easy/Medium/Hard
  breakdown → jump to a difficulty-filtered browse list; Enter on a heatmap day →
  that day's solves; focusable panels. Explicitly kept **out** of this phase
  (D-08 read-only); a natural follow-up once the read-only dashboard ships.
- **Per-topic breakdown / weak-topic view** — PROJECT.md already scopes an
  "interview-readiness / weak-topic recommendation engine" as a possible later
  milestone, not this one. The dashboard here is difficulty + time based, not
  topic based.
- **"Activity" (all-submissions) heatmap variant** — a second heatmap/toggle
  showing effort (any submission, incl. failed) alongside the first-time-solve
  heatmap. Considered and deliberately rejected for a single consistent unit
  (D-04); could be a later toggle if users want an effort view.

</deferred>

---

*Phase: 3-Progress Dashboard*
*Context gathered: 2026-07-11*
