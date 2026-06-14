# config/

Configuration loading and path resolution.

## Files

- `paths.ts` — XDG-compliant path constants (`CONFIG_DIR`, `DATA_DIR`, `CONFIG_FILE`, `DB_PATH`, `SOLUTIONS_DIR`)
- `types.ts` — `Config` interface matching the TOML schema
- `index.ts` — Loads and parses `~/.config/leettui/config.toml` via `smol-toml`. Creates the default config on first run but **does not exit** on missing/empty tokens (boot runs the auth flow instead). Exports singleton accessors: `loadConfig()`, `hasTokens(config?)`, `getDbPath()`, `getSolutionsDir()`, `getEditorCommand()`, `getDefaultLanguage()`, `getThemeName()`, plus two surgical regex-based rewrites that preserve the user's comments (smol-toml has no comment-preserving stringifier): `persistThemeName(name)` (updates `[theme] name`) and `persistTokens(csrf, session)` (updates the top-level `csrftoken`/`lc_session` values, inserting them before the first section if absent). Both reset the `_config` memo after writing.

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
