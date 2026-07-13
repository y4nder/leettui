# config/

Configuration loading and path resolution.

## Files

- `paths.ts` — XDG-compliant path constants (`CONFIG_DIR`, `DATA_DIR`, `CONFIG_FILE`, `DB_PATH`, `SOLUTIONS_DIR`, `TEMPLATES_DIR` — the latter `~/.config/leettui/templates/`, root of the per-language template-override tree). The two base dirs honor `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` (via `resolveBase`) when set to an absolute path, else default to `~/.config` / `~/.local/share`; every other constant derives from these, so an override moves the whole tree. Consts are evaluated at import (env read once at launch).
- `resolvePath.ts` — pure path-string helpers (Stage 9), unit-tested in `resolvePath.test.ts`. `expandPath(raw)` expands a leading `~`/`~/` → home and `$VAR`/`${VAR}` → env (unset → empty string; `~user` left untouched). `resolveBase(raw, fallback)` is the XDG policy (use only if it expands absolute, else fallback — spec says relative is ignored). `resolveConfigPath(raw)` is the user-config policy (expand, then anchor a still-relative result to `$HOME`, cwd-independent so the headless CLI agrees with the TUI).
- `types.ts` — `Config` interface matching the TOML schema
- `index.ts` — Loads and parses `~/.config/leettui/config.toml` via `smol-toml`. Creates the default config on first run but **does not exit** on missing/empty tokens (boot runs the auth flow instead). Exports singleton accessors: `loadConfig()`, `hasTokens(config?)`, `getDbPath()`, `getSolutionsDir()`, `getEditorArgv()` (→ the editor to spawn as an **argv array**, caller appends the path: resolves `[editor] command` → `$EDITOR` → a platform default — `vim`, or on Windows `code --wait` when `code` is on PATH else `notepad` — then runs the pure, unit-tested `parseEditorCommand` tokenizer so a configured command can carry flags/quoted-paths; `code.cmd` `.cmd`-via-PATHEXT spawn resolution is unverified on real Windows), `getEditorDetach()` (→ `[editor] detach`, coerced by the pure, unit-tested `coerceEditorDetach` — booleans pass through, `"true"`/`"false"` strings tolerated, anything else → `"auto"`; the pure `shouldDetachEditor(editorArgv, detach)` then decides: a forced boolean wins, `"auto"` matches argv[0]'s basename — split on `/` and `\`, `.exe`/`.cmd`/`.bat`/`.com` stripped, lowercased — against the exported `GUI_EDITOR_BASENAMES` set; `emacs` is deliberately absent since GUI emacs and `emacs -nw` share a basename, and wrapper launches like `flatpak run …` resolve to the wrapper's basename → blocking; both tested in `editorDetach.test.ts`), `getGitUiCommand()` (→ `[git] ui`, the git UI launched by Ctrl+g in the solutions dir, default `lazygit`), `getDefaultLanguage()`, `getThemeName()`, `getScrollJumpRows()` (→ `[scroll] jump_rows`, coerced by the pure, unit-tested `clampJumpRows` — below-1/NaN/non-number → the `DEFAULT_JUMP_ROWS` of 10, fractional → floored; no upper bound since the cursor clamp pins an oversized jump), `getUpdateAuto()` (→ `[update] auto`, the background auto-update knob, coerced by the pure, unit-tested `coerceUpdateAuto` — booleans pass through, "true"/"false" strings tolerated, anything else defaults to `true` so auto-update is on unless clearly turned off; the other gates live in `core/update`'s `shouldAutoDownload`), `getTemplatesDir()`, `getLanguageTemplateDir(langSlug)` (→ `templates/{langSlug}/`; the overlay in `core/solutions` reads it), plus surgical regex-based rewrites that preserve the user's comments (smol-toml has no comment-preserving stringifier). The generic entry point is `persistSetting(section, key, value)` — the single write path behind the in-TUI settings editor: a **string** value routes through the quoted, escaping `upsertSectionString`; a **number/boolean** routes through `upsertSectionRaw` (a bare, unquoted scalar) — the latter is essential for `[scroll] jump_rows`, which `clampJumpRows` only accepts as a real TOML number (a quoted `"10"` would be silently reset to the default). `persistThemeName(name)` (`[theme] name`) and `persistSolutionsDir(dir)` (`[paths] solutions` — Stage 10 items 3/4) are now thin wrappers that delegate to `persistSetting` (so a theme/solutions set on a machine with no config file now *creates* it, like `persistTokens` always did — the former theme early-return guard is gone). `persistTokens(csrf, session)` stays on `upsertTopLevelString` (top-level `csrftoken`/`lc_session`, inserting before the first section if absent). The two pure section writers — `upsertSectionString(content, section, key, value)` (quoted) and `upsertSectionRaw(content, section, key, rawValue)` (bare; value-match regex tolerates a prior bare *or* quoted value, so it overwrites a hand-quoted number too; **no escaping** — only ever fed `String(number)`/`String(boolean)`) — share the same three cases (replace the value / add the key to an existing section / append a new section), assume `key` is unique to `section` (safe for the current schema), and are unit-tested in `persist.test.ts`. `persistSetting` resets the `_config` memo after writing so the next accessor read is fresh.
- `settings.ts` — the pure metadata table behind the in-TUI settings editor (`src/ui/components/SettingsEditor.tsx`). Exports `SettingSpec` (`{ id, section, key, label, kind: "enum"|"text"|"number", options?, read, coerce, hint? }`) and `SETTINGS` — the 6 user-editable non-theme knobs (`editor.command`, `editor.detach`, `git.ui`, `language.default`, `scroll.jump_rows`, `update.auto`), each self-describing how to read its current value (through the coercing accessors) and how to validate/coerce a raw string (or reject with `null`). The `theme.name` row is deliberately assembled in the component instead (its option source `listThemeNames` + live-apply `setTheme` are ui/ concerns). `LANGUAGE_SLUGS` is a curated inline constant (not imported from `api/`) so this stays a config-leaf. Unit-tested in `settings.test.ts`.

## Config file format

```toml
csrftoken = "..."
lc_session = "..."

[editor]
command = ""  # falls back to $EDITOR, then a platform default (vim; on Windows
              # "code --wait" if VS Code is on PATH, else notepad). Args supported,
              # e.g. "code --wait" / "nvim -p"; quote a path with spaces.
detach = "auto"  # "auto" | true | false — GUI editors launch detached (TUI stays
                 # live); terminal editors suspend the TUI. true/false forces.

[git]
ui = "lazygit"  # git UI launched by Ctrl+g, in the solutions dir

[paths]
db = ""        # default: ~/.local/share/leettui/questions.db
solutions = "" # default: ~/.local/share/leettui/solutions/
# ~ and $VARS are expanded; a relative value resolves against $HOME.

[language]
default = "python3"

[scroll]
jump_rows = 10  # how many rows Ctrl+d/Ctrl+u jump (a positive integer)

[update]
auto = true  # download new releases in the background and install them (the
             # banner then says "restart to apply"); false = notify only
```

## Template overrides

`~/.config/leettui/templates/{langSlug}/` holds optional per-language template files. On solution creation, `core/solutions` overlays them (rendering `{{functionName}}`/`{{titleSlug}}`) into the new lang folder; a `solution.{ext}` overrides the LeetCode snippet, a harness-named file (`main.py`/`main.js`/`main.ts`) overrides the generated harness, and any other file (e.g. `Cargo.toml`, compiler-flag manifests) lands additively. Missing = bundled defaults. The dir is not part of the TOML schema — `config/` only exposes its path via `getTemplatesDir()`/`getLanguageTemplateDir()`.

## Dependencies

None (only uses `smol-toml` and `node:fs`/`node:os`/`node:path`).
