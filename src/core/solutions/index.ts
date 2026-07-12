// Barrel for the solutions module. Re-exports exactly the public surface that
// `core/solutions.ts` exposed before the split, so every existing importer
// (`from "@/core/core/solutions"`, `from "@/core/solutions/solutions"`, …) resolves unchanged.
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
} from "@/core/solutions/paths";

export {
  findExistingSolutions,
  listSolutionQuestionIds,
  readNotes,
  readProblemMd,
  readSolutionFile,
  solutionExists,
} from "@/core/solutions/discovery";

export { type TemplateVars, overlayTemplates, renderTemplate } from "@/core/solutions/templates";

export {
  createHarnessFile,
  createSolutionFile,
  createSolutionWithHarness,
  ensureNotesFile,
  ensureProblemDir,
  ensureProblemMd,
  seedTests,
} from "@/core/solutions/create";

export { deleteSolution } from "@/core/solutions/remove";

export { type SaveOutcome, type SaveResult, saveGoldenOutputs } from "@/core/solutions/save-output";

export { addCase, nextCaseName } from "@/core/solutions/add-case";

export {
  type CaptureOutcome,
  type CaptureResult,
  blessRunOutputs,
  captureFailingCase,
} from "@/core/solutions/capture";
