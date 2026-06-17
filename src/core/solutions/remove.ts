import { rmSync } from "node:fs";
import { join } from "node:path";
import { getProblemDir } from "./paths";

// Removes a single language subfolder (`{paddedId}_{slug}/{langSlug}/`) and all
// it holds — `solution.{ext}`, the generated harness/manifest, and any compiled
// `target/`. The shared problem-level files (`notes.md`/`problem.md`/`tests/`)
// and every *other* language folder are left untouched, matching the stage's
// "redo this one language" / "clear a stale harness" motivation.
//
// Mirrors the `migration.ts`/`relocate.ts` contract: **idempotent** (a missing
// folder is a no-op) and **never throws** (a permissions error or a vanished dir
// is swallowed via `force`), so the delete action can never crash the app or
// half-destroy data.
//
// **Safety invariant:** an empty `langSlug` would make the target path equal the
// problem dir itself, so a recursive remove would wipe the shared notes/tests —
// the exact thing this stage protects. Refuse it outright.
export function deleteSolution(id: number, titleSlug: string, langSlug: string): void {
  if (!langSlug) return;
  const target = join(getProblemDir(id, titleSlug), langSlug);
  rmSync(target, { recursive: true, force: true });
}
