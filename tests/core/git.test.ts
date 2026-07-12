import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commandExists,
  ensureSolutionsRepo,
  ghCloneArgv,
  ghCreateArgv,
  gitInit,
  gitPull,
  hasRemote,
  initialCommit,
  isDirEmpty,
  isGitRepo,
  manualCloneInstructions,
  manualRemoteInstructions,
  ROOT_GITIGNORE,
  writeRootGitignore,
} from "@/core/git";

// Run a git command synchronously for e2e setup; throws on failure so a botched
// fixture surfaces loudly rather than as a confusing assertion miss.
function git(args: string[], cwd: string): void {
  const r = Bun.spawnSync(["git", ...args], { cwd });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  }
}

// init a repo with a repo-local identity (so commits don't depend on global config).
// core.autocrlf is forced off so content assertions see the bytes we wrote —
// Git for Windows installs a system-level autocrlf=true that would otherwise
// rewrite LF to CRLF on checkout.
function initRepo(dir: string): void {
  git(["init"], dir);
  git(["config", "user.email", "t@t.test"], dir);
  git(["config", "user.name", "Test"], dir);
  git(["config", "core.autocrlf", "false"], dir);
}

function freshDir(tag: string): string {
  const dir = join(
    tmpdir(),
    `leettui-git-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// --- pure parts (no git toolchain required) --------------------------------

describe("writeRootGitignore", () => {
  let dir: string;
  beforeEach(() => {
    dir = freshDir("ignore");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("writes the defensive .gitignore when absent", () => {
    expect(writeRootGitignore(dir)).toBe(true);
    const content = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(content).toBe(ROOT_GITIGNORE);
    // The local-state/secrets it must cover even if a user repoints solutions at
    // the parent data dir.
    for (const pat of ["*.db", "session.json", "config.toml"]) {
      expect(content).toContain(pat);
    }
  });

  test("never clobbers an existing .gitignore", () => {
    writeFileSync(join(dir, ".gitignore"), "my own rules\n");
    expect(writeRootGitignore(dir)).toBe(true);
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe("my own rules\n");
  });
});

describe("ghCreateArgv", () => {
  test("private repo argv (the wizard default)", () => {
    expect(ghCreateArgv("my-solutions", { private: true })).toEqual([
      "gh",
      "repo",
      "create",
      "my-solutions",
      "--private",
      "--source=.",
      "--remote=origin",
      "--push",
    ]);
  });

  test("public toggles only the visibility flag", () => {
    const argv = ghCreateArgv("x", { private: false });
    expect(argv).toContain("--public");
    expect(argv).not.toContain("--private");
  });
});

describe("manualRemoteInstructions", () => {
  test("embeds the repo name and the three manual commands", () => {
    const out = manualRemoteInstructions("leetcode-solutions");
    expect(out).toContain("leetcode-solutions");
    expect(out).toContain("git remote add origin");
    expect(out).toContain("git push -u origin main");
  });
});

describe("ghCloneArgv", () => {
  test("builds the clone argv with the repo and target dir", () => {
    expect(ghCloneArgv("leetcode-solutions", "/home/u/sol")).toEqual([
      "gh",
      "repo",
      "clone",
      "leetcode-solutions",
      "/home/u/sol",
    ]);
  });
});

describe("manualCloneInstructions", () => {
  test("embeds the repo name, the target dir, and a git clone command", () => {
    const out = manualCloneInstructions("leetcode-solutions", "/home/u/sol");
    expect(out).toContain("leetcode-solutions");
    expect(out).toContain("/home/u/sol");
    expect(out).toContain("git clone");
  });
});

describe("isDirEmpty", () => {
  let dir: string;
  beforeEach(() => {
    dir = freshDir("empty");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("true for an absent dir and an empty dir; false once any (even hidden) entry exists", () => {
    expect(isDirEmpty(join(dir, "does-not-exist"))).toBe(true);
    expect(isDirEmpty(dir)).toBe(true);
    // A dotfile counts — the clone target must be strictly empty (data-safety guard).
    writeFileSync(join(dir, ".hidden"), "x");
    expect(isDirEmpty(dir)).toBe(false);
  });
});

describe("commandExists", () => {
  test("true for a ubiquitous binary, false for a nonsense one", () => {
    expect(commandExists("git")).toBe(true);
    expect(commandExists("definitely-not-a-real-binary-xyz-123")).toBe(false);
  });
});

// --- local git ops (gated on a real git, like the rust/csharp e2e) ---------

const HAS_GIT = Bun.which("git") !== null;

describe.skipIf(!HAS_GIT)("git e2e", () => {
  let dir: string;
  beforeEach(() => {
    dir = freshDir("e2e");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("isGitRepo: false before init, true after", async () => {
    expect(await isGitRepo(dir)).toBe(false);
    expect((await gitInit(dir)).ok).toBe(true);
    expect(await isGitRepo(dir)).toBe(true);
  });

  test("ensureSolutionsRepo: inits + writes .gitignore, idempotent, no clobber", async () => {
    const first = await ensureSolutionsRepo(dir);
    expect(first.ok).toBe(true);
    expect(existsSync(join(dir, ".git"))).toBe(true);
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe(ROOT_GITIGNORE);

    // A second call is a no-op and a user-edited .gitignore survives.
    writeFileSync(join(dir, ".gitignore"), "custom\n");
    const second = await ensureSolutionsRepo(dir);
    expect(second.ok).toBe(true);
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe("custom\n");
  });

  test("initialCommit commits the staged tree (incl. the .gitignore)", async () => {
    await ensureSolutionsRepo(dir);
    // Repo-local identity so the commit doesn't depend on global git config.
    await Bun.spawn(["git", "config", "user.email", "t@t.test"], { cwd: dir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: dir }).exited;

    const res = await initialCommit(dir, "Initial leettui solutions backup");
    expect(res.ok).toBe(true);

    const log = Bun.spawnSync(["git", "log", "--oneline"], { cwd: dir });
    expect(log.stdout.toString()).toContain("Initial leettui solutions backup");
  });

  test("initialCommit is idempotent on a clean tree (re-run makes no empty commit)", async () => {
    await ensureSolutionsRepo(dir);
    await Bun.spawn(["git", "config", "user.email", "t@t.test"], { cwd: dir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: dir }).exited;

    expect((await initialCommit(dir, "first")).ok).toBe(true);
    // Nothing changed since — a second call succeeds without erroring or committing.
    expect((await initialCommit(dir, "second")).ok).toBe(true);

    const log = Bun.spawnSync(["git", "log", "--oneline"], { cwd: dir });
    expect(log.stdout.toString().trim().split("\n").length).toBe(1);
  });

  test("hasRemote: false on a fresh repo, true once a remote is added", async () => {
    await gitInit(dir);
    expect(await hasRemote(dir)).toBe(false);
    git(["remote", "add", "origin", "https://example.com/x.git"], dir);
    expect(await hasRemote(dir)).toBe(true);
  });

  test("gitPull --ff-only fast-forwards from the tracked remote", async () => {
    const src = freshDir("pull-src");
    const clone = freshDir("pull-clone");
    try {
      initRepo(src);
      writeFileSync(join(src, "a.txt"), "one\n");
      git(["add", "-A"], src);
      git(["commit", "-m", "first"], src);

      // Clone into the existing, empty dir (the exact case the feature relies on);
      // the clone tracks src as origin. autocrlf must be off AT CLONE TIME (-c
      // lands in the new repo's config before checkout) — set afterwards, the
      // already-CRLF checkout reads as locally modified and the pull refuses.
      git(["clone", "-c", "core.autocrlf=false", src, clone], tmpdir());

      // A new upstream commit → the ff pull brings it in.
      writeFileSync(join(src, "a.txt"), "two\n");
      git(["add", "-A"], src);
      git(["commit", "-m", "second"], src);

      const res = await gitPull(clone);
      expect(res.ok).toBe(true);
      expect(readFileSync(join(clone, "a.txt"), "utf-8")).toBe("two\n");
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(clone, { recursive: true, force: true });
    }
  });

  test("gitPull --ff-only refuses a diverged history (delegates the merge to lazygit)", async () => {
    const src = freshDir("div-src");
    const clone = freshDir("div-clone");
    try {
      initRepo(src);
      writeFileSync(join(src, "a.txt"), "one\n");
      git(["add", "-A"], src);
      git(["commit", "-m", "first"], src);

      git(["clone", src, clone], tmpdir());
      git(["config", "user.email", "t@t.test"], clone);
      git(["config", "user.name", "Test"], clone);

      // A local commit on the clone…
      writeFileSync(join(clone, "local.txt"), "local\n");
      git(["add", "-A"], clone);
      git(["commit", "-m", "local"], clone);

      // …and a different upstream commit → histories diverge → ff-only refuses.
      writeFileSync(join(src, "a.txt"), "remote\n");
      git(["add", "-A"], src);
      git(["commit", "-m", "remote"], src);

      expect((await gitPull(clone)).ok).toBe(false);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(clone, { recursive: true, force: true });
    }
  });
});
