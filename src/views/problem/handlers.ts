// Async orchestration for the dedicated problem view. Mirrors the browse
// handlers but routes results to the in-view inline result panel instead of
// the modal popup.

import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import { htmlToMarkdown } from "../../core/markdown";
import { fetchQuestionContent } from "../../api/queries/question-content";
import { fetchEditorData } from "../../api/queries/editor-data";
import { getQuestionsByTopic } from "../../db/questions";
import {
  createSolutionFile,
  findExistingSolutions,
  getSolutionPath,
} from "../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../core/submission";
import { getEditorCommand } from "../../config";
import { logError } from "../../debug";
import { buildResultView, info, errorView } from "../browse/resultView";

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

export async function handleEnterProblemView(triggerKey: string) {
  const s = useAppStore.getState();
  const q = s.filteredQuestions[s.selectedQuestionIndex];
  if (!q) return;
  try {
    const data = await fetchQuestionContent(q.title_slug);
    const html = data.question?.content;
    const description = html
      ? htmlToMarkdown(html)
      : "_No description available (problem may be premium-only)._";
    const solutions = findExistingSolutions(q.id, q.title_slug);
    useAppStore.getState().enterProblemView({ question: q, description, solutions });
  } catch (e: any) {
    logError(triggerKey, "browse", "handleEnterProblemView", e);
    useAppStore.getState().showResult(errorView("Error fetching question", e.message));
  }
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
  const p = useAppStore.getState().problem;
  if (!p) return;

  const focused = focusedLangSlug();
  if (!focused) {
    useAppStore
      .getState()
      .setProblemResult(info("No solution selected. Press 'f' to pick a language."));
    return;
  }
  await openInEditor(renderer, focused);
  refreshProblemSolutions(focused);
}

export async function handleOpenSolutionPicker(triggerKey: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  try {
    const editorData = await fetchEditorData(p.question.title_slug);
    const snippets = editorData.question.codeSnippets;
    if (!snippets || snippets.length === 0) {
      useAppStore
        .getState()
        .setProblemResult(info("No code snippets available for this problem."));
      return;
    }
    const existing = new Set(findExistingSolutions(p.question.id, p.question.title_slug));

    // Sort: existing languages first, then the rest.
    const sorted = [
      ...snippets.filter((s) => existing.has(s.langSlug)),
      ...snippets.filter((s) => !existing.has(s.langSlug)),
    ];

    const initialLangSlug = focusedLangSlug();

    useAppStore
      .getState()
      .openSolutionPicker(sorted, existing, initialLangSlug ?? undefined);
  } catch (e: any) {
    logError(triggerKey, "problem", "handleOpenSolutionPicker", e);
    useAppStore
      .getState()
      .setProblemResult(errorView("Error fetching editor data", e.message));
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

  const path = picker.existing.has(snippet.langSlug)
    ? getSolutionPath(p.question.id, p.question.title_slug, snippet.langSlug)
    : createSolutionFile(
        p.question.id,
        p.question.title_slug,
        snippet.langSlug,
        snippet.code
      );

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
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  } finally {
    renderer.resume();
  }
}

export async function handleProblemRun(triggerKey: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const langSlug = focusedLangSlug();
  if (!langSlug) {
    useAppStore
      .getState()
      .setProblemResult(info("No solution selected. Press 'f' to pick a language."));
    return;
  }
  useAppStore.getState().setProblemResult(info("Running solution..."));
  try {
    const result = await runSolution(p.question, langSlug);
    useAppStore.getState().setProblemResult(buildResultView(result));
  } catch (e: any) {
    if (e instanceof SolutionError) {
      useAppStore.getState().setProblemResult(errorView(e.message));
      return;
    }
    logError(triggerKey, "problem", "handleProblemRun", e);
    useAppStore.getState().setProblemResult(errorView("Run error", e.message));
  }
}

export async function handleProblemSubmit(triggerKey: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const langSlug = focusedLangSlug();
  if (!langSlug) {
    useAppStore
      .getState()
      .setProblemResult(info("No solution selected. Press 'f' to pick a language."));
    return;
  }
  useAppStore.getState().setProblemResult(info("Submitting solution..."));
  try {
    const result = await submitSolution(p.question, langSlug);
    useAppStore.getState().setProblemResult(buildResultView(result));
  } catch (e: any) {
    if (e instanceof SolutionError) {
      useAppStore.getState().setProblemResult(errorView(e.message));
      return;
    }
    logError(triggerKey, "problem", "handleProblemSubmit", e);
    useAppStore.getState().setProblemResult(errorView("Submit error", e.message));
  }
}
