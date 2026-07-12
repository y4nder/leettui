import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { getSolutionsDir } from "@/config";
import { EXTENSION_TO_LANGSLUG } from "@/api/types";

export interface MigrationResult {
  moved: number;
  skipped: number;
}

// One-time migration from the legacy flat layout
//   solutions/{paddedId}_{slug}.{ext}
// to the per-problem / per-language folder layout
//   solutions/{paddedId}_{slug}/{langSlug}/solution.{ext}
//
// Idempotent: after a successful pass no flat files remain, so re-running is a
// no-op. Safe to call on every boot. Never overwrites an existing target and
// leaves any file it can't classify in place, so it is loss-free.
export function migrateSolutionsLayout(dir: string = getSolutionsDir()): MigrationResult {
  const result: MigrationResult = { moved: 0, skipped: 0 };
  if (!existsSync(dir)) return result;

  // Best-effort: a migration failure must never block app startup. If the dir
  // can't even be listed (permissions, replaced by a file), bail quietly.
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  // LeetCode slugs are lowercase [a-z0-9-] with no dots, so `id_slug.ext` is
  // unambiguous: leading digits = id, trailing extension = lang.
  const FLAT = /^(\d+)_(.+)\.([^.]+)$/;

  for (const entry of entries) {
    const full = join(dir, entry);
    let isFile = false;
    try {
      isFile = statSync(full).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue; // already-migrated dirs and other folders

    const m = FLAT.exec(entry);
    if (!m) {
      continue; // .DS_Store, README, etc. — leave untouched, don't count
    }

    const [, paddedId, slug, ext] = m;
    const langSlug = EXTENSION_TO_LANGSLUG[ext!];
    if (!langSlug) {
      // Unknown extension — leave the file where it is so nothing is lost.
      result.skipped++;
      continue;
    }

    const target = join(dir, `${paddedId}_${slug}`, langSlug, `solution.${ext}`);
    if (existsSync(target)) {
      // A solution already exists at the destination — never overwrite.
      result.skipped++;
      continue;
    }

    try {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(full, target); // atomic on the same filesystem
      result.moved++;
    } catch {
      result.skipped++; // one bad file never aborts the whole migration
    }
  }

  return result;
}
