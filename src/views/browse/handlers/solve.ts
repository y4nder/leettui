// Browse list actions against the selected question: run / submit (with a
// language picker when several solutions exist), manual DB re-sync, yank URL,
// jump to a random question, and mid-session re-authentication.

import { useAppStore } from "../../../ui/store";
import { initClient } from "../../../api/client";
import { runAuthFlow } from "../../../core/auth";
import { getQuestionsByTopic } from "../../../db/questions";
import { findExistingSolutions } from "../../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../../core/submission";
import { copyToClipboard, problemUrl } from "../../../core/clipboard";
import { syncQuestions } from "../../../core/sync";
import { errMessage, logError } from "../../../debug";
import { buildResultView, info, loading, errorView } from "../resultView";
import {
  currentQuestion,
  currentTopic,
  reportError,
  withSuspendedRenderer,
  type Renderer,
} from "./shared";

async function withChosenSolution(
  triggerKey: string,
  action: "run" | "submit",
  fn: (langSlug: string) => Promise<void>,
) {
  const q = currentQuestion();
  if (!q) return;
  const { showSelect, hideSelect, showResult } = useAppStore.getState();

  // langSlugs of every solution that exists on disk for this problem.
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
      } catch (e) {
        reportError(showResult, triggerKey, `handle${action}Solution`, errTitle, e);
      }
    });
    return;
  }

  try {
    await fn(existing[0]!);
  } catch (e) {
    reportError(showResult, triggerKey, `handle${action}Solution`, errTitle, e);
  }
}

export async function handleRunSolution(triggerKey: string) {
  const q = currentQuestion();
  if (!q) return;

  await withChosenSolution(triggerKey, "run", async (langSlug) => {
    const { showResult, refreshQuestions } = useAppStore.getState();
    showResult(loading("Running solution..."));
    try {
      const result = await runSolution(q, langSlug);
      showResult(buildResultView(result));
    } catch (e) {
      if (e instanceof SolutionError) {
        showResult(errorView(errMessage(e)));
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

  await withChosenSolution(triggerKey, "submit", async (langSlug) => {
    const { showResult, refreshQuestions } = useAppStore.getState();
    showResult(loading("Submitting solution..."));
    try {
      const result = await submitSolution(q, langSlug);
      showResult(buildResultView(result));
    } catch (e) {
      if (e instanceof SolutionError) {
        showResult(errorView(errMessage(e)));
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
  } catch (e) {
    logError(triggerKey, "browse", "handleSyncDb", e);
    clearSyncProgress();
    showResult(errorView("Sync error", errMessage(e)));
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
  } catch (e) {
    reportError(showResult, triggerKey, "handleYankUrl", "Could not copy URL", e);
  }
}

export function handleRandomQuestion() {
  const s = useAppStore.getState();
  if (s.filteredQuestions.length === 0) return;
  const randomIndex = Math.floor(Math.random() * s.filteredQuestions.length);
  s.moveQuestion(randomIndex - s.selectedQuestionIndex);
}

// Re-authenticate without leaving the app. Suspends the renderer (so the auth
// flow can use the terminal for prompts/stdin), runs the flow, then re-inits the
// API client with fresh tokens — mirroring the $EDITOR suspend/resume in
// handleOpenEditor. Recovers from a mid-session session expiry.
export async function handleReauth(renderer: Renderer) {
  const { showResult } = useAppStore.getState();
  let result: Awaited<ReturnType<typeof runAuthFlow>> = null;
  try {
    result = await withSuspendedRenderer(renderer, runAuthFlow);
  } catch (e) {
    logError("reauth", "browse", "handleReauth", e);
  }

  if (result) {
    initClient(result.csrftoken, result.lc_session);
    showResult(info(`Re-authenticated as ${result.username || "(unknown user)"}.`));
  } else {
    showResult(info("Re-authentication cancelled."));
  }
}
