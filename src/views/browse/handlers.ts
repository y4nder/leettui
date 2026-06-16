// Async orchestration for browse-mode actions. Pure helpers: each handler
// receives the store and renderer it needs as arguments — no React imports,
// no top-level singletons — so they remain easy to reason about and reuse.

import { dirname, resolve } from "node:path";

import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import { htmlToMarkdown } from "../../core/markdown";
import { initClient } from "../../api/client";
import { runAuthFlow } from "../../core/auth";
import { fetchQuestionContent } from "../../api/queries/question-content";
import { fetchEditorData } from "../../api/queries/editor-data";
import { fetchConsolePanelConfig } from "../../api/queries/console-panel-config";
import { fetchDailyChallenge } from "../../api/queries/daily-challenge";
import { getQuestionsByTopic } from "../../db/questions";
import { createSolutionWithHarness, findExistingSolutions } from "../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../core/submission";
import { copyToClipboard, problemUrl } from "../../core/clipboard";
import { syncQuestions } from "../../core/sync";
import { relocateSolutions, type RelocateResult } from "../../core/relocate";
import { setLastKnownSolutionsDir } from "../../core/session";
import { getEditorCommand, getSolutionsDir, persistSolutionsDir } from "../../config";
import { resolveConfigPath } from "../../config/resolvePath";
import { errMessage, logError } from "../../debug";
import { buildResultView, info, loading, errorView } from "./resultView";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

// Run `fn` on the bare terminal (editor, auth prompts, …) with the TUI paused,
// always resuming afterwards — the shared scaffold behind editor + re-auth.
async function withSuspendedRenderer<T>(renderer: Renderer, fn: () => Promise<T>): Promise<T> {
  renderer.suspend();
  try {
    return await fn();
  } finally {
    renderer.resume();
  }
}

function currentQuestion() {
  const s = useAppStore.getState();
  return s.filteredQuestions[s.selectedQuestionIndex] ?? null;
}

function currentTopic() {
  const s = useAppStore.getState();
  return s.topics[s.selectedTopicIndex] ?? "all";
}

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
    const md = htmlToMarkdown(html);
    showPopup(`${q.frontendQuestionId}. ${q.title} [${q.difficulty}] — Daily`, md);
  } catch (e) {
    logError(triggerKey, "browse", "handleViewDailyChallenge", e);
    showResult(errorView("Error fetching daily challenge", errMessage(e)));
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

    showSelect(
      "Select Language",
      snippets.map((s) => s.lang),
      async (index) => {
        hideSelect();
        if (index === null) return;

        const snippet = snippets[index]!;
        // metaData + example cases drive harness generation / tests seeding (cached fetch).
        const cfg = await fetchConsolePanelConfig(q.title_slug).catch(() => null);
        const path = createSolutionWithHarness(
          q.id,
          q.title_slug,
          snippet.langSlug,
          snippet.code,
          cfg?.question.metaData,
          cfg?.question.exampleTestcaseList,
        );

        const editor = getEditorCommand();
        await withSuspendedRenderer(renderer, async () => {
          const proc = Bun.spawn([editor, path], {
            // cwd = the language folder, so the headless CLI's cwd-inference
            // (`leettui test`) and per-language LSP work from inside the editor.
            cwd: dirname(path),
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          });
          await proc.exited;
        });
        // A newly created file should immediately show the "solution exists" mark.
        useAppStore.getState().refreshSolutionFiles();
      },
    );
  } catch (e) {
    logError(triggerKey, "browse", "handleOpenEditor", e);
    showResult(errorView("Error fetching editor data", errMessage(e)));
  }
}

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
        logError(triggerKey, "browse", `handle${action}Solution`, e);
        showResult(errorView(errTitle, errMessage(e)));
      }
    });
    return;
  }

  try {
    await fn(existing[0]!);
  } catch (e) {
    logError(triggerKey, "browse", `handle${action}Solution`, e);
    showResult(errorView(errTitle, errMessage(e)));
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
    logError(triggerKey, "browse", "handleYankUrl", e);
    showResult(errorView("Could not copy URL", errMessage(e)));
  }
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

export interface ChangeLocationOutcome {
  /** "unchanged" when the resolved target equals the current dir (nothing written). */
  status: "unchanged" | "changed";
  fromDir: string;
  toDir: string;
  result: RelocateResult;
}

export interface ChangeLocationDeps {
  getSolutionsDir: () => string;
  persistSolutionsDir: (raw: string) => void;
  relocateSolutions: (from: string, to: string) => RelocateResult;
  setLastKnownSolutionsDir: (dir: string) => void;
}

const defaultChangeLocationDeps: ChangeLocationDeps = {
  getSolutionsDir,
  persistSolutionsDir,
  relocateSolutions,
  setLastKnownSolutionsDir,
};

// Change the solutions directory from inside the TUI (Stage 10 item 4): persist
// the new `[paths].solutions`, then migrate the existing tree old→new via item
// 1's relocation engine, all in one gated step (the prompt confirms first).
//
// **Critical ordering invariant:** read the *current* dir BEFORE persisting.
// `persistSolutionsDir` resets the config memo, so a `getSolutionsDir()` call
// after it would already return the *new* dir — making `fromDir === toDir` and
// silently no-op'ing the move. `rawInput` (with `~`/`$VARS` intact) is what's
// written to TOML, but the move uses the resolved absolute pair so it matches
// exactly what boot's `getSolutionsDir()` would compute. Deps are injectable so
// this invariant is locked by a unit test without touching the real config/fs.
export function changeSolutionsDir(
  rawInput: string,
  deps: ChangeLocationDeps = defaultChangeLocationDeps,
): ChangeLocationOutcome {
  const fromDir = deps.getSolutionsDir(); // BEFORE persist — the invariant
  const toDir = resolve(resolveConfigPath(rawInput));
  if (resolve(fromDir) === toDir) {
    return { status: "unchanged", fromDir, toDir, result: { moved: 0, skipped: 0 } };
  }
  deps.persistSolutionsDir(rawInput);
  const result = deps.relocateSolutions(fromDir, toDir);
  deps.setLastKnownSolutionsDir(toDir); // keep boot detection from re-nagging
  return { status: "changed", fromDir, toDir, result };
}

export function handleRandomQuestion() {
  const s = useAppStore.getState();
  if (s.filteredQuestions.length === 0) return;
  const randomIndex = Math.floor(Math.random() * s.filteredQuestions.length);
  s.moveQuestion(randomIndex - s.selectedQuestionIndex);
}
