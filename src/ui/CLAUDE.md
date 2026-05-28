# ui/

OpenTUI React components, state management, theme, and keymap.

## Files

- `theme.ts` — Color constants (Tokyo Night inspired) and helper functions: `difficultyColor()`, `statusIcon()`, `statusColor()`
- `keymap.ts` — (Planned) OpenTUI keymap layer definitions per app mode

### components/

All components use OpenTUI JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`).

- `TopicList.tsx` — Left panel: scrollable topic list with `►` selection indicator
- `QuestionList.tsx` — Right panel: question list with status icon, ID, title, difficulty color. Uses `backgroundColor` for selected row highlight.
- `StatusBar.tsx` — Bottom bar: shows keybinding hints in browse mode, search input in search mode
- `QuestionPopup.tsx` — Centered absolute-positioned modal with `<scrollbox>` + `<markdown>` for problem descriptions. Requires `SyntaxStyle.create()` from `@opentui/core`.
- `SelectPopup.tsx` — Language selection modal with j/k navigation. Uses `useKeyboard` hook internally.
- `ResultPopup.tsx` — Run/submit result display with color-coded status lines
- `ProgressBar.tsx` — Sync progress indicator (shown during DB sync)

### store/

Zustand store with four slices (each in `store/slices/`):

- `navigationSlice.ts` — `topics`, `allQuestions`, `filteredQuestions`, selection indices. Actions: `init()`, `moveQuestion()`, `moveTopic()`, `setTopic()`, `refreshQuestions()`
- `searchSlice.ts` — `searchNeedle`. Actions: `startSearch()`, `updateSearch()`, `endSearch()`
- `uiSlice.ts` — `mode` (`AppMode`), popup/select/result content. Actions: `showPopup()`, `hidePopup()`, `showSelect()`, `hideSelect()`, `showResult()`, `hideResult()`, `showHelp()`, `hideHelp()`
- `syncSlice.ts` — `syncProgress`. Actions: `setSyncProgress()`, `clearSyncProgress()`
- `index.ts` — Combines slices into `useAppStore`. Re-exports `AppMode` type.

## OpenTUI prop notes

- `<box>` uses `backgroundColor` (not `bg`)
- `<text>` uses `fg` and `bg`
- `<markdown>` requires `content` prop (string) and `syntaxStyle` prop (`SyntaxStyle` instance)
- `<scrollbox>` wraps children for scrollable overflow

## Dependencies

- Components depend on `db/`, `api/`, `core/`, `config/` for data fetching and business logic
- `app.tsx` (parent) uses `node-html-markdown` to convert LeetCode HTML to markdown before passing to `QuestionPopup`
