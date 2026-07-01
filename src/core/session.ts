// Persists small cross-run state to a JSON file in the data dir:
//   - the last-viewed browse position (topic + question) so the app reopens
//     where the user left off (Stage 5);
//   - the last resolved solutions dir ("last known") so a later change can be
//     detected even when the user hand-edits config.toml (Stage 10);
//   - the most recent release tag whose changelog popup was shown, so the
//     "What's new" popup fires once per new version, not every launch (Stage 18).
//
// All writers merge into a single in-memory mirror (`_state`) that is lazily
// loaded from disk on first touch, so a partial update from one feature never
// clobbers a field owned by another (position-save fires on every keypress;
// the solutions-dir write is rare). Position writes are debounced; the
// debounced callback serializes the *live* `_state` at fire time, so a
// synchronous write landing between schedule and fire is preserved.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths";

const SESSION_FILE = join(DATA_DIR, "session.json");

export interface SessionState {
  topicSlug?: string;
  questionId?: number;
  solutionsDir?: string;
  lastShownChangelogVersion?: string;
  // Whether the one-time first-run backfill nudge (D-01/D-02) has already been
  // shown. Set unconditionally at boot (mirrors lastShownChangelogVersion's
  // seeding invariant) so it can never re-fire.
  backfillNudgeShown?: boolean;
}

// In-memory mirror of the session file. Lazily initialized from disk so the
// first writer to touch it merges into existing persisted state rather than
// overwriting it.
let _state: SessionState | null = null;

function state(): SessionState {
  if (_state) return _state;
  try {
    _state = existsSync(SESSION_FILE)
      ? (JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as SessionState)
      : {};
  } catch {
    _state = {};
  }
  return _state;
}

function writeNow(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(state()));
  } catch {
    // Best-effort: a failed session save must never crash the UI.
  }
}

export function loadSession(): SessionState {
  return state();
}

let _timer: ReturnType<typeof setTimeout> | null = null;

// Merge a partial position update and debounce the write (navigation fires on
// every keypress). The timeout serializes the live mirror, so any synchronous
// write that lands first is included.
export function saveSession(partial: SessionState): void {
  Object.assign(state(), partial);
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    writeNow();
  }, 400);
}

// The last resolved solutions dir, or undefined if never recorded (lets the
// caller distinguish "first boot, initialize" from "the path changed").
export function getLastKnownSolutionsDir(): string | undefined {
  return state().solutionsDir;
}

// Record the resolved solutions dir. Synchronous (it's rare) and merges, so it
// coexists with a debounced position save in flight.
export function setLastKnownSolutionsDir(dir: string): void {
  state().solutionsDir = dir;
  writeNow();
}

// The most recent release tag whose "What's new" popup was shown, or undefined
// if none yet. Lets the boot trigger fire the popup once per new version, then
// fall back to the 1-line UpdateBanner on later launches for the same tag.
// Distinct from the session-only banner dismiss (uiSlice.updateAvailable) and
// the module-level on-quit reminder (setPendingUpdate) in core/update.
export function getLastShownChangelogVersion(): string | undefined {
  return state().lastShownChangelogVersion;
}

// Record the release tag whose changelog popup we just showed. Synchronous (it's
// rare) and merges, so it coexists with a debounced position save in flight.
export function setLastShownChangelogVersion(tag: string): void {
  state().lastShownChangelogVersion = tag;
  writeNow();
}

// Whether the one-time first-run backfill nudge has already been shown.
// TODO(RED): not implemented yet — stub bodies exist only so the module
// type-checks while the failing tests are committed. GREEN fills these in.
export function getBackfillNudgeShown(): boolean {
  return false;
}

// Record that the backfill nudge has been shown (or seeded on a fresh install
// with no data). Synchronous merge-write, called unconditionally at boot.
export function setBackfillNudgeShown(): void {
  // stub
}

// Pure decision for the one-time first-run backfill nudge (D-01/D-02): never
// show once already shown, never show if submission history already exists,
// otherwise only while the user is looking at browse.
export function shouldShowBackfillNudge(
  _nudgeShown: boolean,
  _hasAnySubmissions: boolean,
  _mode: string,
): boolean {
  void _nudgeShown;
  void _hasAnySubmissions;
  void _mode;
  return false;
}
