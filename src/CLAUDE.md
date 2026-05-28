# src/

Entry point and root application component.

## Files

- `index.tsx` — Boot sequence: load config → init API client → open SQLite DB → sync if empty → create OpenTUI renderer → render `<App>`. Sync progress is printed to stdout before the TUI starts.
- `app.tsx` — Root React component. Orchestrates all UI components, handles all keyboard input via `useKeyboard`, and dispatches async actions (view problem, open editor, run, submit, sync). Contains `formatResult()` for converting `ParsedResponse` to display lines.

## Module dependency graph

```
index.tsx
  ├── config/     (loadConfig, getDbPath)
  ├── api/client  (initClient)
  ├── db/         (openDatabase)
  ├── core/sync   (syncIfEmpty)
  └── app.tsx
        ├── ui/store              (Zustand state management)
        ├── ui/components/*       (React components)
        ├── api/queries/*         (GraphQL fetches)
        ├── api/rest/*            (run/submit/poll)
        ├── db/questions          (mark status, refresh)
        ├── core/solutions        (file management)
        └── core/sync             (manual re-sync)
```

## Key architecture decisions

- **Single useKeyboard hook in app.tsx** handles all keyboard input and delegates based on `state.mode`
- **Editor integration** suspends/resumes the renderer around `Bun.spawn` of `$EDITOR`
- **HTML→Markdown** conversion uses `node-html-markdown` before passing to OpenTUI's `<markdown>` component
- **Select popup** has its own internal `useKeyboard` hook for j/k navigation
