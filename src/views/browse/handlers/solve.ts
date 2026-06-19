// Browse list actions: manual DB re-sync, yank URL, jump to a random question,
// and mid-session re-authentication. Run/submit deliberately do NOT live here —
// those act on a chosen solution and belong to the problem view; browse stays a
// navigator over the question list.

import { useAppStore } from "../../../ui/store";
import { initClient } from "../../../api/client";
import { runAuthFlow } from "../../../core/auth";
import { getQuestionsByTopic } from "../../../db/questions";
import { copyToClipboard, problemUrl } from "../../../core/clipboard";
import { syncQuestions } from "../../../core/sync";
import { errMessage, logError } from "../../../debug";
import { info, errorView } from "../resultView";
import {
  currentQuestion,
  currentTopic,
  reportError,
  withSuspendedRenderer,
  type Renderer,
} from "./shared";

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
