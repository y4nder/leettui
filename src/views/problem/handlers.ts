// Async orchestration for the dedicated problem view. Mirrors the browse
// handlers but routes results to the in-view inline result panel instead of
// the modal popup.

import type { createCliRenderer } from "@opentui/core";
import { NodeHtmlMarkdown } from "node-html-markdown";

import { useAppStore } from "../../ui/store";
import { fetchQuestionContent } from "../../api/queries/question-content";
import { fetchEditorData } from "../../api/queries/editor-data";
import { getLangSlugFromFilename } from "../../api/types";
import { getQuestionsByTopic } from "../../db/questions";
import {
  createSolutionFile,
  findExistingSolutions,
  getSolutionFilename,
  getSolutionPath,
} from "../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../core/submission";
import { getEditorCommand, getDefaultLanguage } from "../../config";
import { logError } from "../../debug";
import { buildResultView, info, errorView } from "../browse/resultView";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

const nhm = new NodeHtmlMarkdown();

function currentTopic() {
  const s = useAppStore.getState();
  return s.topics[s.selectedTopicIndex] ?? "all";
}

function focusedSolutionFilename(): string | null {
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
      ? nhm.translate(html)
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

function refreshProblemSolutions(focusFilename?: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const solutions = findExistingSolutions(p.question.id, p.question.title_slug);
  useAppStore.getState().setProblemSolutions(solutions, focusFilename);
}

export async function handleProblemOpenEditor(triggerKey: string, renderer: Renderer) {
  const p = useAppStore.getState().problem;
  if (!p) return;

  // If a file is already focused, just open it.
  const focused = focusedSolutionFilename();
  if (focused) {
    await openInEditor(renderer, focused);
    refreshProblemSolutions(focused);
    return;
  }

  // Otherwise, fetch snippets and open the inline language picker.
  try {
    const editorData = await fetchEditorData(p.question.title_slug);
    const snippets = editorData.question.codeSnippets;
    if (!snippets || snippets.length === 0) {
      useAppStore.getState().setProblemResult(info("No code snippets available for this problem."));
      return;
    }
    useAppStore.getState().openLangPicker(snippets);
  } catch (e: any) {
    logError(triggerKey, "problem", "handleProblemOpenEditor", e);
    useAppStore.getState().setProblemResult(errorView("Error fetching editor data", e.message));
  }
}

export async function handleProblemLangConfirm(_triggerKey: string, renderer: Renderer) {
  const p = useAppStore.getState().problem;
  if (!p || !p.langPicker) return;
  const snippet = p.langPicker.snippets[p.langPicker.index];
  if (!snippet) return;

  const path = createSolutionFile(
    p.question.id,
    p.question.title_slug,
    snippet.langSlug,
    snippet.code
  );
  const filename = getSolutionFilename(p.question.id, p.question.title_slug, snippet.langSlug);

  useAppStore.getState().closeLangPicker();
  await openInEditorPath(renderer, path);
  refreshProblemSolutions(filename);
}

export function handleProblemLangCancel() {
  useAppStore.getState().closeLangPicker();
}

async function openInEditor(renderer: Renderer, filename: string) {
  const p = useAppStore.getState().problem;
  if (!p) return;
  const langSlug = getLangSlugFromFilename(filename) ?? getDefaultLanguage();
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
  const filename = focusedSolutionFilename();
  if (!filename) {
    useAppStore.getState().setProblemResult(info("No solution file found. Press 'e' to create one."));
    return;
  }
  const langSlug = getLangSlugFromFilename(filename) ?? getDefaultLanguage();
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
  const filename = focusedSolutionFilename();
  if (!filename) {
    useAppStore.getState().setProblemResult(info("No solution file found. Press 'e' to create one."));
    return;
  }
  const langSlug = getLangSlugFromFilename(filename) ?? getDefaultLanguage();
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
