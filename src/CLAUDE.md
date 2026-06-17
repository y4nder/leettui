# src/

Entry point and root application component.

## Files

- `index.tsx` — Boot sequence: load config → set theme → handle plain-terminal subcommands (`--version`, `update`) → **create the OpenTUI renderer first** → render `<BootFlow>`. Also registers a `process.on("exit")` hook that prints `core/update`'s `updateNotice(...)` if `getPendingUpdate()` is set — the on-quit "newer release available" reminder, landing in normal scrollback after the renderer restores the main screen. Authentication and the initial sync no longer run on the plain terminal; they are animated in-renderer steps owned by `BootFlow`.
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

- **Keymap-driven dispatch**: `ui/keymap.ts` defines a command catalog (one `Command` per action with `title`/`category`/`group` metadata) plus per-scope binding-only specs (`browseGlobalBindings`, `topicPanelBindings`, `questionPanelBindings`, `popupBindings`, …; browse is split lazygit-style with conditional-mount on `focusedPanel`). At boot, `installKeymap(keymap, renderer)` registers every command in a global layer and wires the search-mode text-input intercept. Each binding layer is mounted via `useBindings` from a React component that only renders in its mode — conditional rendering does the activation, not field-gating. Adding a binding = adding one `Command` and one `bindingsFor(...)` entry.
- **View modules own orchestration**: `views/browse/handlers.ts` and `views/problem/handlers.ts` hold the async action functions (`handleOpenEditor`, `handleRunSolution`, `handleEnterProblemView`, `handleProblemRun`, etc.). They live outside React so views can reuse them and stay layout-focused. Commands' `run(...)` delegates to these handlers.
- **Dedicated problem view**: Pressing `Enter` on a question in browse transitions to `ProblemView` — a two-column layout (description left, active-solution strip + inline result + hints right). All solve actions (`e`/`R`/`s`) operate in-place against the active solution; results render inline via `<ResultBody>` (no popup). Picking which solution is active — and creating a new one for any of LeetCode's available languages — happens in `SolutionPickerModal`, a telescope-style overlay (`f` to open) with a syntax-highlighted code preview alongside the language list.
- **Editor integration** suspends/resumes the renderer around `Bun.spawn` of `$EDITOR` (in `handleOpenEditor`).
- **HTML→Markdown** conversion uses `node-html-markdown` before passing to OpenTUI's `<markdown>` component.
- **Popups own their own bindings**: each popup component (`QuestionPopup`, `ResultPopup`, `HelpPopup`, `DebugPopup`, `SelectPopup`, `CommandPalette`) calls `useBindings` directly. Since popups are conditionally rendered by mode, their layers register/unregister automatically. No more `mode === "select" | "palette"` early-return in the parent.
