import { parse } from "smol-toml";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { CONFIG_DIR, CONFIG_FILE, DB_PATH, SOLUTIONS_DIR } from "./paths";
import type { Config } from "./types";

const DEFAULT_TOML = `# LeetCode authentication tokens
# Get these from your browser cookies after logging into leetcode.com:
#   1. Open DevTools -> Application -> Cookies -> leetcode.com
#   2. Copy the values for LEETCODE_SESSION and csrftoken
csrftoken = ""
lc_session = ""

# [editor]
# command = ""  # Falls back to $EDITOR, then vim

# [paths]
# db = ""        # Default: ~/.local/share/leettui/questions.db
# solutions = "" # Default: ~/.local/share/leettui/solutions/

# [language]
# default = "python3"
`;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, DEFAULT_TOML);
    console.log(`Created config file at: ${CONFIG_FILE}`);
    console.log("Please add your LeetCode session tokens and restart.");
    process.exit(0);
  }

  const content = readFileSync(CONFIG_FILE, "utf-8");
  const parsed = parse(content) as unknown as Config;

  if (!parsed.csrftoken || !parsed.lc_session) {
    console.error(`Missing authentication tokens in ${CONFIG_FILE}`);
    console.error("Please add csrftoken and lc_session values.");
    process.exit(1);
  }

  _config = parsed;
  return _config;
}

export function getDbPath(): string {
  const config = loadConfig();
  return config.paths?.db || DB_PATH;
}

export function getSolutionsDir(): string {
  const config = loadConfig();
  return config.paths?.solutions || SOLUTIONS_DIR;
}

export function getEditorCommand(): string {
  const config = loadConfig();
  return config.editor?.command || process.env.EDITOR || "vim";
}

export function getDefaultLanguage(): string {
  const config = loadConfig();
  return config.language?.default || "python3";
}
