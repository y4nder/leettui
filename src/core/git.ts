// Git scaffolding + delegation seam (Stage 22). leettui delegates version control
// to the user's git UI (lazygit) rather than reimplementing porcelain; this module
// is the thin, never-throws layer that (a) scaffolds the solutions dir into a git
// repo with a defensive root `.gitignore`, and (b) drives the opt-in one-time
// GitHub remote bootstrap via `gh`. Everything shells out via `Bun.spawn`
// (capturing stdout/stderr like `core/testRunner`); a missing binary surfaces as a
// `tool-missing` result, never a throw, so the UI can show an install hint.
//
// Security invariant: `ensureSolutionsRepo` is the single seam both the init prompt
// and the remote wizard call, and it guarantees the defensive `.gitignore` exists
// *before* anything runs `git add`. The wizard is the only path that pushes, so the
// gitignore-before-add ordering must never diverge between the two entry points.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { errMessage } from "../debug";

// Discriminated result for every git/gh operation. `output` carries stdout/stderr
// for the failure surface; `reason` splits a missing/unauthenticated tool (an
// actionable install/login hint) from a real command failure (diagnostics in
// `output`).
export type GitFailReason = "tool-missing" | "not-authed" | "failed";
export type GitOpResult =
  | { ok: true; output: string }
  | { ok: false; reason: GitFailReason; output: string };

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  spawnFailed: boolean; // the binary isn't on PATH (Bun.spawn threw)
}

// Spawn a command, fully draining stdout/stderr, never throwing. A spawn failure
// (binary not on PATH) is reported as `spawnFailed`, not an exception. `env` is
// merged over `process.env` (so PATH etc. survive) — used by the network ops to set
// the non-interactive git vars without disturbing the inherited environment.
async function run(argv: string[], cwd?: string, env?: Record<string, string>): Promise<RunResult> {
  try {
    const proc = Bun.spawn(argv, {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return { ok: code === 0, stdout, stderr, spawnFailed: false };
  } catch (e) {
    return { ok: false, stdout: "", stderr: errMessage(e), spawnFailed: true };
  }
}

// Map a raw run into the public discriminated result.
function toResult(r: RunResult): GitOpResult {
  if (r.spawnFailed) return { ok: false, reason: "tool-missing", output: r.stderr };
  if (!r.ok) return { ok: false, reason: "failed", output: (r.stderr || r.stdout).trim() };
  return { ok: true, output: r.stdout.trim() };
}

// --- PATH detection --------------------------------------------------------

// True when `bin` resolves on PATH. Synchronous (Bun.which), so the keybind/wizard
// can gate before spawning and degrade to an install hint instead of crashing.
export function commandExists(bin: string): boolean {
  return Bun.which(bin) !== null;
}

export function ghAvailable(): boolean {
  return commandExists("gh");
}

// `gh` installed ≠ logged in. `gh repo create` fails opaquely when unauthenticated,
// so the wizard checks this separately to point the user at `gh auth login`.
export async function ghAuthed(): Promise<boolean> {
  return (await run(["gh", "auth", "status"])).ok;
}

// --- local git -------------------------------------------------------------

// True when `dir` is inside a git work tree (its own repo or a parent's) — so
// scaffolding doesn't create a nested repo over one that already tracks the dir.
export async function isGitRepo(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false;
  const r = await run(["git", "rev-parse", "--is-inside-work-tree"], dir);
  return r.ok && r.stdout.trim() === "true";
}

export async function gitInit(dir: string): Promise<GitOpResult> {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { ok: false, reason: "failed", output: errMessage(e) };
  }
  return toResult(await run(["git", "init"], dir));
}

// The defensive root `.gitignore`. The solutions tree holds no secrets by default
// (config.toml / questions.db / session.json all live outside it), but a user who
// repoints `[paths] solutions` at the parent data dir would pull them in — so a
// repo at the solutions root ignores them regardless.
export const ROOT_GITIGNORE = `# leettui — keep local app state / secrets out of version control
*.db
*.db-shm
*.db-wal
*.sqlite
session.json
config.toml
`;

// Create the defensive root `.gitignore` if absent — never clobbers a user's own.
// Returns true when the file is present afterward (already there or freshly
// written), false only if the write failed. Never throws.
export function writeRootGitignore(dir: string): boolean {
  const path = join(dir, ".gitignore");
  if (existsSync(path)) return true;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, ROOT_GITIGNORE);
    return true;
  } catch {
    return false;
  }
}

// The single repo-setup seam both the init prompt (item 4) and the remote wizard
// (item 5) call: mkdir -p → `git init` if not already a repo → defensive
// `.gitignore` if absent. Guarantees the gitignore exists before any caller runs
// `git add` (the security invariant), so the two entry points can't diverge.
export async function ensureSolutionsRepo(dir: string): Promise<GitOpResult> {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { ok: false, reason: "failed", output: errMessage(e) };
  }
  if (!(await isGitRepo(dir))) {
    const init = await gitInit(dir);
    if (!init.ok) return init;
  }
  if (!writeRootGitignore(dir)) {
    return { ok: false, reason: "failed", output: "could not write the defensive .gitignore" };
  }
  return { ok: true, output: "" };
}

// `git add -A` then `git commit -m message`. Surfaces git's own output on failure
// (e.g. an unset user.name/email tells the user exactly what to configure).
export async function initialCommit(dir: string, message: string): Promise<GitOpResult> {
  const added = toResult(await run(["git", "add", "-A"], dir));
  if (!added.ok) return added;
  // Idempotent: a re-run on an already-committed clean tree has nothing staged
  // (`git diff --cached --quiet` exits 0), so skip the commit rather than error
  // with "nothing to commit" — the remote wizard may run on an existing repo.
  const nothingStaged = (await run(["git", "diff", "--cached", "--quiet"], dir)).ok;
  if (nothingStaged) return { ok: true, output: "nothing to commit" };
  return toResult(await run(["git", "commit", "-m", message], dir));
}

// --- GitHub remote bootstrap (gh) ------------------------------------------

// Pure argv builder for `gh repo create` — unit-tested without spawning (a live run
// would create real GitHub repos). `--source=.` + `--remote=origin` + `--push` take
// the already-initialized, already-committed dir straight to a pushed remote.
export function ghCreateArgv(name: string, opts: { private: boolean }): string[] {
  return [
    "gh",
    "repo",
    "create",
    name,
    opts.private ? "--private" : "--public",
    "--source=.",
    "--remote=origin",
    "--push",
  ];
}

// Create the GitHub repo from `dir` and push. Assumes the caller already ran
// `ensureSolutionsRepo` + `initialCommit` (gh requires ≥1 commit and does NOT
// `git init` for you). Uses gh's OWN auth — never the LeetCode session.
export async function createGitHubRepo(
  dir: string,
  name: string,
  opts: { private: boolean },
): Promise<GitOpResult> {
  return toResult(await run(ghCreateArgv(name, opts), dir));
}

// The printed fallback when `gh` is absent: the exact manual commands to wire a
// remote and push.
export function manualRemoteInstructions(name: string): string {
  return `GitHub CLI (gh) isn't installed — set up the remote by hand:

  git remote add origin git@github.com:<your-username>/${name}.git
  git branch -M main
  git push -u origin main

(create the empty repo on github.com first, then run the commands above.)`;
}

// --- sync FROM a GitHub remote (Stage 24) ----------------------------------
//
// The inverse of the backup wizard: get the solutions tree *down* from GitHub —
// `cloneGitHubRepo` for a fresh/empty dir (restore on a new machine), `gitPull` for
// an already-tracked dir (ongoing sync). Clone goes through gh (its own auth, like
// `createGitHubRepo`); pull is plain git.

// Non-interactive env for the network ops (clone/pull). A private repo can trigger a
// credential or host-key prompt, and git prompts on /dev/tty **directly** — it does
// NOT read the `stdin: "ignore"` above — which the live TUI is drawing over, so a
// prompt would hang or corrupt the screen. These turn a would-be prompt into a clean
// non-zero exit the wizard surfaces as a `failed` result. Pure upside: the common
// path (gh-cached HTTPS credential helper) never prompts, so behavior is unchanged
// there; this only bites the diverged/no-helper case, where a hang becomes a clean
// error. Matters most for `gitPull` (not gh-mediated).
const GIT_NONINTERACTIVE_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
};

// True when `dir` is absent or holds no entries. The clone target must be empty
// (git refuses to clone into a non-empty dir), but this is also a **data-safety
// invariant**: a user who repoints `[paths] solutions` at the parent data dir has
// `questions.db`/`session.json` there → non-empty → clone refused → never clobbered.
// Strict emptiness (counts dotfiles): anything present blocks the clone rather than
// risk an overwrite; an unreadable dir reads as non-empty (refuse), never throws.
export function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true;
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

// True when `dir`'s repo has at least one configured remote. Gates the pull path: an
// already-tracked dir with no remote can't sync (set up backup first / add one in
// lazygit). Best-effort — a non-repo or git error reads as "no remote".
export async function hasRemote(dir: string): Promise<boolean> {
  const r = await run(["git", "remote"], dir);
  return r.ok && r.stdout.trim().length > 0;
}

// Pure argv builder for `gh repo clone` — unit-tested without spawning (a live run
// would hit the network). `repo` is `OWNER/REPO`, a full URL, or a bare name (gh
// resolves a bare name against your own account, symmetric with the backup wizard's
// default `leetcode-solutions`); `dir` is the clone target.
export function ghCloneArgv(repo: string, dir: string): string[] {
  return ["gh", "repo", "clone", repo, dir];
}

// Clone `repo` into `dir` via gh (its OWN auth, never the LeetCode session). The
// caller guarantees `dir` is empty (isDirEmpty) and exists. Uses the non-interactive
// env so a private-repo auth failure errors cleanly instead of hanging the TUI.
export async function cloneGitHubRepo(repo: string, dir: string): Promise<GitOpResult> {
  return toResult(await run(ghCloneArgv(repo, dir), undefined, GIT_NONINTERACTIVE_ENV));
}

// Fast-forward-only pull of the current branch from its tracked remote. `--ff-only`
// is the deliberate grain boundary (Stage 23 left pull to lazygit): we promote only
// the SAFE fast-forward sync; a diverged history fails loudly so the user opens
// lazygit for the real merge — genuine conflict resolution still delegates. Plain git
// (not gh), so the non-interactive env is what stops a private-repo credential prompt
// from hanging the live TUI.
export async function gitPull(dir: string): Promise<GitOpResult> {
  return toResult(await run(["git", "pull", "--ff-only"], dir, GIT_NONINTERACTIVE_ENV));
}

// The printed fallback when `gh` is absent: the exact manual command to clone.
export function manualCloneInstructions(repo: string, dir: string): string {
  return `GitHub CLI (gh) isn't installed — clone your solutions by hand:

  git clone git@github.com:<your-username>/${repo}.git "${dir}"

(or install gh: https://cli.github.com)`;
}
