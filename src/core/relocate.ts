import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "fs";
import { join, resolve, sep } from "path";

export interface RelocateResult {
  moved: number;
  skipped: number;
}

// Moves an entire solutions tree from one directory to another. Each top-level
// entry (a `{paddedId}_{slug}` problem folder — which already carries its own
// `notes.md`/`tests/`/lang subdirs — plus any other top-level file such as a
// `.git` repo the user keeps there) is moved whole, so the function is faithful
// to "relocate the tree" and preserves a user's git history if they made the
// solutions dir a repo.
//
// Idempotent: after a successful pass the source is empty, so re-running is a
// no-op. Collision-safe: an entry that already exists at the destination is
// never overwritten (skipped). Best-effort: any failure (permissions, one bad
// entry) is counted as skipped rather than thrown, so a relocation can never
// crash the app or half-destroy data.
export function relocateSolutions(fromDir: string, toDir: string): RelocateResult {
  const result: RelocateResult = { moved: 0, skipped: 0 };

  const from = resolve(fromDir);
  const to = resolve(toDir);

  // No-op guards (all idempotent / safe):
  if (from === to) return result; // nowhere to move
  if (isContained(from, to) || isContained(to, from)) return result; // nested — pathological, refuse
  if (!existsSync(from)) return result; // nothing to move

  let entries: string[];
  try {
    entries = readdirSync(from);
  } catch {
    return result; // can't even list the source — bail quietly
  }

  // Ensure the target exists (it may be an unset/brand-new location).
  try {
    mkdirSync(to, { recursive: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    const src = join(from, entry);
    const dest = join(to, entry);

    if (existsSync(dest)) {
      result.skipped++; // collision-safe: never overwrite an existing entry
      continue;
    }

    try {
      moveEntry(src, dest);
      result.moved++;
    } catch {
      result.skipped++; // one bad entry never aborts the whole relocation
    }
  }

  return result;
}

// Move a single entry (file or directory subtree). `renameSync` is atomic and
// moves a whole subtree in one call when src and dest share a filesystem; the
// headline Stage 10 scenario (point solutions at an external repo/mount) is
// cross-device, where rename throws EXDEV — fall back to a recursive copy then
// remove. The collision pre-check guarantees `dest` is clean before the copy.
function moveEntry(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      cpSync(src, dest, { recursive: true });
      rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

// True when `child` is `parent` itself or a path nested under it. Used to refuse
// relocating a tree into its own subdirectory (or vice versa), which would be
// self-referential and corrupt the move.
function isContained(parent: string, child: string): boolean {
  if (parent === child) return true;
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}
