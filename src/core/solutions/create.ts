import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getLanguageTemplateDir } from "../../config";
import { generateHarness } from "../harness";
import { parseMetaData } from "../harness/meta";
import {
  getHarnessPath,
  getNotesPath,
  getProblemDir,
  getProblemMdPath,
  getSolutionFilename,
  getSolutionPath,
  getTestsDir,
} from "./paths";
import { overlayTemplates, type TemplateVars } from "./templates";

// Ensures the shared `notes.md` exists (creating the problem dir + a minimal
// title header if absent) and returns its path, ready to open in $EDITOR. The
// header is only written on first creation; existing notes are never touched.
export function ensureNotesFile(id: number, titleSlug: string, title?: string): string {
  const path = getNotesPath(id, titleSlug);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    const heading = title ? `# ${id}. ${title}` : `# ${id}`;
    Bun.write(path, `${heading}\n\n`);
  }
  return path;
}

// Ensures the problem-folder level exists, so a workspace (Stage 13) can be
// opened in $EDITOR before any solution language has been started. Returns the
// problem dir path.
export function ensureProblemDir(id: number, titleSlug: string): string {
  const dir = getProblemDir(id, titleSlug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Ensures the shared `problem.md` exists (the offline problem statement),
// creating the problem dir + a `# {id}. {title}` heading above the description
// if absent. **Create-if-absent** — an existing `problem.md` (e.g. one the user
// has edited) is never touched. Mirrors `ensureNotesFile`; creating it must not
// flip the "has solution" marker (it's a problem-level file, not a lang subdir).
// Returns its path, ready to open in $EDITOR.
export function ensureProblemMd(
  id: number,
  titleSlug: string,
  descriptionMarkdown: string,
  title?: string,
): string {
  const path = getProblemMdPath(id, titleSlug);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    const heading = title ? `# ${id}. ${title}` : `# ${id}`;
    Bun.write(path, `${heading}\n\n${descriptionMarkdown}\n`);
  }
  return path;
}

export function createSolutionFile(
  id: number,
  titleSlug: string,
  langSlug: string,
  code: string,
): string {
  const path = getSolutionPath(id, titleSlug, langSlug);
  if (!existsSync(path)) {
    Bun.write(path, code);
  }
  return path;
}

// Writes a generated harness only if it doesn't already exist, so a user's
// edits to a previously generated harness are never clobbered.
export function createHarnessFile(
  id: number,
  titleSlug: string,
  langSlug: string,
  filename: string,
  content: string,
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
export function seedTests(id: number, titleSlug: string, exampleTestcases: string[]): void {
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

// Create-flow orchestrator. Order matters: per-language template overrides are
// overlaid FIRST (the real safety net, since the default writers below are all
// create-if-absent), then the bundled defaults fill any gap the templates left:
//   - solution file: the LeetCode snippet, unless a `solution.{ext}` template
//     already supplied one;
//   - harness: the generated `main.{ext}` (python3/javascript/typescript),
//     unless a same-named template already supplied one;
//   - manifests / extra files (e.g. `Cargo.toml`, helper modules): land purely
//     additively via the overlay, with no default to suppress.
// Finally seeds the shared `tests/` dir. `metaDataRaw`/`exampleTestcases` are
// optional so callers that lack them still create a plain solution file.
// Returns the solution file path (what the editor opens).
export function createSolutionWithHarness(
  id: number,
  titleSlug: string,
  langSlug: string,
  code: string,
  metaDataRaw?: string,
  exampleTestcases?: string[],
): string {
  const solutionPath = getSolutionPath(id, titleSlug, langSlug);

  const vars: TemplateVars = {
    functionName: functionNameFromMeta(metaDataRaw),
    titleSlug,
  };
  const applied = overlayTemplates(getLanguageTemplateDir(langSlug), dirname(solutionPath), vars);

  if (!applied.has(getSolutionFilename(langSlug))) {
    createSolutionFile(id, titleSlug, langSlug, code);
  }

  const harness = generateHarness(langSlug, metaDataRaw);
  if (harness && !applied.has(harness.filename)) {
    createHarnessFile(id, titleSlug, langSlug, harness.filename, harness.content);
  }

  if (exampleTestcases) {
    seedTests(id, titleSlug, exampleTestcases);
  }

  return solutionPath;
}

// Best-effort function name for template substitution. Never throws — a missing
// or malformed metaData just leaves `{{functionName}}` rendering to empty.
function functionNameFromMeta(metaDataRaw?: string | null): string | undefined {
  if (!metaDataRaw) return undefined;
  try {
    return parseMetaData(metaDataRaw).name;
  } catch {
    return undefined;
  }
}
