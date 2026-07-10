import { parse } from "smol-toml";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR, CONFIG_FILE, DB_PATH, SOLUTIONS_DIR, TEMPLATES_DIR } from "./paths";
import { resolveConfigPath } from "./resolvePath";
import type { Config } from "./types";

const DEFAULT_TOML = `# LeetCode authentication tokens
# These are filled in automatically by the auth flow (Firefox auto-import or a
# guided paste). It runs on first launch, or any time via:  bun src/index.tsx auth
# You can also paste them here by hand if you prefer.
csrftoken = ""
lc_session = ""

# [editor]
# command = ""  # Falls back to $EDITOR, then a platform default (vim; on Windows,
#               # "code --wait" if VS Code is on PATH, else notepad). Arguments are
#               # supported, e.g. "code --wait" or "nvim -p"; quote a full path that
#               # contains spaces.
# detach = "auto"  # "auto" | true | false — GUI editors (VS Code, Zed, …) launch
#                  # detached so the TUI stays interactive; terminal editors still
#                  # suspend the TUI. true/false forces it either way.

# [git]
# ui = "lazygit"  # git UI launched by Ctrl+g, in the solutions dir (falls back to lazygit)

# [paths]
# db = ""        # Default: ~/.local/share/leettui/questions.db
# solutions = "" # Default: ~/.local/share/leettui/solutions/
# A leading ~ and $VARS are expanded; a relative path is resolved against your home dir.

# [language]
# default = "python3"

# [theme]
# name = "tokyo-night"  # available: tokyo-night, catppuccin, system

# [scroll]
# jump_rows = 10  # how many rows Ctrl+d/Ctrl+u jump (a positive integer)
`;

// Default Ctrl+d/Ctrl+u jump distance, in rows.
export const DEFAULT_JUMP_ROWS = 10;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, DEFAULT_TOML);
    console.log(`Created config file at: ${CONFIG_FILE}`);
    // Tokens are empty for now; boot launches the auth flow (no longer exits here).
  }

  const content = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf-8") : DEFAULT_TOML;
  const parsed = parse(content) as unknown as Config;

  // Missing/empty tokens are no longer fatal — boot detects this via hasTokens()
  // and runs the auth flow instead of crashing.
  _config = parsed;
  return _config;
}

export function hasTokens(config: Config = loadConfig()): boolean {
  return Boolean(config.csrftoken && config.lc_session);
}

export function getDbPath(): string {
  const config = loadConfig();
  return config.paths?.db ? resolveConfigPath(config.paths.db) : DB_PATH;
}

export function getSolutionsDir(): string {
  const config = loadConfig();
  return config.paths?.solutions ? resolveConfigPath(config.paths.solutions) : SOLUTIONS_DIR;
}

// Split an editor command string into an argv array so a configured command can
// carry flags (e.g. `code --wait`, `nvim -p`, `emacsclient -nw`) — the spawn
// sites used to pass the whole string as a single executable, so anything with a
// space was unrunnable. Whitespace separates tokens; single/double quotes group a
// token that contains spaces (e.g. a Windows path like
// `"C:\Program Files\Microsoft VS Code\bin\code.cmd"`). Backslashes are NOT
// escapes — they're path separators on Windows — so only quotes group. Pure, so
// the tokenizing is unit-tested off the filesystem.
export function parseEditorCommand(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (ch === " " || ch === "\t") {
      if (inToken) {
        tokens.push(current);
        current = "";
        inToken = false;
      }
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) tokens.push(current);
  return tokens;
}

// The editor to fall back to when neither `[editor] command` nor $EDITOR is set.
// Unix keeps `vim`. Windows has no vim by default, so prefer VS Code when its
// `code` launcher is on PATH — with `--wait` (now expressible thanks to the argv
// support above; without it `code` forks and returns immediately, collapsing the
// suspend/edit/resume handover) — else `notepad` (always present, a real .exe that
// blocks until closed). Caveat: VS Code's `code` is a `code.cmd` shim on Windows;
// whether Bun.spawn resolves a .cmd via PATHEXT is unverified on a real Windows box.
function defaultEditorCommand(): string {
  if (process.platform === "win32") {
    return Bun.which("code") ? "code --wait" : "notepad";
  }
  return "vim";
}

// The editor to spawn, as an argv prefix the caller appends the path/dir to.
// Resolves `[editor] command` → $EDITOR → the platform default, then tokenizes so
// flags survive. Re-falls-back to the platform default if the resolved string
// tokenizes to nothing (e.g. a whitespace-only $EDITOR).
export function getEditorArgv(): string[] {
  const config = loadConfig();
  const raw = config.editor?.command || process.env.EDITOR || defaultEditorCommand();
  const argv = parseEditorCommand(raw);
  return argv.length > 0 ? argv : parseEditorCommand(defaultEditorCommand());
}

export type EditorDetach = "auto" | boolean;

// TOML can hand us anything for `[editor] detach`: real booleans pass through,
// "true"/"false" strings are tolerated, everything else (including "auto" and
// garbage) normalizes to "auto". Pure, unit-tested in editorDetach.test.ts.
export function coerceEditorDetach(raw: unknown): EditorDetach {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return "auto";
}

export function getEditorDetach(): EditorDetach {
  return coerceEditorDetach(loadConfig().editor?.detach);
}

// Basenames of known GUI editors — detached under "auto" so the TUI stays live
// while the editor window is open. Terminal editors (vim/nvim/hx/nano/…) stay on
// the blocking suspend/resume handover. `emacs` is deliberately absent: GUI emacs
// and `emacs -nw` are indistinguishable by basename — force `detach = true` if
// you run GUI emacs. Same for wrapper launches (`flatpak run …` → basename
// `flatpak` → blocking).
export const GUI_EDITOR_BASENAMES = new Set([
  "code",
  "code-insiders",
  "codium",
  "vscodium",
  "code-oss",
  "cursor",
  "windsurf",
  "zed",
  "atom",
  "subl",
  "sublime_text",
  "gedit",
  "gnome-text-editor",
  "kate",
  "kwrite",
  "geany",
  "mousepad",
  "pluma",
  "xed",
  "notepad",
  "notepad++",
  "notepadqq",
  "idea",
  "webstorm",
  "pycharm",
  "clion",
  "goland",
  "rider",
  "fleet",
]);

// Pure detach decision: a forced true/false wins; "auto" matches argv[0]'s
// basename against the GUI list. Split on both / and \ (a Windows path arrives
// with backslashes) and strip launcher extensions (`Code.exe`, `code.cmd`).
export function shouldDetachEditor(editorArgv: string[], detach: EditorDetach): boolean {
  if (detach !== "auto") return detach;
  const cmd = editorArgv[0];
  if (!cmd) return false;
  const base = cmd.split(/[/\\]/).pop()!.toLowerCase();
  const name = base.replace(/\.(exe|cmd|bat|com)$/, "");
  return GUI_EDITOR_BASENAMES.has(name);
}

// The git UI launched in the solutions dir by the `git.openUi` command (Ctrl+g,
// Stage 22). Defaults to lazygit. Any tool that
// honors cwd works (gitui/tig/git) since the launcher spawns it with
// cwd = the solutions dir.
export function getGitUiCommand(): string {
  const config = loadConfig();
  return config.git?.ui || "lazygit";
}

export function getDefaultLanguage(): string {
  const config = loadConfig();
  return config.language?.default || "python3";
}

export function getThemeName(): string | undefined {
  const config = loadConfig();
  return config.theme?.name;
}

// Coerce a raw `[scroll] jump_rows` TOML value into a usable row count.
// Anything that isn't a finite number ≥ 1 is rejected: zero/negative,
// NaN/Infinity, or a non-number (TOML could yield a string/bool) falls back to
// the default; a fractional value is floored to whole rows. No upper bound — an
// oversized count just overshoots the list end, which the cursor clamp pins back
// into range. Pure so the out-of-range handling is unit-tested off the filesystem.
export function clampJumpRows(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return DEFAULT_JUMP_ROWS;
  }
  return Math.floor(raw);
}

export function getScrollJumpRows(): number {
  return clampJumpRows(loadConfig().scroll?.jump_rows);
}

// Root of the per-language template-override tree. Users drop files under
// `templates/{langSlug}/` to override the bundled solution/harness defaults or
// add manifest files (Cargo.toml, etc.); the create flow overlays them.
export function getTemplatesDir(): string {
  return TEMPLATES_DIR;
}

// The template-override folder for a single language. May not exist — callers
// treat a missing dir as "no overrides".
export function getLanguageTemplateDir(langSlug: string): string {
  return join(getTemplatesDir(), langSlug);
}

// Surgical rewrite of `~/.config/leettui/config.toml` to update the active
// theme name, preserving the user's comments and formatting (regex-based rather
// than parse→stringify, since smol-toml has no comment-preserving stringifier).
export function persistThemeName(name: string): void {
  if (!existsSync(CONFIG_FILE)) return;
  const content = readFileSync(CONFIG_FILE, "utf-8");
  writeFileSync(CONFIG_FILE, upsertSectionString(content, "theme", "name", name));
  // Refresh the in-process config so getThemeName() reflects the persisted value
  // on the next call (e.g., for diagnostics).
  _config = null;
}

// Persist the solutions directory to `[paths] solutions` (Stage 10 item 3 —
// first-run onboarding / item 4 — in-TUI change). Same comment-preserving rewrite
// as persistThemeName; falls back to DEFAULT_TOML if the file isn't there yet (as
// persistTokens does) so onboarding can write before anything else has.
export function persistSolutionsDir(dir: string): void {
  let content = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf-8") : DEFAULT_TOML;
  content = upsertSectionString(content, "paths", "solutions", dir);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, content);
  _config = null;
}

// Surgically set `key = "value"` inside `[section]`, preserving all comments and
// formatting. Three cases: replace the key's existing value, add the key to an
// existing section, or append a brand-new section. Pure (string→string) so it's
// unit-tested directly. NOTE: assumes `key` is unique to `section` — the hasKey
// pattern lazy-matches from the section header, so a same-named key in a *later*
// section could be reached if the target section lacks it. Safe for the current
// schema (`theme.name`, `paths.solutions` don't collide elsewhere).
export function upsertSectionString(
  content: string,
  section: string,
  key: string,
  value: string,
): string {
  const escaped = escapeTomlString(value);
  const sectionRe = new RegExp(`^\\s*\\[${section}\\]`, "m");
  const hasSection = sectionRe.test(content);
  const keyRe = new RegExp(`(^\\s*\\[${section}\\][\\s\\S]*?^\\s*)${key}\\s*=\\s*"[^"]*"`, "m");
  const hasKey = hasSection && keyRe.test(content);

  if (hasKey) return content.replace(keyRe, `$1${key} = "${escaped}"`);
  if (hasSection) {
    return content.replace(
      new RegExp(`(^\\s*\\[${section}\\]\\s*\\n)`, "m"),
      `$1${key} = "${escaped}"\n`,
    );
  }
  return `${content.trimEnd()}\n\n[${section}]\n${key} = "${escaped}"\n`;
}

// Surgically rewrite the top-level `csrftoken`/`lc_session` values, preserving all
// comments and formatting (same rationale as persistThemeName — smol-toml has no
// comment-preserving stringifier). Written by the auth flow once tokens validate.
export function persistTokens(csrftoken: string, lc_session: string): void {
  let content = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf-8") : DEFAULT_TOML;
  content = upsertTopLevelString(content, "csrftoken", csrftoken);
  content = upsertTopLevelString(content, "lc_session", lc_session);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, content);
  _config = null;
}

// Escape a value for embedding inside a TOML double-quoted string.
function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Replace `key = "..."`'s value if the line exists (keeping any trailing comment),
// otherwise insert the key before the first TOML section header (or append).
function upsertTopLevelString(content: string, key: string, value: string): string {
  const escaped = escapeTomlString(value);
  const re = new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"`, "m");
  if (re.test(content)) return content.replace(re, `$1"${escaped}"`);

  const line = `${key} = "${escaped}"\n`;
  const sectionIdx = content.search(/^\s*\[/m);
  if (sectionIdx === -1) return `${content.trimEnd()}\n${line}`;
  return content.slice(0, sectionIdx) + line + content.slice(sectionIdx);
}
