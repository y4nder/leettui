// --- Git version control (Stage 22–24) ------------------------------------
//
// leettui delegates version control to the user's git UI (lazygit) rather than
// reimplementing porcelain. The launch reuses the $EDITOR suspend/spawn/resume
// handover (withSuspendedRenderer); scaffolding (git init + defensive .gitignore +
// first commit) goes through the single `ensureSolutionsRepo` seam in core/git.

import { mkdirSync } from "node:fs";

import { useAppStore } from "../../../ui/store";
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
} from "../../../core/git";
import { getGitUiCommand, getSolutionsDir } from "../../../config";
import { errMessage } from "../../../debug";
import { errorView, info } from "../resultView";
import { withSuspendedRenderer, type Renderer } from "./shared";

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
