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
