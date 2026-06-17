import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSolutionsDir } from "../../config";
import { getNotesPath, getProblemDir, getProblemMdPath, solutionFilePath } from "./paths";

// Returns the shared `notes.md` content, or null if it doesn't exist yet (so
// the view can show a placeholder). No side effects.
export function readNotes(id: number, titleSlug: string): string | null {
  try {
    return readFileSync(getNotesPath(id, titleSlug), "utf-8");
  } catch {
    return null;
  }
}

// Returns the shared `problem.md` content, or null if it hasn't been generated
// yet (the workspace hasn't been opened). No side effects.
export function readProblemMd(id: number, titleSlug: string): string | null {
  try {
    return readFileSync(getProblemMdPath(id, titleSlug), "utf-8");
  } catch {
    return null;
  }
}

export function solutionExists(id: number, titleSlug: string, langSlug: string): boolean {
  return existsSync(solutionFilePath(id, titleSlug, langSlug));
}

// The single source of truth for "what counts as a solution": the langSlugs
// (language subfolder names) inside a problem dir that contain a `solution.*`
// file. The shared `notes.md`/`tests/` siblings never qualify, so a problem
// folder with only notes does not read as having a solution.
function langSlugsWithSolution(problemDir: string): string[] {
  if (!existsSync(problemDir)) return [];

  const langSlugs: string[] = [];
  for (const entry of readdirSync(problemDir)) {
    if (entry === "tests") continue;
    const sub = join(problemDir, entry);
    try {
      if (!statSync(sub).isDirectory()) continue;
      if (readdirSync(sub).some((f) => f.startsWith("solution."))) {
        langSlugs.push(entry);
      }
    } catch {
      // Unreadable entry — skip it.
    }
  }
  return langSlugs;
}

// Returns the langSlugs that have a solution file on disk for this problem.
export function findExistingSolutions(id: number, titleSlug: string): string[] {
  return langSlugsWithSolution(getProblemDir(id, titleSlug)).sort();
}

// Returns the set of question IDs that have at least one solution file. Backs
// the question-list "solution exists" marker. Uses the same `solution.*`
// predicate as `findExistingSolutions`, so the marker can never disagree with
// the problem view (a problem folder holding only `notes.md`/`tests/` is not
// counted).
export function listSolutionQuestionIds(): Set<number> {
  const dir = getSolutionsDir();
  if (!existsSync(dir)) return new Set();

  const ids = new Set<number>();
  for (const entry of readdirSync(dir)) {
    const m = /^(\d+)_/.exec(entry);
    if (!m) continue;
    const full = join(dir, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
      if (langSlugsWithSolution(full).length > 0) ids.add(parseInt(m[1]!, 10));
    } catch {
      // Unreadable entry — skip it.
    }
  }
  return ids;
}

// Returns null on a missing file or any read error, so callers (including the
// picker's render path) never have to guard against a throw.
export function readSolutionFile(id: number, titleSlug: string, langSlug: string): string | null {
  const path = solutionFilePath(id, titleSlug, langSlug);
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}
