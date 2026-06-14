# leettui

LeetCode TUI built with OpenTUI (React bindings) and Bun.

## Quick start

```sh
cd leettui
bun install
bun src/index.tsx
```

On first run, leettui runs an auth flow that imports your LeetCode session from Firefox (if logged in) or guides you through a one-time cookie paste, validates it, and writes it to `~/.config/leettui/config.toml`. Re-run any time with `bun src/index.tsx auth`.

### Subcommands

These are matched as argv tokens in `src/index.tsx` before the TUI starts:

- `auth` — force the authentication flow.
- `update` — self-update: download the latest release binary for the platform and atomically replace the running executable (`src/core/update.ts`). Pass `--force` to reinstall even when already current. Refuses unless `IS_RELEASE` (only official release-workflow binaries self-update — a from-source build is never overwritten by an older published release).
- `--version` / `version` — print the embedded version and exit.

Version metadata lives in `src/core/version.ts`, inlined at build time via `--define`:
- `VERSION` (`process.env.LEETTUI_VERSION`) — the pushed git tag from the release workflow; `git describe` for local `bun run build` (see `scripts/build.ts`); `dev` for `bun src/index.tsx`.
- `IS_RELEASE` (`process.env.LEETTUI_IS_RELEASE === "1"`) — set only by the release workflow; gates `update`.

## Architecture

- **Runtime**: Bun (required by OpenTUI)
- **UI Framework**: OpenTUI with React bindings (`@opentui/core`, `@opentui/react`, `@opentui/keymap`)
- **Storage**: SQLite via Drizzle ORM on the `bun:sqlite` driver; versioned migrations in `drizzle/` (`bun run db:generate` to add one)
- **Config**: TOML via `smol-toml` at `~/.config/leettui/config.toml`

### Directory layout

- `src/config/` — Config loading (TOML), XDG path resolution
- `src/api/` — LeetCode API client (GraphQL + REST), response types
- `src/db/` — SQLite database, schema, CRUD operations
- `src/core/` — Business logic (sync, fuzzy search, solution file management)
- `src/ui/` — React components, hooks, theme, keymap

### Key patterns

- **JSX**: Uses `@opentui/react` intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`)
- **State**: Zustand store split into ui/domain slices (`src/ui/store/`); `mode` field drives conditional rendering of popups, which in turn mount/unmount their `useBindings` layers
- **Keymap**: `@opentui/keymap` — global command catalog registered at boot in `src/ui/keymap.ts`, per-scope binding-only layers attached via `useBindings` from the components that own each scope
- **API auth**: Cookie-based (`LEETCODE_SESSION` + `csrftoken`). Acquired by `src/core/auth/` (Firefox cookie import → guided paste fallback), validated against LeetCode, then persisted to config. Boot validates the saved session and re-prompts on expiry; an in-app "Re-authenticate" command (Ctrl+P) recovers mid-session
- **DB sync**: Paginated fetch of all LeetCode problems on first run, stored in SQLite

### LeetCode API

- GraphQL: `https://leetcode.com/graphql` (problemsetQuestionList, questionContent, questionEditorData, consolePanelConfig)
- Run: `POST /problems/{slug}/interpret_solution/`
- Submit: `POST /problems/{slug}/submit/`
- Poll: `GET /submissions/detail/{id}/check/`

### Key bindings (browse mode)

j/k or arrows: Navigate questions | gg/G: Jump to first/last | t/T: Next/prev topic
D: Cycle difficulty filter | d: Daily challenge | Enter: View problem | e: Open in editor
R: Run solution | s: Submit solution | y: Yank problem URL | /: Search | q: Quit

### Config file (`~/.config/leettui/config.toml`)

`csrftoken` and `lc_session` are normally written by the auth flow (`src/core/auth/`), not by hand — Firefox auto-import or a guided, validated paste. `bun src/index.tsx auth` re-runs it.
