// Change the solutions directory from inside the TUI (Stage 10 item 4) and the
// types its prompt component consumes. Kept dependency-injectable so the critical
// read-before-persist ordering is locked by a unit test without touching fs/config.

import { resolve } from "node:path";

import { relocateSolutions, type RelocateResult } from "@/core/relocate";
import { setLastKnownSolutionsDir } from "@/core/session";
import { getSolutionsDir, persistSolutionsDir } from "@/config";
import { resolveConfigPath } from "@/config/resolvePath";

export interface ChangeLocationOutcome {
  /** "unchanged" when the resolved target equals the current dir (nothing written). */
  status: "unchanged" | "changed";
  fromDir: string;
  toDir: string;
  result: RelocateResult;
}

export interface ChangeLocationDeps {
  getSolutionsDir: () => string;
  persistSolutionsDir: (raw: string) => void;
  relocateSolutions: (from: string, to: string) => RelocateResult;
  setLastKnownSolutionsDir: (dir: string) => void;
}

const defaultChangeLocationDeps: ChangeLocationDeps = {
  getSolutionsDir,
  persistSolutionsDir,
  relocateSolutions,
  setLastKnownSolutionsDir,
};

// Change the solutions directory from inside the TUI (Stage 10 item 4): persist
// the new `[paths].solutions`, then migrate the existing tree old→new via item
// 1's relocation engine, all in one gated step (the prompt confirms first).
//
// **Critical ordering invariant:** read the *current* dir BEFORE persisting.
// `persistSolutionsDir` resets the config memo, so a `getSolutionsDir()` call
// after it would already return the *new* dir — making `fromDir === toDir` and
// silently no-op'ing the move. `rawInput` (with `~`/`$VARS` intact) is what's
// written to TOML, but the move uses the resolved absolute pair so it matches
// exactly what boot's `getSolutionsDir()` would compute. Deps are injectable so
// this invariant is locked by a unit test without touching the real config/fs.
export function changeSolutionsDir(
  rawInput: string,
  deps: ChangeLocationDeps = defaultChangeLocationDeps,
): ChangeLocationOutcome {
  const fromDir = deps.getSolutionsDir(); // BEFORE persist — the invariant
  const toDir = resolve(resolveConfigPath(rawInput));
  if (resolve(fromDir) === toDir) {
    return { status: "unchanged", fromDir, toDir, result: { moved: 0, skipped: 0 } };
  }
  deps.persistSolutionsDir(rawInput);
  const result = deps.relocateSolutions(fromDir, toDir);
  deps.setLastKnownSolutionsDir(toDir); // keep boot detection from re-nagging
  return { status: "changed", fromDir, toDir, result };
}
