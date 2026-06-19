import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commandExists,
  ensureSolutionsRepo,
  ghCreateArgv,
  gitInit,
  initialCommit,
  isGitRepo,
  manualRemoteInstructions,
  ROOT_GITIGNORE,
  writeRootGitignore,
} from "./git";

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
});
