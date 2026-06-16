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
# command = ""  # Falls back to $EDITOR, then vim

# [paths]
# db = ""        # Default: ~/.local/share/leettui/questions.db
# solutions = "" # Default: ~/.local/share/leettui/solutions/
# A leading ~ and $VARS are expanded; a relative path is resolved against your home dir.

# [language]
# default = "python3"

# [theme]
# name = "tokyo-night"  # available: tokyo-night, catppuccin, system
`;

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

export function getEditorCommand(): string {
  const config = loadConfig();
  return config.editor?.command || process.env.EDITOR || "vim";
}

export function getDefaultLanguage(): string {
  const config = loadConfig();
  return config.language?.default || "python3";
}

export function getThemeName(): string | undefined {
  const config = loadConfig();
  return config.theme?.name;
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
