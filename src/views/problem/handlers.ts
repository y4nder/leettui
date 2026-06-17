// Async orchestration for the dedicated problem view. Mirrors the browse
// handlers but routes results to the in-view inline result panel instead of
// the modal popup.

import { dirname } from "node:path";

import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import type { RelatedQuestion } from "../../ui/store";
import { htmlToMarkdown } from "../../core/markdown";
import { fetchQuestionContent } from "../../api/queries/question-content";
import { fetchSimilarQuestions } from "../../api/queries/similar-questions";
import { fetchEditorData } from "../../api/queries/editor-data";
import { fetchConsolePanelConfig } from "../../api/queries/console-panel-config";
import {
  getQuestionsByTopic,
  getQuestionBySlug,
  getTopicsForQuestion,
  type DbQuestion,
} from "../../db/questions";
import {
  createSolutionWithHarness,
  findExistingSolutions,
  getSolutionPath,
  ensureNotesFile,
  ensureProblemDir,
  ensureProblemMd,
  readNotes,
} from "../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../core/submission";
import { runLocalTests } from "../../core/testRunner";
import { getEditorCommand } from "../../config";
import { errMessage, logError } from "../../debug";
import {
  buildResultView,
  buildLocalRunView,
  info,
  loading,
  errorView,
  type ResultView,
} from "../browse/resultView";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

function currentTopic() {
  const s = useAppStore.getState();
  return s.topics[s.selectedTopicIndex] ?? "all";
}

// The focused solution's langSlug (its identity), or null if none exist.
function focusedLangSlug(): string | null {
  const p = useAppStore.getState().problem;
  if (!p || p.solutions.length === 0) return null;
  return p.solutions[p.focusedSolutionIndex] ?? null;
}

// The repeated catch tail: log against the "problem" scope, then surface the
// failure through the given result-view setter (`setProblemResult` for in-view
// results, `showResult` for the modal popup). One place to change the shape.
function reportError(
  setResult: (view: ResultView) => void,
  triggerKey: string,
  name: string,
  title: string,
  e: unknown,
) {
  logError(triggerKey, "problem", name, e);
  setResult(errorView(title, errMessage(e)));
}

// Shared scaffold for the focused-solution actions (run / submit / test-local /
// editor): bail if there's no problem, surface the same "pick a language" info
// when no solution is focused, then run `fn(langSlug)`. The async path is wrapped
// in the loading→try/catch that those handlers each used to repeat verbatim;
// `loadingMessage` opts a handler into it (run/submit/test-local), while the
// editor path passes none and just runs `fn`. `solutionErrorArm` keeps run/submit's
// behavior of short-circuiting on a `SolutionError` (no logError) without giving
// test-local that arm — byte-identical to the originals.
async function withFocusedSolution(
  triggerKey: string,
  name: string,
  fn: (
    problem: NonNullable<ReturnType<typeof useAppStore.getState>["problem"]>,
    langSlug: string,
  ) => Promise<void>,
  opts?: { loadingMessage: string; errorTitle: string; solutionErrorArm: boolean },
) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const langSlug = focusedLangSlug();
  if (!langSlug) {
    useAppStore
      .getState()
      .setProblemResult(info("No solution selected. Press 'f' to pick a language."));
    return;
  }
  if (!opts) {
    await fn(p, langSlug);
    return;
  }
  useAppStore.getState().setProblemResult(loading(opts.loadingMessage));
  try {
    await fn(p, langSlug);
  } catch (e) {
    if (opts.solutionErrorArm && e instanceof SolutionError) {
      useAppStore.getState().setProblemResult(errorView(errMessage(e)));
      return;
    }
    reportError(useAppStore.getState().setProblemResult, triggerKey, name, opts.errorTitle, e);
  }
}

// Navigate-replace worker shared by the browse-cursor entry and the Related panel's
// Enter (Stage 12 item 4). Fetches description + similar questions in parallel; a
// failed similar fetch never blocks entry (Related just renders empty). Each similar
// question is resolved against the local DB (getQuestionBySlug) so the panel knows
// which are navigable — premium ones stay listed (locked) but un-openable.
export async function handleEnterProblemView(question: DbQuestion, triggerKey = "enter") {
  try {
    const [contentData, similarData] = await Promise.all([
      fetchQuestionContent(question.title_slug),
      fetchSimilarQuestions(question.title_slug).catch(() => null),
    ]);
    const html = contentData.question?.content;
    const description = html
      ? htmlToMarkdown(html)
      : "_No description available (problem may be premium-only)._";
    const solutions = findExistingSolutions(question.id, question.title_slug);
    const topicTags = getTopicsForQuestion(question.id);
    const related: RelatedQuestion[] = (similarData?.question?.similarQuestionList ?? []).map(
      (sq) => ({
        title: sq.title,
        titleSlug: sq.titleSlug,
        difficulty: sq.difficulty,
        paidOnly: sq.isPaidOnly,
        dbQuestion: sq.isPaidOnly ? null : getQuestionBySlug(sq.titleSlug),
      }),
    );
    useAppStore
      .getState()
      .enterProblemView({ question, description, solutions, topicTags, related });
  } catch (e) {
    reportError(
      useAppStore.getState().showResult,
      triggerKey,
      "handleEnterProblemView",
      "Error fetching question",
      e,
    );
  }
}

// Browse-cursor entry (the keymap's Enter on a question): open the currently-selected
// question via the worker above.
export async function handleEnterProblemFromCursor(triggerKey: string) {
  const s = useAppStore.getState();
  const q = s.filteredQuestions[s.selectedQuestionIndex];
  if (!q) return;
  await handleEnterProblemView(q, triggerKey);
}

// Related panel Enter: navigate-replace to the focused related question when it's
// navigable, else surface why (premium / not synced locally) in the Result panel.
export function handleEnterRelated(triggerKey: string) {
  const p = useAppStore.getState().problem;
  if (!p || p.related.length === 0) return;
  const item = p.related[p.focusedRelatedIndex];
  if (!item) return;
  if (item.paidOnly) {
    useAppStore.getState().setProblemResult(info(`"${item.title}" is premium-only.`));
    return;
  }
  if (!item.dbQuestion) {
    useAppStore
      .getState()
      .setProblemResult(info(`"${item.title}" isn't in your local DB — sync (*) from browse.`));
    return;
  }
  void handleEnterProblemView(item.dbQuestion, triggerKey);
}

export function handleExitProblemView() {
  const { refreshQuestions, exitProblemView } = useAppStore.getState();
  refreshQuestions(getQuestionsByTopic(currentTopic()));
  exitProblemView();
}

function refreshProblemSolutions(focusLangSlug?: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const solutions = findExistingSolutions(p.question.id, p.question.title_slug);
  useAppStore.getState().setProblemSolutions(solutions, focusLangSlug);
}

export async function handleProblemOpenEditor(triggerKey: string, renderer: Renderer) {
  await withFocusedSolution(triggerKey, "handleProblemOpenEditor", async (_p, langSlug) => {
    await openInEditor(renderer, langSlug);
    refreshProblemSolutions(langSlug);
  });
}

export async function handleOpenSolutionPicker(triggerKey: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  try {
    const editorData = await fetchEditorData(p.question.title_slug);
    const snippets = editorData.question.codeSnippets;
    if (!snippets || snippets.length === 0) {
      useAppStore.getState().setProblemResult(info("No code snippets available for this problem."));
      return;
    }
    const existing = new Set(findExistingSolutions(p.question.id, p.question.title_slug));

    // Sort: existing languages first, then the rest.
    const sorted = [
      ...snippets.filter((s) => existing.has(s.langSlug)),
      ...snippets.filter((s) => !existing.has(s.langSlug)),
    ];

    const initialLangSlug = focusedLangSlug();

    useAppStore.getState().openSolutionPicker(sorted, existing, initialLangSlug ?? undefined);
  } catch (e) {
    reportError(
      useAppStore.getState().setProblemResult,
      triggerKey,
      "handleOpenSolutionPicker",
      "Error fetching editor data",
      e,
    );
  }
}

export function handlePickerMove(delta: number) {
  useAppStore.getState().movePicker(delta);
}

export function handlePickerCancel() {
  useAppStore.getState().closeSolutionPicker();
}

// Enter: for existing files, just set as active and close the picker. For
// uncreated languages, there's no useful "select" without authoring the file,
// so we create it and open the editor (same as `o`).
export async function handlePickerConfirm(triggerKey: string, renderer: Renderer) {
  const p = useAppStore.getState().problem;
  const picker = p?.solutionPicker;
  if (!p || !picker) return;

  const snippet = picker.snippets[picker.index];
  if (!snippet) return;

  if (picker.existing.has(snippet.langSlug)) {
    useAppStore.getState().closeSolutionPicker();
    refreshProblemSolutions(snippet.langSlug);
    return;
  }
  await handlePickerOpenEditor(triggerKey, renderer);
}

// `o`: always select + open in editor. Creates the file from the snippet if
// it doesn't exist yet.
export async function handlePickerOpenEditor(_triggerKey: string, renderer: Renderer) {
  const p = useAppStore.getState().problem;
  const picker = p?.solutionPicker;
  if (!p || !picker) return;

  const snippet = picker.snippets[picker.index];
  if (!snippet) return;

  let path: string;
  if (picker.existing.has(snippet.langSlug)) {
    path = getSolutionPath(p.question.id, p.question.title_slug, snippet.langSlug);
  } else {
    // metaData + example cases drive harness generation / tests seeding (cached fetch).
    const cfg = await fetchConsolePanelConfig(p.question.title_slug).catch(() => null);
    path = createSolutionWithHarness(
      p.question.id,
      p.question.title_slug,
      snippet.langSlug,
      snippet.code,
      cfg?.question.metaData,
      cfg?.question.exampleTestcaseList,
    );
  }

  useAppStore.getState().closeSolutionPicker();
  await openInEditorPath(renderer, path);
  refreshProblemSolutions(snippet.langSlug);
}

async function openInEditor(renderer: Renderer, langSlug: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const path = getSolutionPath(p.question.id, p.question.title_slug, langSlug);
  await openInEditorPath(renderer, path);
}

async function openInEditorPath(renderer: Renderer, path: string) {
  const editor = getEditorCommand();
  renderer.suspend();
  try {
    const proc = Bun.spawn([editor, path], {
      // cwd = the file's folder (lang folder for solutions, problem folder for
      // notes), so the headless CLI's cwd-inference and per-language LSP work
      // from inside the editor.
      cwd: dirname(path),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  } finally {
    renderer.resume();
  }
}

// Open the whole problem folder as a workspace (Stage 13). Reuses the already-
// loaded `p.description` (no fetch) — unlike the browse worker which must fetch.
// Spawns `$EDITOR {problemDir}` with cwd = the problem dir itself (a true
// workspace, NOT a single file), so notes + statement + every language subfolder
// are in the editor's file tree at once.
export async function handleOpenProblemWorkspace(triggerKey: string, renderer: Renderer) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  try {
    const problemDir = ensureProblemDir(p.question.id, p.question.title_slug);
    ensureProblemMd(p.question.id, p.question.title_slug, p.description, p.question.title);
    ensureNotesFile(p.question.id, p.question.title_slug, p.question.title);

    const editor = getEditorCommand();
    renderer.suspend();
    try {
      const proc = Bun.spawn([editor, problemDir], {
        cwd: problemDir,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    } finally {
      renderer.resume();
    }
    refreshProblemSolutions();
  } catch (e) {
    reportError(
      useAppStore.getState().setProblemResult,
      triggerKey,
      "handleOpenProblemWorkspace",
      "Error opening workspace",
      e,
    );
  }
}

export async function handleProblemRun(triggerKey: string) {
  await withFocusedSolution(
    triggerKey,
    "handleProblemRun",
    async (p, langSlug) => {
      const result = await runSolution(p.question, langSlug);
      useAppStore.getState().setProblemResult(buildResultView(result));
    },
    { loadingMessage: "Running solution...", errorTitle: "Run error", solutionErrorArm: true },
  );
}

export async function handleProblemTestLocal(triggerKey: string) {
  await withFocusedSolution(
    triggerKey,
    "handleProblemTestLocal",
    async (p, langSlug) => {
      const report = await runLocalTests(p.question, langSlug);
      useAppStore.getState().setProblemResult(buildLocalRunView(report));
    },
    {
      loadingMessage: "Running local tests...",
      errorTitle: "Local run error",
      solutionErrorArm: false,
    },
  );
}

export async function handleProblemSubmit(triggerKey: string) {
  await withFocusedSolution(
    triggerKey,
    "handleProblemSubmit",
    async (p, langSlug) => {
      const result = await submitSolution(p.question, langSlug);
      useAppStore.getState().setProblemResult(buildResultView(result));
    },
    {
      loadingMessage: "Submitting solution...",
      errorTitle: "Submit error",
      solutionErrorArm: true,
    },
  );
}

// Notes are shared + language-agnostic, so — unlike e/R/s/t — these never gate
// on a focused solution: a problem with zero solutions can still have notes.

export function handleOpenNotes() {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const content = readNotes(p.question.id, p.question.title_slug) ?? "";
  useAppStore.getState().openNotes(content);
}

export async function handleEditNotes(_triggerKey: string, renderer: Renderer) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const path = ensureNotesFile(p.question.id, p.question.title_slug, p.question.title);
  await openInEditorPath(renderer, path);
  // Re-read so an open notes popup reflects the edit.
  if (useAppStore.getState().problem?.notes) {
    const content = readNotes(p.question.id, p.question.title_slug) ?? "";
    useAppStore.getState().setNotesContent(content);
  }
}

export function handleCloseNotes() {
  useAppStore.getState().closeNotes();
}
