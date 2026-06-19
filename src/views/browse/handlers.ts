// Async orchestration for browse-mode actions. Pure helpers: each handler
// receives the store and renderer it needs as arguments — no React imports,
// no top-level singletons — so they remain easy to reason about and reuse.

import { mkdirSync } from "node:fs";
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
import { getQuestionBySlug, getQuestionsByTopic } from "../../db/questions";
import { getRecents, recordRecent } from "../../db/recents";
import {
  createSolutionWithHarness,
  ensureNotesFile,
  ensureProblemDir,
  ensureProblemMd,
  findExistingSolutions,
} from "../../core/solutions";
import { runSolution, submitSolution, SolutionError } from "../../core/submission";
import { copyToClipboard, problemUrl } from "../../core/clipboard";
import { syncQuestions } from "../../core/sync";
import { fetchLatestRelease } from "../../core/update";
import { relocateSolutions, type RelocateResult } from "../../core/relocate";
import {
  cloneGitHubRepo,
  commandExists,
  createGitHubRepo,
  ensureSolutionsRepo,
  ghAvailable,
  ghAuthed,
  gitPull,
  hasRemote,
  initialCommit,
  isDirEmpty,
  isGitRepo,
  manualCloneInstructions,
  manualRemoteInstructions,
} from "../../core/git";
import { setLastKnownSolutionsDir } from "../../core/session";
import {
  getEditorCommand,
  getGitUiCommand,
  getSolutionsDir,
  persistSolutionsDir,
} from "../../config";
import { resolveConfigPath } from "../../config/resolvePath";
import { errMessage, logError } from "../../debug";
import { buildResultView, info, loading, errorView, type ResultView } from "./resultView";
import { handleEnterProblemView } from "../problem/handlers";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

// The repeated catch tail: log against the "browse" scope, then surface the
// failure through the given result-view setter. One place to change the shape of
// every browse error report.
function reportError(
  setResult: (view: ResultView) => void,
  triggerKey: string,
  name: string,
  title: string,
  e: unknown,
) {
  logError(triggerKey, "browse", name, e);
  setResult(errorView(title, errMessage(e)));
}

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

// Command-palette "What's new": fetch the **latest** release's notes on demand
// and open the changelog popup. Un-gated (works on dev/from-source builds too,
// unlike the boot auto-popup). Deliberately shows the latest — the most useful
// answer when you're behind — distinct from the post-update auto-popup, which
// shows the version you just installed. A brief loading result covers the fetch;
// a failure surfaces a clean error.
export async function handleViewChangelog(): Promise<void> {
  const { showResult, showChangelog } = useAppStore.getState();
  showResult(loading("Fetching what's new…"));
  try {
    showChangelog(await fetchLatestRelease());
  } catch (e) {
    reportError(showResult, "", "handleViewChangelog", "Couldn't fetch the changelog", e);
  }
}

// `h` history modal (Stage 20): snapshot the recently-viewed questions and open
// the RecentPopup. Synchronous (getRecents is a local DB read) — no loading state.
export function handleOpenRecent() {
  useAppStore.getState().showRecent(getRecents());
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
    // Opening the detail popup is a "viewed" moment (Stage 20). The daily question
    // is keyed by slug here; record it only when it maps to a locally-synced row
    // (recents references questions.id), otherwise quietly skip.
    const dbQ = getQuestionBySlug(q.titleSlug);
    if (dbQ) recordRecent(dbQ.id);
    // Stash the resolved DB row (may be null) so the popup's Enter can open it in
    // the problem view (handleEnterPopupProblem).
    showPopup(`${q.frontendQuestionId}. ${q.title} [${q.difficulty}] — Daily`, md, dbQ);
  } catch (e) {
    reportError(
      showResult,
      triggerKey,
      "handleViewDailyChallenge",
      "Error fetching daily challenge",
      e,
    );
  }
}

// Enter from inside the daily-challenge popup: open the question in the full
// problem view (the same path as Enter on the questions list). The popup only
// stores a DB row when the daily question is locally synced; when it isn't,
// surface a clear "sync first" message instead of silently doing nothing.
export function handleEnterPopupProblem() {
  const { popupQuestion, hidePopup, showResult } = useAppStore.getState();
  hidePopup();
  if (!popupQuestion) {
    showResult(info("This problem isn't in your local DB yet — sync with * first."));
    return;
  }
  void handleEnterProblemView(popupQuestion, "popup-enter");
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
    reportError(showResult, triggerKey, "handleOpenEditor", "Error fetching editor data", e);
  }
}

// Spawn `$EDITOR {dir}` as a workspace (Stage 13): cwd is the dir itself, so an
// editor opens it as a project (VS Code) / file tree (vim netrw). Deliberately
// NOT `openInEditorPath` — that sets cwd to the file's *parent*; here cwd must be
// the problem dir itself. (cwd = problem dir is also why `leettui test` can't
// infer a langSlug from a workspace — that path stays on `e`.)
async function spawnEditorInDir(renderer: Renderer, dir: string) {
  const editor = getEditorCommand();
  await withSuspendedRenderer(renderer, async () => {
    const proc = Bun.spawn([editor, dir], {
      cwd: dir,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  });
}

// Open the whole problem folder as a workspace (Stage 13): ensure the problem
// dir, a create-if-absent `problem.md` (description fetched like the problem
// view), and `notes.md`, then spawn `$EDITOR {problemDir}` so the language
// subfolders + notes + statement are all in the editor's file tree at once.
// A premium-only problem (no description) still opens, with a placeholder
// `problem.md` — only a genuine fetch failure aborts (mirrors the other handlers).
export async function handleOpenWorkspace(triggerKey: string, renderer: Renderer) {
  const q = currentQuestion();
  if (!q) return;
  const { showResult } = useAppStore.getState();
  try {
    const content = await fetchQuestionContent(q.title_slug);
    const html = content.question?.content;
    const description = html
      ? htmlToMarkdown(html)
      : "_No description available (problem may be premium-only)._";

    const problemDir = ensureProblemDir(q.id, q.title_slug);
    ensureProblemMd(q.id, q.title_slug, description, q.title);
    ensureNotesFile(q.id, q.title_slug, q.title);

    await spawnEditorInDir(renderer, problemDir);
    useAppStore.getState().refreshSolutionFiles();
  } catch (e) {
    reportError(showResult, triggerKey, "handleOpenWorkspace", "Error opening workspace", e);
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

// --- Git version control (Stage 22) ---------------------------------------
//
// leettui delegates version control to the user's git UI (lazygit) rather than
// reimplementing porcelain. The launch reuses the $EDITOR suspend/spawn/resume
// handover (withSuspendedRenderer); scaffolding (git init + defensive .gitignore +
// first commit) goes through the single `ensureSolutionsRepo` seam in core/git.

// Launch the configured git UI in the solutions dir. cwd = the solutions root, so
// the tool is scoped to the whole tree — tool-agnostic (lazygit/gitui/tig/git all
// honor cwd; no lazygit-only flag is baked in).
async function launchGitUi(renderer: Renderer) {
  const gitUi = getGitUiCommand();
  const dir = getSolutionsDir();
  await withSuspendedRenderer(renderer, async () => {
    const proc = Bun.spawn([gitUi], {
      cwd: dir,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  });
}

// Ctrl+g / palette: open the git UI in the solutions dir. Degrades cleanly when the
// tool isn't installed; when the dir isn't a repo yet, routes to the init confirm
// (which scaffolds then launches — "proceed into the git UI", not back to browse).
export async function handleOpenGitUi(renderer: Renderer) {
  const { showResult, showGitInit, refreshSolutionFiles } = useAppStore.getState();
  const gitUi = getGitUiCommand();
  if (!commandExists(gitUi)) {
    showResult(
      info(
        `'${gitUi}' isn't installed — install it (e.g. https://github.com/jesseduffield/lazygit) or set [git] ui in your config.`,
      ),
    );
    return;
  }
  if (await isGitRepo(getSolutionsDir())) {
    await launchGitUi(renderer);
    refreshSolutionFiles();
    return;
  }
  showGitInit();
}

// The single scaffold seam: ensureSolutionsRepo (init + defensive .gitignore) then
// an initial commit. Shared by the in-app init confirm and the first-run step.
export async function scaffoldSolutionsGit() {
  const dir = getSolutionsDir();
  const ensured = await ensureSolutionsRepo(dir);
  if (!ensured.ok) return ensured;
  return initialCommit(dir, "Initial leettui solutions backup");
}

// Confirm handler for the in-app init prompt (Ctrl+g on a non-repo dir): scaffold,
// then launch the git UI. Errors surface through the standard result modal.
export async function handleConfirmGitInit(renderer: Renderer) {
  const res = await scaffoldSolutionsGit();
  const { hideGitInit, showResult, refreshSolutionFiles } = useAppStore.getState();
  hideGitInit();
  if (!res.ok) {
    showResult(errorView("Couldn't initialize git", res.output));
    return;
  }
  await launchGitUi(renderer);
  refreshSolutionFiles();
}

export type RemoteSetupResult =
  | { kind: "ok"; name: string }
  | { kind: "gh-missing"; instructions: string }
  | { kind: "not-authed" }
  | { kind: "error"; message: string };

// Execute the opt-in one-time GitHub backup: ensureSolutionsRepo → initial commit →
// `gh repo create` (private) + push. ensureSolutionsRepo guarantees the defensive
// .gitignore exists before the add/commit (the security invariant — the wizard is
// the only path that pushes). Uses gh's OWN auth, never the LeetCode session.
export async function runRemoteSetup(name: string): Promise<RemoteSetupResult> {
  const dir = getSolutionsDir();
  const ensured = await ensureSolutionsRepo(dir);
  if (!ensured.ok) return { kind: "error", message: ensured.output };
  const committed = await initialCommit(dir, "Initial leettui solutions backup");
  if (!committed.ok) return { kind: "error", message: committed.output };
  if (!ghAvailable()) return { kind: "gh-missing", instructions: manualRemoteInstructions(name) };
  if (!(await ghAuthed())) return { kind: "not-authed" };
  const created = await createGitHubRepo(dir, name, { private: true });
  if (!created.ok) return { kind: "error", message: created.output };
  return { kind: "ok", name };
}

// --- Git sync FROM a remote (Stage 24) -------------------------------------
//
// The inverse of runRemoteSetup: pull the solutions tree *down* from GitHub. One
// adaptive entry point — handleOpenGitSync probes the dir and either opens the wizard
// in clone/pull mode or short-circuits to an info message. The executors (runRemoteSync
// = clone via gh, runRemotePull = fast-forward pull) are called from the wizard's
// confirm step and return a discriminated RemoteSyncResult.

export type RemoteSyncResult =
  | { kind: "cloned"; repo: string; output: string }
  | { kind: "pulled"; output: string }
  | { kind: "gh-missing"; instructions: string }
  | { kind: "not-authed" }
  | { kind: "error"; message: string };

// Palette "Sync solutions from GitHub": inspect the solutions dir and route. A tracked
// repo with a remote → pull; an empty/absent non-repo → clone. The two dead-end states
// short-circuit to a clear info message *before* any modal opens: a repo with no remote
// (nothing to pull from), and a non-repo dir that already holds files (can't clone over
// them — also the data-safety guard for a solutions dir repointed at the data dir).
export async function handleOpenGitSync() {
  const { showGitSync, showResult } = useAppStore.getState();
  const dir = getSolutionsDir();
  if (await isGitRepo(dir)) {
    if (await hasRemote(dir)) {
      showGitSync("pull");
      return;
    }
    showResult(
      info(
        'Your solutions dir is a git repo but has no remote. Set one up first (palette → "Back up solutions to GitHub") or add a remote in lazygit (Ctrl+g).',
      ),
    );
    return;
  }
  if (!isDirEmpty(dir)) {
    showResult(
      info(
        "Your solutions dir already has files but isn't a git repo. Syncing clones into an empty dir — move or back up the existing files first, or point [paths] solutions at a fresh path.",
      ),
    );
    return;
  }
  showGitSync("clone");
}

// Clone the named GitHub repo into the (empty) solutions dir using gh's OWN auth,
// never the LeetCode session. Re-guards emptiness at execute time (never clone over
// files — state may have changed since the probe), mkdir -p's the target + parents,
// then refreshes the solution-exists markers on success.
export async function runRemoteSync(repo: string): Promise<RemoteSyncResult> {
  const dir = getSolutionsDir();
  if (!ghAvailable()) {
    return { kind: "gh-missing", instructions: manualCloneInstructions(repo, dir) };
  }
  if (!(await ghAuthed())) return { kind: "not-authed" };
  if (!isDirEmpty(dir)) {
    return {
      kind: "error",
      message: `${dir} isn't empty — refusing to clone over existing files.`,
    };
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { kind: "error", message: errMessage(e) };
  }
  const cloned = await cloneGitHubRepo(repo, dir);
  if (!cloned.ok) {
    if (cloned.reason === "tool-missing") {
      return { kind: "gh-missing", instructions: manualCloneInstructions(repo, dir) };
    }
    return { kind: "error", message: cloned.output };
  }
  useAppStore.getState().refreshSolutionFiles();
  return { kind: "cloned", repo, output: cloned.output };
}

// Fast-forward pull of the already-tracked solutions dir from its remote — plain git,
// no gh. On a diverged/non-ff history gitPull fails; the wizard's error arm adds the
// "open lazygit to merge" hint, so genuine merges still delegate to lazygit.
export async function runRemotePull(): Promise<RemoteSyncResult> {
  const dir = getSolutionsDir();
  const pulled = await gitPull(dir);
  if (!pulled.ok) return { kind: "error", message: pulled.output };
  useAppStore.getState().refreshSolutionFiles();
  return { kind: "pulled", output: pulled.output };
}
