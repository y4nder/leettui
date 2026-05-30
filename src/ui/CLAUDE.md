# ui/

OpenTUI React components, state management, theme, and keymap.

## Files

- `theme.ts` — Theme controller. Owns the `colors` Proxy (live token reads), `setTheme(name, { persist })`, `cycleTheme(±1)`, `getCurrentThemeName()`, `listThemeNames()`, `rebuildSystemTheme()` (called by `palette.ts` on terminal-palette changes), and helpers `difficultyColor()`, `statusIcon()`, `statusColor()`. Switching a theme bumps `themeVersion` on the store; `BrowseView` and `ProblemView` subscribe to it so their subtrees rerender.
- `themes/` — Preset palettes implementing the `Theme` interface (token values are `string | RGBA`, since OpenTUI's `fg`/`backgroundColor` props accept both). Three presets: `tokyo-night.ts`, `catppuccin.ts` (hex literals), and `system.ts` (RGBA-based — uses `RGBA.defaultForeground()`/`defaultBackground()`/`fromIndex(n)` so colors honor the user's terminal palette). The interface includes both legacy tokens (`bg`/`fg`/`fgAccent`/...) and semantic tokens (`surface`/`subtle`/`accent`/`success`/`warn`/`error`/`info`).
- `palette.ts` — Boot-time `attachPaletteListener(renderer)`. Warms `renderer.getPalette()` to unlock OSC detection, then subscribes to `CliRenderEvents.PALETTE` so the system theme can re-derive when the user changes their terminal colorscheme.
- `keymap.ts` — Command catalog and binding specs built on `@opentui/keymap`. Exports:
  - `installKeymap(keymap, renderer)` — registers every `Command` (with `title`/`category`/`group` metadata) in a global layer and wires the search-mode `key:after` text-input intercept. Called once from `src/index.tsx`.
  - `browseBindings`, `popupBindings`, `resultBindings`, `helpBindings`, `debugBindings`, `searchBindings` — `Binding[]` arrays passed to `useBindings` from each scope-owning component.
  - `getKeymap()` — accessor for code that needs the `Keymap` instance outside React (rare; React code uses `useKeymap()` from `@opentui/keymap/react`).
  Commands with `group: "modal"` are hidden from the command palette and help popup; `group: "debug"` shows only when `LEETTUI_DEBUG=1`.

### components/

All components use OpenTUI JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`).

- `TopicList.tsx` — Left panel: scrollable topic list with `►` selection indicator
- `QuestionList.tsx` — Right panel: per-row status icon, solution-exists marker (`◆`, accent color, from `solutionFileIds`), ID, title, acceptance-rate %, difficulty color, and last-accepted runtime. Uses `backgroundColor` for selected row highlight.
- `StatusBar.tsx` — Bottom bar: shows keybinding hints in browse mode, search input in search mode, and the active difficulty filter (e.g. `[Easy]`) when one is set
- `QuestionPopup.tsx` — Centered absolute-positioned modal with `<scrollbox>` + `<markdown>` for problem descriptions. Used by the daily-challenge flow. Requires `SyntaxStyle.create()` from `@opentui/core`.
- `SelectPopup.tsx` — Language selection modal with j/k navigation. Uses `useKeyboard` hook internally.
- `ResultPopup.tsx` — Modal frame around `<ResultBody>` for browse-mode run/submit results.
- `ResultBody.tsx` — Pure rendering of a `ResultView` (metrics, diff, outputs, error). Reused by `ResultPopup` and by `ProblemView`'s inline Result panel.
- `SolutionPickerModal.tsx` — Telescope-style modal for `ProblemView` (opened with `f`). Two-column layout: a list of every available language for the problem (existing solution files marked with `●`), and a syntax-highlighted code preview of the focused entry — file contents for existing solutions, LeetCode starter snippet for languages not yet started. Owns its own `useBindings` layer (`pickerBindings`). Confirming opens the file in `$EDITOR`, creating it from the snippet first if needed.
- `HelpPopup.tsx` — Auto-generated from `keymap.getCommandEntries()`. Groups commands by `category`, formats key sequences with `formatCommandBindings`. Debug entries only appear when `LEETTUI_DEBUG=1`.
- `DebugPopup.tsx` — Live key/error log overlay (debug mode only). Owns `debugBindings` via `useBindings`.
- `ProgressBar.tsx` — Sync progress indicator (shown during DB sync)
- `CommandPalette.tsx` — Ctrl+P fuzzy-searchable list of commands sourced from `keymap.getCommandEntries()`. Owns its own `useBindings` layer for navigation and a `key:after` intercept for needle text input. Executes the selected command via `keymap.runCommand(name)`.

### store/

Zustand store. **UI vs domain rule:** every slice file starts with a `// type: ui` or `// type: domain` header. UI slices own cursors, modes, and ephemeral display state. Domain slices own data sourced from DB/API. A UI slice may call domain actions; a domain slice never imports UI state. If a new slice would mix both, split it.

- `questionsSlice.ts` (**domain**) — `topics`, `allQuestions`, `filteredQuestions`, `stats`, `solutionFileIds` (set of question IDs with a solution file). Actions: `init()`, `refreshQuestions()`, `refreshSolutionFiles()`, `loadTopic(topic)`, `applySearch(needle)`, `applyFilters()`. Owns DB reads and the `project(all, needle, difficulty)` filter pipeline (difficulty predicate then fuzzy search).
- `selectionSlice.ts` (**ui**) — `selectedTopicIndex`, `selectedQuestionIndex`. Actions: `moveQuestion()`, `setQuestionIndex()` (backs gg/G), `moveTopic()`, `setTopicIndex()`, `restoreSession()`. Calls into the domain slice when moving topics; mirrors the cursor to disk (debounced) via `core/session`.
- `searchSlice.ts` (**ui**) — `searchNeedle`. Actions: `startSearch()`, `updateSearch()`, `endSearch()`. Asks the domain slice to recompute `filteredQuestions`.
- `filtersSlice.ts` (**ui**) — `difficultyFilter` (`all`/`Easy`/`Medium`/`Hard`). Action: `cycleDifficulty()` (bound to `D`); applied alongside the search needle by the domain slice's `applyFilters()`.
- `uiSlice.ts` (**ui**) — `mode` (`AppMode`), popup/select/result content, plus `problem: ProblemViewState | null` (active question, description, solutions list, focused index, inline result, modal solution-picker state). Actions for showing/hiding every modal (`showPopup`, `hidePopup`, …) and managing the problem view (`enterProblemView`, `exitProblemView`, `setProblemSolutions`, `setProblemResult`, `openSolutionPicker`, `movePicker`, `closeSolutionPicker`).
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
