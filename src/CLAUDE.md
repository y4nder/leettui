# src/

Entry point and root application component.

## Files

- `index.tsx` — Boot sequence: load config → init API client → open SQLite DB → sync if empty → create OpenTUI renderer → render `<App>`. Sync progress is printed to stdout before the TUI starts.
- `app.tsx` — Thin shell. Calls `useAppStore.getState().init()` on mount and mounts the active view (currently always `BrowseView`).

## Module dependency graph

```
index.tsx
  ├── config/        (loadConfig, getDbPath)
  ├── api/client     (initClient)
  ├── db/            (openDatabase)
  ├── core/sync      (syncIfEmpty)
  └── app.tsx
        └── views/browse/BrowseView
              ├── ui/store          (Zustand state management)
              ├── ui/keymap         (typed action table + resolver)
              ├── ui/components/*   (React components)
              └── views/browse/handlers
                    ├── api/queries/*     (GraphQL fetches)
                    ├── api/rest/*        (run/submit/poll)
                    ├── db/questions      (mark status, refresh)
                    ├── core/solutions    (file management)
                    ├── core/submission   (run/submit service)
                    └── core/sync         (manual re-sync)
```

## Key architecture decisions

- **Keymap-driven dispatch**: `ui/keymap.ts` defines a command catalog (one `Command` per action with `title`/`category`/`group` metadata) plus per-scope binding-only specs (`browseBindings`, `popupBindings`, …). At boot, `installKeymap(keymap, renderer)` registers every command in a global layer and wires the search-mode text-input intercept. Each binding layer is mounted via `useBindings` from a React component that only renders in its mode — conditional rendering does the activation, not field-gating. Adding a binding = adding one `Command` and one `bindingsFor(...)` entry.
- **View modules own orchestration**: `views/browse/handlers.ts` holds the async action functions (`handleViewProblem`, `handleOpenEditor`, `handleRunSolution`, etc.). They live outside React so future views can reuse them and so `BrowseView.tsx` stays layout-focused. Commands' `run(...)` delegates to these handlers.
- **Editor integration** suspends/resumes the renderer around `Bun.spawn` of `$EDITOR` (in `handleOpenEditor`).
- **HTML→Markdown** conversion uses `node-html-markdown` before passing to OpenTUI's `<markdown>` component.
- **Popups own their own bindings**: each popup component (`QuestionPopup`, `ResultPopup`, `HelpPopup`, `DebugPopup`, `SelectPopup`, `CommandPalette`) calls `useBindings` directly. Since popups are conditionally rendered by mode, their layers register/unregister automatically. No more `mode === "select" | "palette"` early-return in the parent.
