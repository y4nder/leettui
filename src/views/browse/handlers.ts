// Async orchestration for browse-mode actions. Pure helpers: each handler
// receives the store and renderer it needs as arguments — no React imports,
// no top-level singletons — so they remain easy to reason about and reuse.

import type { createCliRenderer } from "@opentui/core";
import { NodeHtmlMarkdown } from "node-html-markdown";

import { useAppStore } from "../../ui/store";
import { fetchQuestionContent } from "../../api/queries/question-content";
import { fetchEditorData } from "../../api/queries/editor-data";
import { fetchDailyChallenge } from "../../api/queries/daily-challenge";
import { getLangSlugFromFilename } from "../../api/types";
import { getQuestionsByTopic } from "../../db/questions";
import { createSolutionFile, findExistingSolutions } from "../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../core/submission";
import { copyToClipboard, problemUrl } from "../../core/clipboard";
import { syncQuestions } from "../../core/sync";
import { getEditorCommand, getDefaultLanguage } from "../../config";
import { logError } from "../../debug";
import { buildResultView, info, errorView } from "./resultView";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

function currentQuestion() {
  const s = useAppStore.getState();
  return s.filteredQuestions[s.selectedQuestionIndex] ?? null;
}

function currentTopic() {
  const s = useAppStore.getState();
  return s.topics[s.selectedTopicIndex] ?? "all";
}

const nhm = new NodeHtmlMarkdown();

export async function handleViewDailyChallenge(triggerKey: string) {
  const { showPopup, showResult } = useAppStore.getState();
  try {
    const daily = await fetchDailyChallenge();
    const q = daily.activeDailyCodingChallengeQuestion.question;
    const content = await fetchQuestionContent(q.titleSlug);
    const html = content.question?.content;
    if (!html) {
      showResult(info("No description available (problem may be premium-only)."));
      return;
    }
    const md = nhm.translate(html);
    showPopup(`${q.frontendQuestionId}. ${q.title} [${q.difficulty}] — Daily`, md);
  } catch (e: any) {
    logError(triggerKey, "browse", "handleViewDailyChallenge", e);
    showResult(errorView("Error fetching daily challenge", e.message));
  }
}

export async function handleOpenEditor(triggerKey: string, renderer: Renderer) {
  const q = currentQuestion();
  if (!q) return;
  const { showSelect, hideSelect, showResult } = useAppStore.getState();

  try {
    const editorData = await fetchEditorData(q.title_slug);
    const snippets = editorData.question.codeSnippets;
    if (!snippets || snippets.length === 0) {
      showResult(info("No code snippets available for this problem."));
      return;
    }

    showSelect("Select Language", snippets.map((s) => s.lang), async (index) => {
      hideSelect();
      if (index === null) return;

      const snippet = snippets[index]!;
      const path = createSolutionFile(q.id, q.title_slug, snippet.langSlug, snippet.code);

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
      // A newly created file should immediately show the "solution exists" mark.
      useAppStore.getState().refreshSolutionFiles();
    });
  } catch (e: any) {
    logError(triggerKey, "browse", "handleOpenEditor", e);
    showResult(errorView("Error fetching editor data", e.message));
  }
}

async function withChosenSolution(
  triggerKey: string,
  action: "run" | "submit",
  fn: (filename: string) => Promise<void>
) {
  const q = currentQuestion();
  if (!q) return;
  const { showSelect, hideSelect, showResult } = useAppStore.getState();

  const existing = findExistingSolutions(q.id, q.title_slug);
  if (existing.length === 0) {
    showResult(info("No solution file found. Press 'e' to create one."));
    return;
  }

  const errTitle = action === "run" ? "Run error" : "Submit error";

  if (existing.length > 1) {
    const title = action === "run" ? "Select Solution to Run" : "Select Solution to Submit";
    showSelect(title, existing, async (index) => {
      hideSelect();
      if (index === null) return;
      try {
        await fn(existing[index]!);
      } catch (e: any) {
        logError(triggerKey, "browse", `handle${action}Solution`, e);
        showResult(errorView(errTitle, e.message));
      }
    });
    return;
  }

  try {
    await fn(existing[0]!);
  } catch (e: any) {
    logError(triggerKey, "browse", `handle${action}Solution`, e);
    showResult(errorView(errTitle, e.message));
  }
}

export async function handleRunSolution(triggerKey: string) {
  const q = currentQuestion();
  if (!q) return;

  await withChosenSolution(triggerKey, "run", async (filename) => {
    const { showResult, refreshQuestions } = useAppStore.getState();
    const langSlug = getLangSlugFromFilename(filename) ?? getDefaultLanguage();
    showResult(info("Running solution..."));
    try {
      const result = await runSolution(q, langSlug);
      showResult(buildResultView(result));
    } catch (e) {
      if (e instanceof SolutionError) {
        showResult(errorView(e.message));
        return;
      }
      throw e;
    }
    refreshQuestions(getQuestionsByTopic(currentTopic()));
  });
}

export async function handleSubmitSolution(triggerKey: string) {
  const q = currentQuestion();
  if (!q) return;

  await withChosenSolution(triggerKey, "submit", async (filename) => {
    const { showResult, refreshQuestions } = useAppStore.getState();
    const langSlug = getLangSlugFromFilename(filename) ?? getDefaultLanguage();
    showResult(info("Submitting solution..."));
    try {
      const result = await submitSolution(q, langSlug);
      showResult(buildResultView(result));
    } catch (e) {
      if (e instanceof SolutionError) {
        showResult(errorView(e.message));
        return;
      }
      throw e;
    }
    refreshQuestions(getQuestionsByTopic(currentTopic()));
  });
}

export async function handleSyncDb(triggerKey: string) {
  const { setSyncProgress, clearSyncProgress, refreshQuestions, init, showResult } =
    useAppStore.getState();
  setSyncProgress(0, 0);
  try {
    await syncQuestions((current, total) => {
      setSyncProgress(current, total);
    });
    clearSyncProgress();
    refreshQuestions(getQuestionsByTopic(currentTopic()));
    init();
  } catch (e: any) {
    logError(triggerKey, "browse", "handleSyncDb", e);
    clearSyncProgress();
    showResult(errorView("Sync error", e.message));
  }
}

export function handleYankUrl(triggerKey: string) {
  const q = currentQuestion();
  if (!q) return;
  const { showResult } = useAppStore.getState();
  try {
    const url = problemUrl(q.title_slug);
    copyToClipboard(url);
    showResult(info(`Copied URL: ${url}`));
  } catch (e: any) {
    logError(triggerKey, "browse", "handleYankUrl", e);
    showResult(errorView("Could not copy URL", e.message));
  }
}

export function handleRandomQuestion() {
  const s = useAppStore.getState();
  if (s.filteredQuestions.length === 0) return;
  const randomIndex = Math.floor(Math.random() * s.filteredQuestions.length);
  s.moveQuestion(randomIndex - s.selectedQuestionIndex);
}
