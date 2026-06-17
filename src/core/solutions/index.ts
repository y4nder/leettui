// Barrel for the solutions module. Re-exports exactly the public surface that
// `core/solutions.ts` exposed before the split, so every existing importer
// (`from "../core/solutions"`, `from "./solutions"`, …) resolves unchanged.
//
// Lifecycle grouping (see docs/refactor):
//   paths.ts     — path math (problem/solution/notes/tests/lang locations) + cwd resolution
//   discovery.ts — fs reads: existence, listing, notes/solution file reads
//   templates.ts — per-language template overlay + var substitution
//   create.ts    — file creation + the create-flow orchestrator

export {
  type ResolvedProblemPath,
  getHarnessPath,
  getLangFilePath,
  getNotesPath,
  getProblemDir,
  getProblemDirName,
  getProblemMdPath,
  getSolutionFilename,
  getSolutionPath,
  getTestsDir,
  resolveProblemFromCwd,
  resolveProblemPath,
} from "./paths";

export {
  findExistingSolutions,
  listSolutionQuestionIds,
  readNotes,
  readProblemMd,
  readSolutionFile,
  solutionExists,
} from "./discovery";

export { type TemplateVars, overlayTemplates, renderTemplate } from "./templates";

export {
  createHarnessFile,
  createSolutionFile,
  createSolutionWithHarness,
  ensureNotesFile,
  ensureProblemDir,
  ensureProblemMd,
  seedTests,
} from "./create";

export { deleteSolution } from "./remove";
