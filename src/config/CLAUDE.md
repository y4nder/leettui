# config/

Configuration loading and path resolution.

## Files

- `paths.ts` — XDG-compliant path constants (`CONFIG_DIR`, `DATA_DIR`, `CONFIG_FILE`, `DB_PATH`, `SOLUTIONS_DIR`, `TEMPLATES_DIR` — the latter `~/.config/leettui/templates/`, root of the per-language template-override tree). The two base dirs honor `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` (via `resolveBase`) when set to an absolute path, else default to `~/.config` / `~/.local/share`; every other constant derives from these, so an override moves the whole tree. Consts are evaluated at import (env read once at launch).
- `resolvePath.ts` — pure path-string helpers (Stage 9), unit-tested in `resolvePath.test.ts`. `expandPath(raw)` expands a leading `~`/`~/` → home and `$VAR`/`${VAR}` → env (unset → empty string; `~user` left untouched). `resolveBase(raw, fallback)` is the XDG policy (use only if it expands absolute, else fallback — spec says relative is ignored). `resolveConfigPath(raw)` is the user-config policy (expand, then anchor a still-relative result to `$HOME`, cwd-independent so the headless CLI agrees with the TUI).
- `types.ts` — `Config` interface matching the TOML schema
- `index.ts` — Loads and parses `~/.config/leettui/config.toml` via `smol-toml`. Creates the default config on first run but **does not exit** on missing/empty tokens (boot runs the auth flow instead). Exports singleton accessors: `loadConfig()`, `hasTokens(config?)`, `getDbPath()`, `getSolutionsDir()`, `getEditorCommand()`, `getDefaultLanguage()`, `getThemeName()`, `getTemplatesDir()`, `getLanguageTemplateDir(langSlug)` (→ `templates/{langSlug}/`; the overlay in `core/solutions.ts` reads it), plus two surgical regex-based rewrites that preserve the user's comments (smol-toml has no comment-preserving stringifier): `persistThemeName(name)` (updates `[theme] name`) and `persistTokens(csrf, session)` (updates the top-level `csrftoken`/`lc_session` values, inserting them before the first section if absent). Both reset the `_config` memo after writing.

## Config file format

```toml
csrftoken = "..."
lc_session = "..."

[editor]
command = ""  # falls back to $EDITOR, then vim

[paths]
db = ""        # default: ~/.local/share/leettui/questions.db
solutions = "" # default: ~/.local/share/leettui/solutions/
# ~ and $VARS are expanded; a relative value resolves against $HOME.

[language]
default = "python3"
```

## Template overrides

`~/.config/leettui/templates/{langSlug}/` holds optional per-language template files. On solution creation, `core/solutions.ts` overlays them (rendering `{{functionName}}`/`{{titleSlug}}`) into the new lang folder; a `solution.{ext}` overrides the LeetCode snippet, a harness-named file (`main.py`/`main.js`/`main.ts`) overrides the generated harness, and any other file (e.g. `Cargo.toml`, compiler-flag manifests) lands additively. Missing = bundled defaults. The dir is not part of the TOML schema — `config/` only exposes its path via `getTemplatesDir()`/`getLanguageTemplateDir()`.

## Dependencies

None (only uses `smol-toml` and `node:fs`/`node:os`/`node:path`).
