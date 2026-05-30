// Persists the last-viewed browse position (topic + question) between runs so
// the app reopens where the user left off. Stored as a small JSON file in the
// data dir. Writes are debounced because navigation can fire on every keypress.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config/paths";

const SESSION_FILE = join(DATA_DIR, "session.json");

export interface SessionState {
  topicSlug?: string;
  questionId?: number;
}

export function loadSession(): SessionState {
  try {
    if (!existsSync(SESSION_FILE)) return {};
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as SessionState;
  } catch {
    return {};
  }
}

let _timer: ReturnType<typeof setTimeout> | null = null;
let _pending: SessionState | null = null;

export function saveSession(state: SessionState): void {
  _pending = state;
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    const s = _pending;
    _pending = null;
    if (!s) return;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(SESSION_FILE, JSON.stringify(s));
    } catch {
      // Best-effort: a failed position save must never crash the UI.
    }
  }, 400);
}
