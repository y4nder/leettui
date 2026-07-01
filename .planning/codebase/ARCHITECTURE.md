# Architecture

**Analysis Date:** 2026-06-25

## Overview

leettui is a terminal UI (TUI) application for solving LeetCode problems without
leaving the terminal. It is a single Bun process rendering an OpenTUI/React
interface, backed by a local SQLite mirror of the LeetCode problem set and a
per-language local test harness. It also exposes a small set of **headless CLI
verbs** that run without the renderer (for editor `:!` integration).

- **Pattern:** Layered, unidirectional. UI (React/OpenTUI) → keymap dispatch →
  view handlers (async orchestrators) → core services → api/db/config.
- **Runtime:** Bun (required by OpenTUI).
- **State:** A single Zustand store split into 7 slices (UI vs domain).
- **Persistence:** SQLite (via Drizzle on `bun:sqlite`) for problem data; TOML
  config; a `session.json` for cross-boot UI state; on-disk solution folders.

## Entry Points

| Entry | File | Role |
|-------|------|------|
| TUI boot | `src/index.tsx` | Loads config → sets theme → handles plain-terminal subcommands (`--version`, `update`, `auth`) → creates the OpenTUI renderer → renders `<BootFlow>`. Registers an on-exit "update available" notice hook. |
| Headless CLI | `src/cli/index.ts` | Dispatches cwd-aware verbs (`test`, `run`, `submit`, `new`) before the TUI starts; no renderer. |
| Boot state machine | `src/ui/components/onboarding/BootFlow.tsx` | `splash → (auth) → (solutions?) → loading → (relocate?) → ready`, then hands off to `<App>`. |
| Root router | `src/app.tsx` | Thin router: calls `useAppStore.getState().init()` on mount; renders `<ProblemView>` when `mode === "problem"`, else `<BrowseView>`. |

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ UI layer (React + OpenTUI)                                   │
│   src/views/*  src/ui/components/*  src/ui/store/*           │
│   - BrowseView (lazygit-style focusable panels)             │
│   - ProblemView (2-column: description | solutions/result)  │
│   - Popups own their own useBindings layers                 │
└───────────────┬─────────────────────────────────────────────┘
                │ keymap dispatch (command.run → handler)
┌───────────────▼─────────────────────────────────────────────┐
│ Keymap layer  src/ui/keymap/*                                │
│   - Global command catalog (title/category/group metadata)  │
│   - Per-scope binding-only layers mounted via useBindings   │
└───────────────┬─────────────────────────────────────────────┘
                │ commands delegate to handlers
┌───────────────▼─────────────────────────────────────────────┐
│ View handler layer (async orchestration, outside React)     │
│   src/views/browse/handlers/*  src/views/problem/handlers.ts│
│   src/views/shared.ts (cycle-free leaf: Renderer, suspend)  │
└───────────────┬─────────────────────────────────────────────┘
                │ calls core services
┌───────────────▼─────────────────────────────────────────────┐
│ Core business logic  src/core/*                             │
│   sync · search · solutions · harness · submission · git    │
│   auth · session · update · relocate · markdown · migration │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│ Integration layer                                           │
│   src/api/*  (LeetCode GraphQL + REST)                       │
│   src/db/*   (SQLite via Drizzle)                            │
│   src/config/* (TOML + XDG paths)                            │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

**Browse → solve a problem (representative path):**

1. Boot (`index.tsx` → `BootFlow`): config load → renderer → auth (if needed) →
   `initClient` → `openDatabase` → `syncIfEmpty` (paginated GraphQL fetch into
   SQLite on first run) → relocation check → `<App>`.
2. `BrowseView` renders topics + questions from the store's domain slices
   (`questionsSlice` reads the DB). Keystrokes resolve through the keymap to
   selection/search/filter actions on the UI slices.
3. `Enter` on a question → `handleEnterProblemView` (records a "recent",
   fetches description + similar questions) → `enterProblemView` sets
   `mode === "problem"` → `app.tsx` swaps to `ProblemView`.
4. In `ProblemView`: `f` opens `SolutionPickerModal` to pick/create a language;
   `e`/`w` open `$EDITOR` (renderer suspends around `Bun.spawn`); `t` runs the
   **local harness** offline (`core/harness` + `core/testRunner`); `R`/`s` run/
   submit via the LeetCode REST API (`api/rest/*`, polled by `api/rest/check`).
5. Results render inline via `<ResultBody>`; solution status writes back to the
   DB (`db/questions`).

**Headless verb path (editor `:!leettui test`):**
`src/cli/index.ts` infers the problem/language from cwd (`cli/target.ts`),
runs the seeded cases through `core/testRunner` + `core/harness`, and prints a
formatted result (`cli/present.ts`) — no renderer, no LeetCode round-trip.

## Key Abstractions

- **Command catalog + binding layers** (`src/ui/keymap/`): one `Command` per
  action carries `title`/`category`/`group` metadata and a `run()`. `installKeymap`
  registers them once in a global layer; per-scope `Binding[]` arrays are mounted
  via `useBindings` from the component that owns each scope. Conditional rendering
  (by `mode`/`focusedPanel`) does activation — there is no field-gating.
- **View handlers** (`src/views/*/handlers/`): async orchestrators that live
  *outside* React so views stay layout-focused and handlers are reusable/testable.
  Commands' `run()` delegate to these. Shared scaffolding (the `Renderer` type,
  `withSuspendedRenderer`, `makeReportError`) lives in the cycle-free leaf
  `src/views/shared.ts`.
- **Harness generator** (`src/core/harness/`): per-`(type, language)` code
  generation so example cases run offline. Interpreted langs run a script per
  case; compiled langs (rust/csharp/java) compile once before the case loop.
  **Demand-driven**: an unsupported signature type generates *no* harness and
  shows a "use R/s" message rather than crashing.
- **Zustand slices** (`src/ui/store/slices/`): strict **UI vs domain** split —
  every slice declares `// type: ui` or `// type: domain`. UI slices own cursors/
  modes/ephemeral state; domain slices own DB/API data. UI may call domain
  actions; domain never imports UI.
- **Renderer suspend/resume handover** (`withSuspendedRenderer`): the single seam
  for shelling out to `$EDITOR`, lazygit, and `gh` — suspend renderer, `Bun.spawn`,
  resume.
- **Never-throws services**: `core/git.ts` and the harness runner return result
  objects instead of throwing, so a missing optional tool surfaces as a clean
  hint, never a crash.

## Cross-Cutting Concerns

- **Theming** (`src/ui/theme.ts`): a live `colors` Proxy + `themeVersion` bump on
  the store; subtrees subscribe and `useMemo(..., [themeVersion])` to rebuild
  styles. Presets in `src/ui/themes/`; a `system` theme honors the terminal
  palette via OSC detection (`src/ui/palette.ts`).
- **Auth** (`src/core/auth/`): cookie-based LeetCode session (Firefox import →
  guided paste fallback), validated then persisted to config; re-prompts on expiry.
- **Self-update** (`src/core/update.ts`): release-only, atomic binary swap; prefers
  a gzip release asset. Gated on `IS_RELEASE`; refused on Windows.
- **Session persistence** (`src/core/session.ts`): cursor position, solutions dir,
  changelog-shown flag — merged across boots via `session.json`.

## Constraints / Invariants

- **Bun-only runtime** (OpenTUI requirement).
- **`os.homedir()` is fixed at process launch** — path-resolution tests must use a
  subprocess with a temp `$HOME`.
- **Security invariant**: the remote-backup wizard is the only path that pushes;
  it always routes through `ensureSolutionsRepo` so the defensive root `.gitignore`
  (excludes `*.db`/`session.json`/`config.toml`) precedes any `git add`/push.
- **Git network ops** run with `GIT_TERMINAL_PROMPT=0` + SSH `BatchMode` so a
  credential prompt can't hang the live TUI.
- **Submittable-verbatim solutions**: harness scaffolding keeps `solution.{ext}`
  byte-for-byte submittable where possible (rust/csharp) or with only legal
  redundant imports prepended (java).

## Module Dependency Graph

```
index.tsx
  ├── config/        (loadConfig, getDbPath)
  ├── api/client     (initClient)
  ├── db/            (openDatabase)
  ├── core/sync      (syncIfEmpty)
  └── app.tsx        (routes on mode)
        ├── views/browse/BrowseView
        │     ├── ui/store          (Zustand slices)
        │     ├── ui/keymap         (command catalog + bindings)
        │     ├── ui/components/*
        │     └── views/browse/handlers (+ shared.ts leaf)
        │           ├── api/queries/*     (GraphQL)
        │           ├── api/rest/*        (run/submit/poll)
        │           ├── db/questions
        │           ├── core/solutions
        │           ├── core/submission
        │           └── core/git
        └── views/problem/ProblemView    (mode === "problem")
              ├── ui/components/SolutionPickerModal
              ├── ui/components/ResultBody / SolutionsPanel / RelatedPanel
              └── views/problem/handlers (enter/exit/editor/run/submit/test)
```

---

*Architecture analysis: 2026-06-25*
