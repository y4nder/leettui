import { mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getSolutionsDir } from "../config";
import { getExtension } from "../api/types";

export function getSolutionFilename(
  id: number,
  titleSlug: string,
  langSlug: string
): string {
  const paddedId = String(id).padStart(4, "0");
  const ext = getExtension(langSlug);
  return `${paddedId}_${titleSlug}.${ext}`;
}

export function getSolutionPath(
  id: number,
  titleSlug: string,
  langSlug: string
): string {
  const dir = getSolutionsDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, getSolutionFilename(id, titleSlug, langSlug));
}

export function solutionExists(
  id: number,
  titleSlug: string,
  langSlug: string
): boolean {
  return existsSync(getSolutionPath(id, titleSlug, langSlug));
}

export function findExistingSolutions(
  id: number,
  titleSlug: string
): string[] {
  const dir = getSolutionsDir();
  if (!existsSync(dir)) return [];

  const prefix = `${String(id).padStart(4, "0")}_${titleSlug}.`;
  return readdirSync(dir).filter((f) => f.startsWith(prefix));
}

// Scans the solutions dir once and returns the set of question IDs that have at
// least one solution file. Cheaper than calling `findExistingSolutions` per row
// when the question list needs a "solution exists" indicator.
export function listSolutionQuestionIds(): Set<number> {
  const dir = getSolutionsDir();
  if (!existsSync(dir)) return new Set();

  const ids = new Set<number>();
  for (const f of readdirSync(dir)) {
    const m = /^(\d+)_/.exec(f);
    if (m) ids.add(parseInt(m[1]!, 10));
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

export function readSolutionFile(
  id: number,
  titleSlug: string,
  langSlug: string
): string | null {
  const path = getSolutionPath(id, titleSlug, langSlug);
  if (!existsSync(path)) return null;
  return require("fs").readFileSync(path, "utf-8");
}
