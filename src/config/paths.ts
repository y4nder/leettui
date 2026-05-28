import { homedir } from "os";
import { join } from "path";

const home = homedir();

export const CONFIG_DIR = join(home, ".config", "leettui");
export const DATA_DIR = join(home, ".local", "share", "leettui");
export const CONFIG_FILE = join(CONFIG_DIR, "config.toml");
export const DB_PATH = join(DATA_DIR, "questions.db");
export const SOLUTIONS_DIR = join(DATA_DIR, "solutions");
