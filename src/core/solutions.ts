import { mkdirSync, existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { getSolutionsDir } from "../config";
import { getExtension } from "../api/types";
import { generateHarness } from "./harness";

const ID_PADDING = 4;

// Layout: solutions/{paddedId}_{slug}/{langSlug}/solution.{ext}, with shared
// notes.md and tests/ at the problem-folder level. The langSlug is the identity
// of a solution (the directory name); the filename is always `solution.{ext}`.

export function getProblemDirName(id: number, titleSlug: string): string {
  return `${String(id).padStart(ID_PADDING, "0")}_${titleSlug}`;
}

export function getProblemDir(id: number, titleSlug: string): string {
  return join(getSolutionsDir(), getProblemDirName(id, titleSlug));
}

export function getSolutionFilename(langSlug: string): string {
  return `solution.${getExtension(langSlug)}`;
}

// Path without side effects — for existence checks that must not create dirs.
function solutionFilePath(id: number, titleSlug: string, langSlug: string): string {
  return join(getProblemDir(id, titleSlug), langSlug, getSolutionFilename(langSlug));
}

export function getSolutionPath(
  id: number,
  titleSlug: string,
  langSlug: string
): string {
  const path = solutionFilePath(id, titleSlug, langSlug);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

// Shared, language-agnostic problem-folder locations. Defined here so later
// Stage 7 items (notes, local test runner) reuse them without re-touching paths.
export function getNotesPath(id: number, titleSlug: string): string {
  return join(getProblemDir(id, titleSlug), "notes.md");
}

export function getTestsDir(id: number, titleSlug: string): string {
  return join(getProblemDir(id, titleSlug), "tests");
}

export function solutionExists(
  id: number,
  titleSlug: string,
  langSlug: string
): boolean {
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
export function findExistingSolutions(
  id: number,
  titleSlug: string
): string[] {
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

export function createSolutionFile(
  id: number,
  titleSlug: string,
  langSlug: string,
  code: string
): string {
  const path = getSolutionPath(id, titleSlug, langSlug);
  if (!existsSync(path)) {
    Bun.write(path, code);
  }
  return path;
}

// Path to a harness file (e.g. `main.py`) inside the language subfolder. Mkdirs
// the lang folder like `getSolutionPath`, so a harness can be written even
// before its sibling `solution.*` exists.
export function getHarnessPath(
  id: number,
  titleSlug: string,
  langSlug: string,
  filename: string
): string {
  const path = join(getProblemDir(id, titleSlug), langSlug, filename);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

// Writes a generated harness only if it doesn't already exist, so a user's
// edits to a previously generated harness are never clobbered.
export function createHarnessFile(
  id: number,
  titleSlug: string,
  langSlug: string,
  filename: string,
  content: string
): string {
  const path = getHarnessPath(id, titleSlug, langSlug, filename);
  if (!existsSync(path)) {
    Bun.write(path, content);
  }
  return path;
}

// Seeds the shared problem-level `tests/` dir from LeetCode's example test
// cases. Each `exampleTestcaseList` entry is already a full case (one JSON
// value per line), written verbatim as `case-NN.txt`. Existing case files are
// never overwritten; an empty list is a no-op.
export function seedTests(
  id: number,
  titleSlug: string,
  exampleTestcases: string[]
): void {
  if (!exampleTestcases || exampleTestcases.length === 0) return;
  const dir = getTestsDir(id, titleSlug);
  mkdirSync(dir, { recursive: true });
  exampleTestcases.forEach((testcase, i) => {
    const name = `case-${String(i + 1).padStart(2, "0")}.txt`;
    const path = join(dir, name);
    if (!existsSync(path)) {
      Bun.write(path, testcase);
    }
  });
}

// Create-flow orchestrator: writes the solution file, then — for languages with
// a harness generator (currently python3) — a sibling harness, then seeds the
// shared `tests/` dir from the example cases. `metaDataRaw`/`exampleTestcases`
// are optional so callers that lack them still create a plain solution file.
// Returns the solution file path (what the editor opens).
export function createSolutionWithHarness(
  id: number,
  titleSlug: string,
  langSlug: string,
  code: string,
  metaDataRaw?: string,
  exampleTestcases?: string[]
): string {
  const solutionPath = createSolutionFile(id, titleSlug, langSlug, code);

  const harness = generateHarness(langSlug, metaDataRaw);
  if (harness) {
    createHarnessFile(id, titleSlug, langSlug, harness.filename, harness.content);
  }

  if (exampleTestcases) {
    seedTests(id, titleSlug, exampleTestcases);
  }

  return solutionPath;
}

// Returns null on a missing file or any read error, so callers (including the
// picker's render path) never have to guard against a throw.
export function readSolutionFile(
  id: number,
  titleSlug: string,
  langSlug: string
): string | null {
  const path = solutionFilePath(id, titleSlug, langSlug);
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}
