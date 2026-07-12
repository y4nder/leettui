import { mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { getSolutionsDir } from "@/config";
import { getExtension } from "@/api/types";

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

// The reverse of `getProblemDir`: given a filesystem path, identify which
// problem (and language) it lives under, by matching the on-disk layout
// `{solutionsDir}/{paddedId}_{slug}/{langSlug}/…`. Backs the headless CLI's
// cwd-inference (Stage 8) — running `leettui test` from inside a solution
// folder needs no problem argument.
//
// Pure and config-free: it takes the solutions dir explicitly so it stays
// unit-testable with a fabricated root. `langSlug` is null when `path` only
// reaches the problem-folder level (e.g. the user is sitting in the shared
// `notes.md`/`tests/` parent); the caller decides whether a language is
// required. The DB lookup (id/slug → DbQuestion) is deliberately left to the
// caller. Returns null when `path` is not inside `solutionsDir` or the first
// segment isn't a `{paddedId}_{slug}` problem dir.
export interface ResolvedProblemPath {
  questionId: number;
  titleSlug: string;
  langSlug: string | null;
}

export function resolveProblemPath(path: string, solutionsDir: string): ResolvedProblemPath | null {
  const rel = relative(resolve(solutionsDir), resolve(path));
  // Outside the solutions tree (or equal to it): "" or starts with "..".
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return null;

  const segments = rel.split(sep).filter(Boolean);
  const m = /^(\d+)_(.+)$/.exec(segments[0] ?? "");
  if (!m) return null;

  return {
    questionId: parseInt(m[1]!, 10),
    titleSlug: m[2]!,
    langSlug: segments[1] ?? null,
  };
}

// Convenience wrapper resolving against the configured solutions dir.
export function resolveProblemFromCwd(cwd: string): ResolvedProblemPath | null {
  return resolveProblemPath(cwd, getSolutionsDir());
}

// Path without side effects — for existence checks that must not create dirs.
export function solutionFilePath(id: number, titleSlug: string, langSlug: string): string {
  return join(getProblemDir(id, titleSlug), langSlug, getSolutionFilename(langSlug));
}

export function getSolutionPath(id: number, titleSlug: string, langSlug: string): string {
  const path = solutionFilePath(id, titleSlug, langSlug);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

// Shared, language-agnostic problem-folder locations. Defined here so later
// Stage 7 items (notes, local test runner) reuse them without re-touching paths.
export function getNotesPath(id: number, titleSlug: string): string {
  return join(getProblemDir(id, titleSlug), "notes.md");
}

// The shared `problem.md` — the offline problem statement at the problem-folder
// level (sibling to `notes.md`), created when the workspace is opened (Stage 13).
export function getProblemMdPath(id: number, titleSlug: string): string {
  return join(getProblemDir(id, titleSlug), "problem.md");
}

export function getTestsDir(id: number, titleSlug: string): string {
  return join(getProblemDir(id, titleSlug), "tests");
}

// Path to an arbitrary file inside the language subfolder. Mkdirs the lang
// folder like `getSolutionPath`, so a file can be written even before its
// sibling `solution.*` exists. Backs both the harness writer and the template
// overlay (which writes manifests/harnesses/solution stubs by name).
export function getLangFilePath(
  id: number,
  titleSlug: string,
  langSlug: string,
  filename: string,
): string {
  const path = join(getProblemDir(id, titleSlug), langSlug, filename);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

// Path to a harness file (e.g. `main.py`) inside the language subfolder.
export function getHarnessPath(
  id: number,
  titleSlug: string,
  langSlug: string,
  filename: string,
): string {
  return getLangFilePath(id, titleSlug, langSlug, filename);
}
