# leettui

LeetCode TUI built with OpenTUI (React bindings) and Bun.

## Quick start

```sh
cd leettui
bun install
bun src/index.tsx
```

On first run, a config file is created at `~/.config/leettui/config.toml`. Add your LeetCode session tokens there and restart.

## Architecture

- **Runtime**: Bun (required by OpenTUI)
- **UI Framework**: OpenTUI with React bindings (`@opentui/core`, `@opentui/react`, `@opentui/keymap`)
- **Storage**: SQLite via `bun:sqlite`
- **Config**: TOML via `smol-toml` at `~/.config/leettui/config.toml`

### Directory layout

- `src/config/` — Config loading (TOML), XDG path resolution
- `src/api/` — LeetCode API client (GraphQL + REST), response types
- `src/db/` — SQLite database, schema, CRUD operations
- `src/core/` — Business logic (sync, fuzzy search, solution file management)
- `src/ui/` — React components, hooks, theme, keymap

### Key patterns

- **JSX**: Uses `@opentui/react` intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`)
- **State**: React `useReducer` for centralized app state; mode determines active keybindings
- **API auth**: Cookie-based (`LEETCODE_SESSION` + `csrftoken` from config)
- **DB sync**: Paginated fetch of all LeetCode problems on first run, stored in SQLite

### LeetCode API

- GraphQL: `https://leetcode.com/graphql` (problemsetQuestionList, questionContent, questionEditorData, consolePanelConfig)
- Run: `POST /problems/{slug}/interpret_solution/`
- Submit: `POST /problems/{slug}/submit/`
- Poll: `GET /submissions/detail/{id}/check/`

### Key bindings (browse mode)

j/k or arrows: Navigate questions | t/T: Next/prev topic | Enter: View problem
e: Open in editor | R: Run solution | s: Submit solution | /: Search | q: Quit

### Config file (`~/.config/leettui/config.toml`)

Requires `csrftoken` and `lc_session` fields. Get these from browser cookies after logging into leetcode.com.
