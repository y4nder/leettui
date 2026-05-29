# config/

Configuration loading and path resolution.

## Files

- `paths.ts` — XDG-compliant path constants (`CONFIG_DIR`, `DATA_DIR`, `CONFIG_FILE`, `DB_PATH`, `SOLUTIONS_DIR`)
- `types.ts` — `Config` interface matching the TOML schema
- `index.ts` — Loads and parses `~/.config/leettui/config.toml` via `smol-toml`. Creates default config on first run and exits. Exports singleton accessors: `loadConfig()`, `getDbPath()`, `getSolutionsDir()`, `getEditorCommand()`, `getDefaultLanguage()`, `getThemeName()`, and `persistThemeName(name)` — a surgical regex-based rewrite that updates `[theme] name` while preserving the user's comments (smol-toml has no comment-preserving stringifier).

## Config file format

```toml
csrftoken = "..."
lc_session = "..."

[editor]
command = ""  # falls back to $EDITOR, then vim

[paths]
db = ""        # default: ~/.local/share/leettui/questions.db
solutions = "" # default: ~/.local/share/leettui/solutions/

[language]
default = "python3"
```

## Dependencies

None (only uses `smol-toml` and `node:fs`/`node:os`).
