# ui/

OpenTUI React components, state management, theme, and keymap.

## Files

- `theme.ts` — Color constants (Tokyo Night inspired) and helper functions: `difficultyColor()`, `statusIcon()`, `statusColor()`
- `keymap.ts` — Typed action table. Defines `ActionId`, `ACTIONS` (id → title/category/display metadata), and `resolveAction(mode, chord)` which the active view's `useKeyboard` calls. `browseActions()` returns the palette-visible subset.

### components/

All components use OpenTUI JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`).

- `TopicList.tsx` — Left panel: scrollable topic list with `►` selection indicator
- `QuestionList.tsx` — Right panel: question list with status icon, ID, title, difficulty color. Uses `backgroundColor` for selected row highlight.
- `StatusBar.tsx` — Bottom bar: shows keybinding hints in browse mode, search input in search mode
- `QuestionPopup.tsx` — Centered absolute-positioned modal with `<scrollbox>` + `<markdown>` for problem descriptions. Requires `SyntaxStyle.create()` from `@opentui/core`.
- `SelectPopup.tsx` — Language selection modal with j/k navigation. Uses `useKeyboard` hook internally.
- `ResultPopup.tsx` — Run/submit result display with color-coded status lines
- `HelpPopup.tsx` — Hardcoded keybinding cheat-sheet (should be regenerated from `keymap.ts`; see Stage 3 roadmap)
- `DebugPopup.tsx` — Live key/error log overlay (debug mode only)
- `ProgressBar.tsx` — Sync progress indicator (shown during DB sync)
- `CommandPalette.tsx` — Ctrl+P fuzzy-searchable list of actions sourced from `browseActions()`. Owns its own `useKeyboard` hook; executes the selected action through `BrowseView`'s `dispatchAction` via the `onRun` callback.

### store/

Zustand store. **UI vs domain rule:** every slice file starts with a `// type: ui` or `// type: domain` header. UI slices own cursors, modes, and ephemeral display state. Domain slices own data sourced from DB/API. A UI slice may call domain actions; a domain slice never imports UI state. If a new slice would mix both, split it.

- `questionsSlice.ts` (**domain**) — `topics`, `allQuestions`, `filteredQuestions`. Actions: `init()`, `refreshQuestions()`, `loadTopic(topic)`, `applySearch(needle)`. Owns DB reads and search filtering.
- `selectionSlice.ts` (**ui**) — `selectedTopicIndex`, `selectedQuestionIndex`. Actions: `moveQuestion()`, `moveTopic()`, `setTopicIndex()`. Calls into the domain slice when moving topics.
- `searchSlice.ts` (**ui**) — `searchNeedle`. Actions: `startSearch()`, `updateSearch()`, `endSearch()`. Asks the domain slice to recompute `filteredQuestions`.
- `uiSlice.ts` (**ui**) — `mode` (`AppMode`), popup/select/result content. Actions for showing/hiding every modal (`showPopup`, `hidePopup`, … `showPalette`, `hidePalette`).
- `syncSlice.ts` (**ui**) — `syncProgress`. Actions: `setSyncProgress()`, `clearSyncProgress()`.
- `index.ts` — Combines slices into `useAppStore`. Re-exports `AppMode` type.

## OpenTUI prop notes

- `<box>` uses `backgroundColor` (not `bg`)
- `<text>` uses `fg` and `bg`
- `<markdown>` requires `content` prop (string) and `syntaxStyle` prop (`SyntaxStyle` instance)
- `<scrollbox>` wraps children for scrollable overflow

## Dependencies

- Components depend on `db/`, `api/`, `core/`, `config/` for data fetching and business logic
- `views/browse/handlers.ts` uses `node-html-markdown` to convert LeetCode HTML to markdown before passing to `QuestionPopup`
