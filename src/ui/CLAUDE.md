# ui/

OpenTUI React components, state management, theme, and keymap.

## Files

- `theme.ts` — Color constants (Tokyo Night inspired) and helper functions: `difficultyColor()`, `statusIcon()`, `statusColor()`
- `keymap.ts` — Command catalog and binding specs built on `@opentui/keymap`. Exports:
  - `installKeymap(keymap, renderer)` — registers every `Command` (with `title`/`category`/`group` metadata) in a global layer and wires the search-mode `key:after` text-input intercept. Called once from `src/index.tsx`.
  - `browseBindings`, `popupBindings`, `resultBindings`, `helpBindings`, `debugBindings`, `searchBindings` — `Binding[]` arrays passed to `useBindings` from each scope-owning component.
  - `getKeymap()` — accessor for code that needs the `Keymap` instance outside React (rare; React code uses `useKeymap()` from `@opentui/keymap/react`).
  Commands with `group: "modal"` are hidden from the command palette and help popup; `group: "debug"` shows only when `LEETTUI_DEBUG=1`.

### components/

All components use OpenTUI JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`).

- `TopicList.tsx` — Left panel: scrollable topic list with `►` selection indicator
- `QuestionList.tsx` — Right panel: question list with status icon, ID, title, difficulty color. Uses `backgroundColor` for selected row highlight.
- `StatusBar.tsx` — Bottom bar: shows keybinding hints in browse mode, search input in search mode
- `QuestionPopup.tsx` — Centered absolute-positioned modal with `<scrollbox>` + `<markdown>` for problem descriptions. Requires `SyntaxStyle.create()` from `@opentui/core`.
- `SelectPopup.tsx` — Language selection modal with j/k navigation. Uses `useKeyboard` hook internally.
- `ResultPopup.tsx` — Run/submit result display with color-coded status lines
- `HelpPopup.tsx` — Auto-generated from `keymap.getCommandEntries()`. Groups commands by `category`, formats key sequences with `formatCommandBindings`. Debug entries only appear when `LEETTUI_DEBUG=1`.
- `DebugPopup.tsx` — Live key/error log overlay (debug mode only). Owns `debugBindings` via `useBindings`.
- `ProgressBar.tsx` — Sync progress indicator (shown during DB sync)
- `CommandPalette.tsx` — Ctrl+P fuzzy-searchable list of commands sourced from `keymap.getCommandEntries()`. Owns its own `useBindings` layer for navigation and a `key:after` intercept for needle text input. Executes the selected command via `keymap.runCommand(name)`.

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
