# Directory Structure

**Analysis Date:** 2026-06-25

## Top-Level Layout

```
leettui/
├── src/                  # All application source (TypeScript/TSX)
├── drizzle/              # Versioned SQLite migrations + meta
├── scripts/              # build.ts (release build), smoke.sh
├── docs/                 # scratchpad notes / design docs
├── .github/workflows/    # CI (ci.yml) + release workflow
├── .husky/              # pre-commit (lint+typecheck), pre-push (test)
├── package.json         # scripts: check, lint, typecheck, test, db:generate
├── biome.json           # lint + format config (zero-tolerance gate)
├── tsconfig.json
├── install.sh           # Unix installer (curl … | sh)
├── install.ps1          # Windows installer (irm … | iex)
└── CLAUDE.md            # project guide (+ per-directory CLAUDE.md files)
```

## `src/` Layout

leettui follows a layered structure. Each major directory has its own
`CLAUDE.md` documenting its files (`src/`, `src/api/`, `src/cli/`,
`src/config/`, `src/core/`, `src/db/`, `src/ui/`).

```
src/
├── index.tsx            # TUI boot + plain-terminal subcommands
├── app.tsx              # Thin router (mode → BrowseView | ProblemView)
├── debug.ts             # Debug logging helper (LEETTUI_DEBUG)
├── sql.d.ts             # Ambient types for SQL imports
│
├── api/                 # LeetCode API client
│   ├── client.ts        # initClient, cookie-auth wiring
│   ├── graphql.ts       # GraphQL transport
│   ├── queries/         # GraphQL ops (problemset list, content, editor data,
│   │                    #   daily challenge, similar questions, console config)
│   ├── rest/            # run.ts, submit.ts, check.ts (poll)
│   └── types.ts         # API response types
│
├── cli/                 # Headless cwd-aware verbs (no renderer)
│   ├── index.ts         # Verb dispatch (test / run / submit / new)
│   ├── target.ts        # Infer problem/language from cwd
│   └── present.ts       # Format headless output
│
├── config/              # TOML config + XDG path resolution
│   ├── index.ts         # loadConfig, getters, parseEditorCommand
│   ├── paths.ts         # XDG path resolution
│   ├── resolvePath.ts   # ${VAR}/~ expansion
│   └── types.ts
│
├── core/                # Business logic (framework-free where possible)
│   ├── sync.ts          # Paginated problem fetch → SQLite
│   ├── search.ts        # Fuzzy search
│   ├── session.ts       # Cross-boot UI state (session.json)
│   ├── submission.ts    # Run/submit service over api/rest
│   ├── testRunner.ts    # Case pairing + output normalization (compareOutput)
│   ├── update.ts        # Self-update (atomic binary swap)
│   ├── updatePresent.ts # Update-notice formatting
│   ├── version.ts       # VERSION / IS_RELEASE (build-time --define)
│   ├── git.ts           # Never-throws git/gh shell-outs
│   ├── relocate.ts      # Move solutions on dir change
│   ├── migration.ts     # Data migrations
│   ├── markdown.ts      # htmlToMarkdown (node-html-markdown)
│   ├── clipboard.ts     # Yank URL
│   ├── auth/            # firefox.ts, paste.ts, index.ts (cookie auth)
│   ├── harness/         # Per-language local test harness generators
│   │   ├── index.ts, meta.ts, ecma.ts (shared)
│   │   ├── python.ts, javascript.ts, typescript.ts (interpreted)
│   │   └── rust.ts, csharp.ts, java.ts (compiled)
│   └── solutions/       # On-disk solution folder management
│       ├── index.ts, paths.ts, create.ts, discovery.ts,
│       └── remove.ts, templates.ts
│
├── db/                  # SQLite via Drizzle (bun:sqlite)
│   ├── index.ts         # openDatabase
│   ├── schema.ts        # Drizzle schema
│   ├── migrations.ts    # Apply versioned migrations
│   ├── questions.ts, topics.ts, recents.ts  # CRUD
│
├── ui/                  # OpenTUI/React components, state, theme, keymap
│   ├── store/           # Zustand store
│   │   ├── index.ts     # Combine slices → useAppStore
│   │   ├── slices/      # questions, selection, search, filters, ui,
│   │   │                #   problem, sync (each tagged // type: ui|domain)
│   │   └── topicLoad.ts # Debounced topic load
│   ├── keymap/          # Command catalog + binding layers (barrel)
│   │   ├── index.ts, command.ts, bindings.ts, scopes.ts,
│   │   ├── format.ts, runtime.ts
│   │   └── commands/    # browse, problem, modal, system (+ index)
│   ├── components/      # All UI components (see ui/CLAUDE.md)
│   │   └── onboarding/  # BootFlow, AuthWizard, Splash, Logo, Sync/Solutions/
│   │                    #   Relocate/GitInit onboarding steps
│   ├── themes/          # tokyo-night, catppuccin, nord, rose-pine, system
│   ├── theme.ts, palette.ts, markdownStyle.ts
│   └── progress.ts, relativeTime.ts, useGlide.ts, useScrollOffset.ts
│
└── views/               # Screen-level composition + handlers
    ├── shared.ts        # Cycle-free leaf (Renderer, withSuspendedRenderer)
    ├── browse/
    │   ├── BrowseView.tsx
    │   ├── handlers/    # daily, editor, solve, location, git (+ index, shared)
    │   └── resultView/  # builders, types, index (ResultView model)
    └── problem/
        ├── ProblemView.tsx
        └── handlers.ts
```

## Key Locations — "Where do I add…?"

| To add… | Go to |
|---------|-------|
| A new keybinding/command | `src/ui/keymap/commands/{browse,problem,modal,system}.ts` + a `bindingsFor(...)` entry in `bindings.ts` |
| A new async action | `src/views/{browse,problem}/handlers/` (then wire a command to it) |
| A new popup/modal | `src/ui/components/` (own its `useBindings` layer); gate render on a `mode` |
| A new store field | The matching slice in `src/ui/store/slices/` (respect ui/domain split) |
| A new language harness | `src/core/harness/<lang>.ts` (+ register in `harness/index.ts`) + a `.test.ts` |
| A new LeetCode query | `src/api/queries/` (GraphQL) or `src/api/rest/` (REST) |
| A new DB table/column | `src/db/schema.ts` → `bun run db:generate` → migration in `drizzle/` |
| A new headless verb | `src/cli/index.ts` (dispatch) + `cli/present.ts` |
| A new theme | `src/ui/themes/<name>.ts` implementing `Theme`, register in `themes/index.ts` |

## Naming Conventions

- **Files:** `camelCase.ts` for modules (`testRunner.ts`, `topicLoad.ts`);
  `PascalCase.tsx` for React components (`ProblemView.tsx`, `SolutionsPanel.tsx`).
- **Tests:** `{name}.test.ts` co-located beside the module under test.
- **Store slices:** `{domain}Slice.ts`, each opening with `// type: ui` or
  `// type: domain`.
- **Handlers:** `handle<Action>` functions (`handleEnterProblemView`,
  `handleRunSolution`), grouped by concern under `handlers/`.
- **Commands:** dotted names (`solutions.changeDir`, `popup.enterProblem`,
  `update.dismiss`) with `title`/`category`/`group` metadata.
- **Per-directory docs:** each significant directory carries a `CLAUDE.md`
  describing its files — read these before adding code in that area.

## Configuration / Build Files

- `package.json` — `lint` / `typecheck` / `test` / `check` scripts are the single
  source of truth for the Husky hooks and CI.
- `biome.json` — formatting + lint; the gate runs `--error-on-warnings`.
- `bun.lock` — pins dependencies (installs use `--frozen-lockfile`).
- `drizzle/` — versioned SQL migrations + `meta/`.
- `scripts/build.ts` — release build (inlines `VERSION`/`IS_RELEASE` via `--define`).

---

*Structure analysis: 2026-06-25*
