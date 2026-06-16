import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBase } from "./resolvePath";

const home = homedir();

// Base directories honor the XDG Base Directory spec: `$XDG_CONFIG_HOME` and
// `$XDG_DATA_HOME` override the defaults when set to an absolute path, otherwise
// fall back to `~/.config` and `~/.local/share`. Everything below derives from
// these two bases, so a custom location moves the whole tree automatically.
const CONFIG_HOME = resolveBase(process.env.XDG_CONFIG_HOME, join(home, ".config"));
const DATA_HOME = resolveBase(process.env.XDG_DATA_HOME, join(home, ".local", "share"));

export const CONFIG_DIR = join(CONFIG_HOME, "leettui");
export const DATA_DIR = join(DATA_HOME, "leettui");
export const CONFIG_FILE = join(CONFIG_DIR, "config.toml");
export const DB_PATH = join(DATA_DIR, "questions.db");
export const SOLUTIONS_DIR = join(DATA_DIR, "solutions");
// Per-language template overrides live under here, one subfolder per langSlug
// (e.g. templates/rust/Cargo.toml, templates/python3/main.py).
export const TEMPLATES_DIR = join(CONFIG_DIR, "templates");
