# src/

Entry point and root application component.

## Files

- `index.tsx` — Boot sequence: **install crash handlers** (`core/crash`'s `installCrashHandlers()`, first thing) → load config → set theme → handle plain-terminal subcommands (`--version`, `update`) → **create the OpenTUI renderer first** → render `<BootFlow>` wrapped in `<ErrorBoundary>`. Also registers a `process.on("exit")` hook that prints `core/update`'s `updateNotice(...)` if `getPendingUpdate()` is set — the on-quit "newer release available" reminder, landing in normal scrollback after the renderer restores the main screen. Authentication and the initial sync no longer run on the plain terminal; they are animated in-renderer steps owned by `BootFlow`. **Crash visibility (why it exists):** a throw during React render with the TUI on the alternate screen and nothing catching it leaves a cleared, black terminal — the exact failure mode of the Windows-release "black screen after splash" bug (an unregistered `<spinner>` intrinsic threw in `SyncStep`). The `ErrorBoundary` (`ui/components/ErrorBoundary.tsx`) catches render throws and paints the error as `<text>` (renderer still live) + logs to `crash.log`; `installCrashHandlers` covers async escapes (`uncaughtException` restores the main screen + prints + exits; `unhandledRejection` is logged only).
- `ui/components/onboarding/BootFlow.tsx` — Boot state machine: `splash → (auth) → (solutions?) → loading → (relocate?) → ready`. Shows a brief animated splash on every launch (`Splash` + the custom `Logo`), runs the in-renderer `AuthWizard` only when forced (`auth` subcommand), tokens are missing, or the saved session validates as invalid (an offline/"unknown" validation is tolerated). On a genuine first install (`firstRunRef = !hasTokens` at splash) it then shows `SolutionsOnboarding` (Stage 10 item 3 — pick the solutions dir) before loading; existing users skip it. Then `initClient` → `openDatabase` → `syncIfEmpty` (progress via `SyncStep` + `syncSlice`). After sync it runs `detectSolutionsRelocation(getSolutionsDir(), getLastKnownSolutionsDir())` (Stage 10 item 2): a returned plan routes to the `RelocatePrompt` phase (offer to move already-solved problems after a config-driven dir change); otherwise it records the current dir as last-known and hands off to `<App>`. Either resolution records the current dir as the new last-known. The mid-session Ctrl+P "Re-authenticate" command still uses the plain-terminal `runAuthFlow` via `renderer.suspend()`.
- `app.tsx` — Thin router. Calls `useAppStore.getState().init()` on mount; renders `<ProblemView>` when `mode === "problem"`, otherwise `<BrowseView>`.

## Module dependency graph

```
index.tsx
  ├── config/        (loadConfig, getDbPath)
  ├── api/client     (initClient)
  ├── db/            (openDatabase)
  ├── core/sync      (syncIfEmpty)
  └── app.tsx        (routes on mode)
        ├── views/browse/BrowseView
        │     ├── ui/store          (Zustand state management)
        │     ├── ui/keymap         (typed action table + resolver)
        │     ├── ui/components/*   (React components)
        │     └── views/browse/handlers
        │           ├── api/queries/*     (GraphQL fetches)
        │           ├── api/rest/*        (run/submit/poll)
        │           ├── db/questions      (mark status, refresh)
        │           ├── core/solutions    (file management)
        │           ├── core/submission   (run/submit service)
        │           └── core/sync         (manual re-sync)
        └── views/problem/ProblemView    (mode === "problem")
              ├── ui/components/SolutionPickerModal  (telescope-style picker, opens with `f`)
              ├── ui/components/ResultBody
              └── views/problem/handlers (enter/exit/openEditor/run/submit/picker)
```

## Key architecture decisions

- **Keymap-driven dispatch**: `ui/keymap/` (a barrel module — `command.ts` infra, `commands/{browse,problem,modal,system}.ts` catalog, `bindings.ts`, `scopes.ts`, `format.ts`, `runtime.ts`) defines a command catalog (one `Command` per action with `title`/`category`/`group` metadata) plus per-scope binding-only specs (`browseGlobalBindings`, `topicPanelBindings`, `questionPanelBindings`, `popupBindings`, …; browse is split lazygit-style with conditional-mount on `focusedPanel`). At boot, `installKeymap(keymap, renderer)` registers every command in a global layer and wires the search-mode text-input intercept. Each binding layer is mounted via `useBindings` from a React component that only renders in its mode — conditional rendering does the activation, not field-gating. Adding a binding = adding one `Command` and one `bindingsFor(...)` entry.
- **View modules own orchestration**: `views/browse/handlers/` and `views/problem/handlers.ts` hold the async action functions (`handleOpenEditor`, `handleRunSolution`, `handleEnterProblemView`, `handleProblemRun`, etc.). They live outside React so views can reuse them and stay layout-focused. Commands' `run(...)` delegates to these handlers. The browse handlers are split by concern into a barrel folder (`handlers/{daily,editor,solve,location,git}.ts` re-exported from `handlers/index.ts`, so the `views/browse/handlers` import path is unchanged); cross-view scaffolding shared by both layers — the `Renderer` type, `withSuspendedRenderer`, `openInEditor`, `currentTopic`, and the scoped `makeReportError` factory — lives in the cycle-free leaf `views/shared.ts` (it imports neither handler tree, only `browse/resultView` and the `config/` leaf).
- **Dedicated problem view**: Pressing `Enter` on a question in browse transitions to `ProblemView` — a two-column layout (description left, active-solution strip + inline result + hints right). All solve actions (`e`/`R`/`s`) operate in-place against the active solution; results render inline via `<ResultBody>` (no popup). Picking which solution is active — and creating a new one for any of LeetCode's available languages — happens in `SolutionPickerModal`, a telescope-style overlay (`f` to open) with a syntax-highlighted code preview alongside the language list.
- **Editor integration** goes through `openInEditor` in `views/shared.ts` — the single `$EDITOR` spawn point behind `e`/`w`/`W`/notes/picker. Terminal editors keep the suspend/spawn/resume handover (`withSuspendedRenderer` + await exit); **GUI editors launch detached** (per `[editor] detach`, default `"auto"` basename detection): no suspend, `stdio: "ignore"`, `proc.unref()`, and the caller's `onExit` refresh runs immediately *and* again when the editor eventually exits (covers `code --wait`), so the TUI stays live for run/test/submit while the editor is open. The git UI (`Ctrl+g`, lazygit) always blocks — it calls `withSuspendedRenderer` directly. `e` opens the single `solution.{ext}` with cwd = the lang folder; **`w` (Stage 13) opens the whole problem folder as a workspace** (`handleOpenWorkspace` in browse, `handleOpenProblemWorkspace` in problem view) — cwd = the problem dir itself (not a file's parent), ensuring `problem.md` (description, create-if-absent) + `notes.md` first.
- **HTML→Markdown** conversion uses `node-html-markdown` before passing to OpenTUI's `<markdown>` component.
- **Popups own their own bindings**: each popup component (`QuestionPopup`, `ResultPopup`, `HelpPopup`, `DebugPopup`, `SelectPopup`, `CommandPalette`) calls `useBindings` directly. Since popups are conditionally rendered by mode, their layers register/unregister automatically. No more `mode === "select" | "palette"` early-return in the parent.
