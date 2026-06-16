# ui/

OpenTUI React components, state management, theme, and keymap.

## Files

- `markdownStyle.ts` — `buildMarkdownSyntaxStyle()` maps OpenTUI markdown scopes (`markup.heading`, `markup.strong`, `markup.raw`, `markup.link`, …) onto the active theme tokens so `<markdown>` descriptions are theme-colored. Callers memoize it on `themeVersion` so it rebuilds on theme switch.
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
- `QuestionPopup.tsx` — Centered absolute-positioned modal with `<scrollbox>` + `<markdown>` for problem descriptions. Used by the daily-challenge flow. Builds its `syntaxStyle` from `markdownStyle.ts` (memoized on `themeVersion`).
- `SelectPopup.tsx` — Language selection modal with j/k navigation. Uses `useKeyboard` hook internally.
- `ResultPopup.tsx` — Modal frame around `<ResultBody>` for browse-mode run/submit results.
- `ResultBody.tsx` — Pure rendering of a `ResultView` (metrics, diff, outputs, error, and the local-runner `cases` list — per-case status glyph, expected/actual expanded only on `fail`). Reused by `ResultPopup` and by `ProblemView`'s inline Result panel.
- `NotesPopup.tsx` — Shared, language-agnostic notes view for `ProblemView` (opened with `n`). Renders `notes.md` as scrollable `<markdown>` (placeholder when empty), owns its own `useBindings` layer (`notesBindings`) which — being mounted after `problemBindings` — shadows problem-view `e`/`escape`/`q` while open: `e` edits `notes.md` in `$EDITOR` (create-if-absent) then refreshes, `Esc`/`q` close. Works with zero solutions (notes are problem-level, not gated on a focused langSlug). Mounted via `{notes && <NotesPopup .../>}` in `ProblemView`.
- `SolutionPickerModal.tsx` — Telescope-style modal for `ProblemView` (opened with `f`). Two-column layout: a list of every available language for the problem (languages with a solution on disk marked with `●`, from the `existing: Set<langSlug>` in picker state), and a syntax-highlighted code preview of the focused entry — file contents for existing solutions, LeetCode starter snippet for languages not yet started. Owns its own `useBindings` layer (`pickerBindings`). Confirming opens the file in `$EDITOR`, creating it from the snippet first if needed.
- `HelpPopup.tsx` — Auto-generated from `keymap.getCommandEntries()`. Groups commands by `category`, formats key sequences with `formatCommandBindings`. Debug entries only appear when `LEETTUI_DEBUG=1`.
- `DebugPopup.tsx` — Live key/error log overlay (debug mode only). Owns `debugBindings` via `useBindings`.
- `ProgressBar.tsx` — One-line sync progress indicator (legacy helper)
- `UpdateBanner.tsx` — One-line informational banner at the top of `BrowseView`/`ProblemView` when a newer release exists. Reads `updateAvailable` (set at boot by `core/update`'s `checkForUpdate`, fired from `BootFlow`); renders nothing when null. Informational ("run `leettui update`") with an `x` dismiss key (the `update.dismiss` command, bound in `browseBindings` + `problemBindings`, calls `setUpdateAvailable(null)`) that hides it for the session only — it's not persisted, so it reappears next launch if still out of date. Both views subtract one line from `mainHeight` when it's showing.
- `onboarding/` — First-run / boot experience, rendered by `BootFlow` before `<App>`. `Logo.tsx` (custom hand-crafted block-letter wordmark with a `reveal` wipe and a narrow single-line fallback), `Splash.tsx` (brief `useTimeline` logo reveal shown every launch, skippable with any key), `AuthWizard.tsx` (in-renderer Firefox-import → guided-paste auth, reusing `core/auth` helpers + `<input>`/`usePaste`), `SyncStep.tsx` (logo + progress bar driven by `syncSlice`), `RelocatePrompt.tsx` (Stage 10 item 2 — branded y/n offer to move already-solved problems when the resolved solutions dir changed; `useKeyboard`, calls `relocateSolutions` then shows the real `{moved, skipped}`), `SolutionsOnboarding.tsx` (Stage 10 item 3 — first-run-only "where should solutions live?" step; `<input value={defaultDir}>` pre-filled with the XDG default, Enter accepts/no-write, a typed path calls `persistSolutionsDir`, Esc accepts default), and `BootFlow.tsx` (the `splash → auth → (solutions?) → loading → (relocate?) → ready` state machine). See `src/CLAUDE.md`.
- `CommandPalette.tsx` — Ctrl+P fuzzy-searchable list of commands sourced from `keymap.getCommandEntries()`. Owns its own `useBindings` layer for navigation and a `key:after` intercept for needle text input. Executes the selected command via `keymap.runCommand(name)`.
- `ChangeLocationPrompt.tsx` — In-TUI "change solutions directory" action (Stage 10 item 4), reached from the command palette (`solutions.changeDir`) → `mode === "relocate"`, rendered by `BrowseView`. A centered modal with three internal phases (`input → confirm → done`, self-contained sub-state like the boot `RelocatePrompt`): pre-filled `<input value={getSolutionsDir()}>`, a `from → to` + count confirm, then the real `{moved, skipped}` result. **Works alongside the live keymap because no key-bearing layer mounts in `"relocate"` mode** (browse/search/palette bindings all gate on their own mode; the search `key:after` intercept checks `mode === "search"`), so every key falls through to the `<input>`/`useKeyboard`. The persist+migrate is the gated `changeSolutionsDir` handler (`views/browse/handlers.ts`); the component only calls `refreshSolutionFiles()` afterward.
- `EasterEgg.tsx` — Full-screen ASCII logo reveal reached from the command palette (`egg.splash` → "✦ Reveal the leettui logo"). Mounted only in `easterEgg` mode, so no keymap bindings are active; it dismisses on **any** key via `useKeyboard` → `hideEasterEgg()`. Reuses `onboarding/Logo` and the `useTimeline` reveal.

### store/

Zustand store. **UI vs domain rule:** every slice file starts with a `// type: ui` or `// type: domain` header. UI slices own cursors, modes, and ephemeral display state. Domain slices own data sourced from DB/API. A UI slice may call domain actions; a domain slice never imports UI state. If a new slice would mix both, split it.

- `questionsSlice.ts` (**domain**) — `topics`, `allQuestions`, `filteredQuestions`, `stats`, `solutionFileIds` (set of question IDs with a solution file). Actions: `init()`, `refreshQuestions()`, `refreshSolutionFiles()`, `loadTopic(topic)`, `applySearch(needle)`, `applyFilters()`. Owns DB reads and the `project(all, needle, difficulty)` filter pipeline (difficulty predicate then fuzzy search).
- `selectionSlice.ts` (**ui**) — `selectedTopicIndex`, `selectedQuestionIndex`. Actions: `moveQuestion()`, `setQuestionIndex()` (backs gg/G), `moveTopic()`, `setTopicIndex()`, `restoreSession()`. Calls into the domain slice when moving topics; mirrors the cursor to disk (debounced) via `core/session`.
- `searchSlice.ts` (**ui**) — `searchNeedle`. Actions: `startSearch()`, `updateSearch()`, `endSearch()`. Asks the domain slice to recompute `filteredQuestions`.
- `filtersSlice.ts` (**ui**) — `difficultyFilter` (`all`/`Easy`/`Medium`/`Hard`). Action: `cycleDifficulty()` (bound to `D`); applied alongside the search needle by the domain slice's `applyFilters()`.
- `uiSlice.ts` (**ui**) — `mode` (`AppMode`), popup/select/result content, `updateAvailable` (the newer release tag for the top banner, or null — set by `BootFlow`'s `checkForUpdate`), plus `problem: ProblemViewState | null` (active question, description, `solutions` list — **langSlugs**, not filenames — focused index, inline result, modal solution-picker state whose `existing` is a `Set<langSlug>`). Actions for showing/hiding every modal (`showPopup`, `hidePopup`, …) and managing the problem view (`enterProblemView`, `exitProblemView`, `setProblemSolutions`, `setProblemResult`, `openSolutionPicker`, `movePicker`, `closeSolutionPicker`).
- `syncSlice.ts` (**ui**) — `syncProgress`. Actions: `setSyncProgress()`, `clearSyncProgress()`.
- `index.ts` — Combines slices into `useAppStore`. Re-exports `AppMode` type.

## OpenTUI prop notes

- `<box>` uses `backgroundColor` (not `bg`)
- `<text>` uses `fg` and `bg`
- `<markdown>` requires `content` prop (string) and `syntaxStyle` prop (`SyntaxStyle` instance)
- `<scrollbox>` wraps children for scrollable overflow

## Dependencies

- Components depend on `db/`, `api/`, `core/`, `config/` for data fetching and business logic
- `views/browse/handlers.ts` and `views/problem/handlers.ts` call `core/markdown.ts`'s `htmlToMarkdown()` (a shared, configured `node-html-markdown` converter) before passing content to `QuestionPopup` / `ProblemView`
