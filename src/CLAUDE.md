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

- **Keymap-driven dispatch**: `BrowseView`'s `useKeyboard` resolves each event through `ui/keymap.ts` to an `ActionId`, then a single `dispatchAction` switch invokes the right handler. Adding a keybinding means editing `keymap.ts` and that one switch.
- **View modules own orchestration**: `views/browse/handlers.ts` holds the async action functions (`handleViewProblem`, `handleOpenEditor`, `handleRunSolution`, etc.). They live outside React so future views can reuse them and so `BrowseView.tsx` stays layout-focused.
- **Editor integration** suspends/resumes the renderer around `Bun.spawn` of `$EDITOR` (in `handleOpenEditor`).
- **HTML→Markdown** conversion uses `node-html-markdown` before passing to OpenTUI's `<markdown>` component.
- **SelectPopup and CommandPalette** own their own `useKeyboard` hooks; `BrowseView` returns early on `mode === "select" | "palette"` so the inputs don't double-fire.
