---
phase: "03"
plan: "02"
subsystem: ui
tags: [dashboard, appmode, zustand, keymap, react, opentui, return-mode]
status: complete

dependency_graph:
  requires:
    - "03-01: getFirstAcSummary() + computeDashboardStats() + DashboardStats type (src/ui/analytics.ts, src/db/submissions.ts)"
    - "src/ui/store/slices/uiSlice.ts (AppMode union, store pattern)"
    - "src/ui/keymap/ (commands/system.ts, commands/modal.ts, bindings.ts, barrel index.ts)"
    - "src/ui/components/ResultFullscreen.tsx + ChangelogPopup.tsx (full-screen overlay pattern)"
  provides:
    - "src/ui/store/slices/dashboardSlice.ts — domain slice: dashboardStats, loadDashboardStats(), clearDashboardStats()"
    - "src/ui/store/slices/uiSlice.ts — 'dashboard' AppMode + dashboardReturnMode + showDashboard/hideDashboard"
    - "src/ui/components/DashboardView.tsx — full-screen read-only summary view (streak, total+breakdown, 7d/30d, consistency)"
    - "src/app.tsx — mode === 'dashboard' route before problem branch"
    - "dashboard.open (system, palette-visible) + dashboard.close (modal, hidden) commands"
    - "dashboardBindings (scroll + Esc/q exit) + 'p' bound in browseGlobalBindings + problemGlobalBindings"
    - "src/ui/store/slices/uiSlice.test.ts — 4 unit tests pinning D-11 return-mode invariant"
  affects:
    - "03-03: extends DashboardView with heatmap + sparkline; extends analytics.ts with buildHeatmapGrid/buildWeeklyBuckets"

tech_stack:
  added: []
  patterns:
    - "full-screen AppMode view: absolute 100%x100% box, flexShrink=0 on header/footer (Pitfall 5), flexGrow=1 scrollbox body"
    - "return-mode wiring: showDashboard writes only mode + dashboardReturnMode (never problem state, D-11)"
    - "global opener command: loadData() then showView(currentMode) — data loaded synchronously before render, no load flash"
    - "dashboard domain slice: type:domain header, StateCreator<AppStore> pattern, mirrors submissionsSlice"
    - "p bound in two global layers (browse + problem) via single dashboard.open command"

key_files:
  created:
    - src/ui/store/slices/dashboardSlice.ts
    - src/ui/components/DashboardView.tsx
    - src/ui/store/slices/uiSlice.test.ts
  modified:
    - src/ui/store/slices/uiSlice.ts
    - src/ui/store/index.ts
    - src/app.tsx
    - src/ui/keymap/commands/system.ts
    - src/ui/keymap/commands/modal.ts
    - src/ui/keymap/commands/index.ts
    - src/ui/keymap/bindings.ts
    - src/ui/keymap/index.ts

key-decisions:
  - "showDashboard writes ONLY mode + dashboardReturnMode — zero writes to problem or any other slice (D-11 invariant, pinned by unit test)"
  - "dashboard.open calls loadDashboardStats() then showDashboard(s.mode) so stats are available before the view mounts — no load flash"
  - "DashboardView reuses registerPopupScroller + popup.scroll* commands (D-07), matching the ChangelogPopup/ResultFullscreen scroll pattern"
  - "Empty-state check gates on hasAnySubmissions() OR dashboardStats === null — friendly backfill CTA instead of a wall of zeros (D-13)"
  - "p bound as 'dashboard.open' in both browseGlobalBindings and problemGlobalBindings — free key (Ctrl+P is the palette; bare p was unbound in both scopes)"

patterns-established:
  - "Return-mode pattern: stash pre-open mode in showDashboard(returnMode), restore with hideDashboard() → set(s => ({ mode: s.dashboardReturnMode })); the returning modal never calls setMode directly"
  - "Full-screen overlay: absolute position + 100% width/height over bg color; header/footer with flexShrink=0; scrollbox with flexGrow=1"
  - "Global-scope command double-binding: one command (dashboard.open) added to two binding arrays (browseGlobalBindings, problemGlobalBindings) with identical key ('p')"

requirements-completed:
  - DASH-01

coverage:
  - id: D1
    description: "'dashboard' AppMode + showDashboard/hideDashboard return-mode wiring — pressing p opens dashboard, Esc/q returns to origin mode (browse→browse, problem→problem), problem state untouched (D-11)"
    requirement: DASH-01
    verification:
      - kind: unit
        ref: "src/ui/store/slices/uiSlice.test.ts#showDashboard('problem') then hideDashboard() returns to problem"
        status: pass
      - kind: unit
        ref: "src/ui/store/slices/uiSlice.test.ts#showDashboard does NOT clear problem state (D-11)"
        status: pass
      - kind: unit
        ref: "src/ui/store/slices/uiSlice.test.ts#showDashboard('browse') then hideDashboard() returns to browse"
        status: pass
      - kind: manual_procedural
        ref: "Task 4 human-verify checkpoint — user confirmed p opens full-screen dashboard from browse + problem view, Esc/q returns to correct origin mode"
        status: pass
    human_judgment: true
    rationale: "Full-screen view correctness (layout, color, return-to-problem with intact state) requires visual human confirmation; the unit tests cover the store invariant but not the rendered output or UX flow"
  - id: D2
    description: "DashboardView summary block — streak leading, total + colored E/M/H breakdown, 7d/30d/consistency % from real local data; empty-state CTA when no submissions (D-13)"
    requirement: DASH-01
    verification:
      - kind: manual_procedural
        ref: "Task 4 human-verify checkpoint — user observed: 27 solved, E 14 · M 12 · H 1, 7d:1 30d:9 consistency 27%, streak 0 best 3; numbers verified against real account"
        status: pass
    human_judgment: true
    rationale: "Stats correctness against a real LeetCode account requires human judgment; automated tests of analytics.ts (03-01) cover the computation; this coverage is for the rendered output"
  - id: D3
    description: "dashboard.open/close commands + global p binding in browse and problem global layers + dashboardBindings scroll/exit layer"
    requirement: DASH-01
    verification:
      - kind: unit
        ref: "bun run check — Biome + tsc + bun test (519 pass)"
        status: pass
    human_judgment: false

metrics:
  duration: "~35 min"
  completed: "2026-07-12"
  tasks: 4
  files: 9
---

# Phase 03 Plan 02: Dashboard View Slice Summary

Full-screen progress dashboard reachable with `p` from browse and problem view: `"dashboard"` AppMode with return-mode wiring, a domain `dashboardSlice`, `DashboardView` rendering streak / total+breakdown / 7d-30d / consistency from real local data, and the complete keymap plumbing — human-verified against a real LeetCode account.

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-12
- **Tasks:** 4 (Tasks 1-3 auto, Task 4 human-verify checkpoint — approved)
- **Files modified:** 9

## Accomplishments

- `"dashboard"` AppMode with `showDashboard(returnMode)` / `hideDashboard()` — return-mode wiring that preserves problem state (D-11); 4 unit tests pin the invariant
- `dashboardSlice.ts` domain slice owning `dashboardStats`, `loadDashboardStats()`, `clearDashboardStats()` — synchronous on-open DB aggregate via 03-01's proven `getFirstAcSummary` + `computeDashboardStats`
- `DashboardView.tsx` full-screen read-only view: streak line leading, colored E/M/H breakdown, 7d/30d counts + consistency %; empty-state CTA when no submissions (D-13); heatmap/sparkline placeholder for 03-03
- Complete keymap wiring: `dashboard.open` (palette-visible, loads then opens), `dashboard.close` (modal-group, hidden), `dashboardBindings` (j/k + Ctrl+d/u scroll, Esc/q exit), `p` in both `browseGlobalBindings` and `problemGlobalBindings`
- Human-verify (Task 4) approved: `p` opens from browse and problem view, numbers matched real account (27 solved, E 14 · M 12 · H 1, 7d:1 30d:9 consistency 27%, streak 0 best 3), Esc/q returned to correct origin mode, theme colors followed active theme

## Task Commits

1. **Task 1: AppMode + return-mode wiring + dashboard domain slice** — `114bd21` (feat)
2. **Task 2: DashboardView (summary block + empty-state) + app.tsx route** — `f6399e7` (feat)
3. **Task 3: dashboard.open/close commands + p / scroll / exit bindings** — `45e695d` (feat)
4. **Task 4: Human-verify — dashboard opens/returns and shows real summary stats** — APPROVED (checkpoint, no code commit)

## Files Created/Modified

- `src/ui/store/slices/dashboardSlice.ts` (created) — domain slice: `dashboardStats: DashboardStats | null`, `loadDashboardStats()`, `clearDashboardStats()`; `// type: domain` header; mirrors `submissionsSlice` structure
- `src/ui/components/DashboardView.tsx` (created) — full-screen dashboard: absolute overlay, `flexShrink=0` header/footer, `<scrollbox ref={registerPopupScroller}>` body; streak → total+breakdown → counts+consistency; D-13 empty-state branch; `// TODO(03-03)` placeholder for heatmap/sparkline
- `src/ui/store/slices/uiSlice.test.ts` (created) — 4 unit tests for D-11 return-mode invariant (browse round-trip, problem round-trip, problem state untouched, dashboardReturnMode set correctly)
- `src/ui/store/slices/uiSlice.ts` (modified) — added `"dashboard"` to `AppMode` union (with `// Phase 3` comment); added `dashboardReturnMode: AppMode`, `showDashboard`, `hideDashboard` to interface and implementation
- `src/ui/store/index.ts` (modified) — registered `createDashboardSlice` and `DashboardSlice` alongside `submissionsSlice` / `SubmissionsSlice`
- `src/app.tsx` (modified) — added `if (mode === "dashboard") return <DashboardView renderer={renderer} />` before the problem branch
- `src/ui/keymap/commands/system.ts` (modified) — added `dashboard.open` command (title: "Open progress dashboard", category: "View", short: "Dashboard"; calls `loadDashboardStats()` then `showDashboard(s.mode)`)
- `src/ui/keymap/commands/modal.ts` (modified) — added `dashboard.close` command (group: "modal", hidden from palette; calls `hideDashboard()`)
- `src/ui/keymap/commands/index.ts` (modified) — registered both commands in the catalog spreads
- `src/ui/keymap/bindings.ts` (modified) — added `dashboardBindings` (j/k + arrows scroll, Ctrl+d/u half-scroll, Esc/q close); added `"dashboard.open": "p"` to `browseGlobalBindings` and `problemGlobalBindings`
- `src/ui/keymap/index.ts` (modified) — re-exported `dashboardBindings` from the barrel

## Decisions Made

- `showDashboard` writes ONLY `mode` + `dashboardReturnMode` — never touches `problem` or any other slice. This is the D-11 invariant: returning from the dashboard to a problem is a plain mode flip, never a re-fetch or state reset.
- `dashboard.open` calls `loadDashboardStats()` synchronously BEFORE `showDashboard()` — data is populated before the view mounts, avoiding a null-flash on open.
- `DashboardView` reuses `registerPopupScroller` + `popup.scroll*` commands (the `ChangelogPopup` / `ResultFullscreen` D-07 pattern) rather than a custom scroll system.
- Empty-state check uses `hasAnySubmissions()` (D-13 — a user with a fresh install or empty store sees a helpful CTA, not zeros).
- Bare `p` chosen as the keybinding: `Ctrl+P` is the palette (already taken); bare `p` was unbound in both browse and problem global layers.

## Deviations from Plan

None — plan executed exactly as written. All D-11 / D-13 / Pitfall 5 requirements from the PATTERNS.md and RESEARCH.md were addressed directly in the implementation as specified.

## Known Stubs

- `// TODO(03-03)` placeholder in `DashboardView.tsx` below the summary block — the heatmap grid and sparkline widgets will be rendered there by plan 03-03. The placeholder comment references `buildHeatmapGrid` and `buildWeeklyBuckets`. These stubs do not prevent the plan's goal (DASH-01) from being achieved.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Dashboard reads local SQLite data read-only via `getFirstAcSummary()` (already proven in 03-01). Consistent with T-03-03 (return-mode tampering — mitigated by unit tests) and T-03-04 (synchronous on-open DB aggregate — accepted, matches existing `loadProblemSubmissions` pattern) from the plan's threat model.

## Self-Check

### Created files exist:
- FOUND: src/ui/store/slices/dashboardSlice.ts
- FOUND: src/ui/components/DashboardView.tsx
- FOUND: src/ui/store/slices/uiSlice.test.ts

### Modified files exist:
- FOUND: src/ui/store/slices/uiSlice.ts
- FOUND: src/ui/store/index.ts
- FOUND: src/app.tsx
- FOUND: src/ui/keymap/commands/system.ts
- FOUND: src/ui/keymap/commands/modal.ts
- FOUND: src/ui/keymap/commands/index.ts
- FOUND: src/ui/keymap/bindings.ts
- FOUND: src/ui/keymap/index.ts

### Commits exist:
- FOUND: 114bd21 feat(03-02): add dashboard AppMode + return-mode wiring + dashboardSlice
- FOUND: f6399e7 feat(03-02): add DashboardView component + app.tsx route + bindings foundation
- FOUND: 45e695d feat(03-02): bind p to dashboard.open in browse and problem global layers

### bun run check: 519 pass, 0 fail (Biome + tsc + bun test) — PASSED

## Self-Check: PASSED

---

*Phase: 03-progress-dashboard*
*Completed: 2026-07-12*
