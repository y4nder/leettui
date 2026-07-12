// Session merge invariants (Stage 10 item 1).
//
// The session file lives at a path fixed from $HOME/$XDG_DATA_HOME at process
// launch (Bun fixes these), and the module keeps a single mutable in-memory
// mirror. So these tests run a small child in a subprocess against a temp $HOME,
// and use *separate* spawns (each a fresh mirror) sharing one session file to
// exercise the cross-boot ordering that item 2 depends on.

import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { shouldShowBackfillNudge } from "@/core/session";

// Anchored at the repo root (bun test's cwd), not import.meta.dir: this test
// lives under tests/ but must import the real source module in the child spawn.
const SESSION_MODULE = join(process.cwd(), "src/core/session.ts");
let childScript: string;

beforeAll(() => {
  childScript = join(tmpdir(), `leettui-session-child-${Date.now()}.ts`);
  // Runs a sequence of ops against the session module, then prints the value
  // loadSession() returns. `flush` waits past the 400ms debounce.
  writeFileSync(
    childScript,
    `const session = await import(${JSON.stringify(SESSION_MODULE)});\n` +
      `const ops = JSON.parse(process.argv[2]);\n` +
      `for (const op of ops) {\n` +
      `  if (op.op === "save") session.saveSession(op.state);\n` +
      `  else if (op.op === "setDir") session.setLastKnownSolutionsDir(op.dir);\n` +
      `  else if (op.op === "setChangelog") session.setLastShownChangelogVersion(op.tag);\n` +
      `  else if (op.op === "setNudgeShown") session.setBackfillNudgeShown();\n` +
      `  else if (op.op === "flush") await new Promise((r) => setTimeout(r, 500));\n` +
      `}\n` +
      `process.stdout.write(JSON.stringify(session.loadSession()));\n`,
  );
});

afterAll(() => {
  rmSync(childScript, { force: true });
});

describe("session merge", () => {
  let home: string;

  beforeEach(() => {
    home = join(
      tmpdir(),
      `leettui-session-home-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  // Each spawn is a fresh process (fresh in-memory mirror) but shares the temp
  // $HOME, so they read/write the same session.json — i.e. a real cross-boot.
  function run(ops: object[]): {
    topicSlug?: string;
    questionId?: number;
    solutionsDir?: string;
    lastShownChangelogVersion?: string;
    backfillNudgeShown?: boolean;
  } {
    const res = Bun.spawnSync(["bun", childScript, JSON.stringify(ops)], {
      // USERPROFILE is what os.homedir() reads on Windows; HOME covers POSIX.
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_DATA_HOME: undefined,
        XDG_CONFIG_HOME: undefined,
      },
    });
    if (res.exitCode !== 0) throw new Error(`child failed: ${res.stderr.toString()}`);
    return JSON.parse(res.stdout.toString());
  }

  test("getLastKnownSolutionsDir is undefined before anything is recorded", () => {
    expect(run([]).solutionsDir).toBeUndefined();
  });

  test("a later position-save preserves a previously recorded solutions dir", () => {
    run([{ op: "setDir", dir: "/old/solutions" }]);
    run([{ op: "save", state: { topicSlug: "array", questionId: 1 } }, { op: "flush" }]);

    const final = run([]);
    expect(final).toEqual({ solutionsDir: "/old/solutions", topicSlug: "array", questionId: 1 });
  });

  test("recording a solutions dir preserves a previously saved position", () => {
    run([{ op: "save", state: { topicSlug: "graph", questionId: 207 } }, { op: "flush" }]);
    run([{ op: "setDir", dir: "/new/solutions" }]);

    const final = run([]);
    expect(final).toEqual({ solutionsDir: "/new/solutions", topicSlug: "graph", questionId: 207 });
  });

  test("recording a shown changelog version coexists with position + solutions dir", () => {
    run([{ op: "save", state: { topicSlug: "tree", questionId: 226 } }, { op: "flush" }]);
    run([{ op: "setDir", dir: "/sol" }]);
    run([{ op: "setChangelog", tag: "v0.5.2" }]);

    const final = run([]);
    expect(final).toEqual({
      solutionsDir: "/sol",
      topicSlug: "tree",
      questionId: 226,
      lastShownChangelogVersion: "v0.5.2",
    });
  });

  test("backfillNudgeShown is undefined before anything is recorded", () => {
    expect(run([]).backfillNudgeShown).toBeUndefined();
  });

  test("recording the backfill nudge shown flag coexists with position + solutions dir + changelog version", () => {
    run([{ op: "save", state: { topicSlug: "heap", questionId: 23 } }, { op: "flush" }]);
    run([{ op: "setDir", dir: "/sol2" }]);
    run([{ op: "setChangelog", tag: "v0.6.0" }]);
    run([{ op: "setNudgeShown" }]);

    const final = run([]);
    expect(final).toEqual({
      solutionsDir: "/sol2",
      topicSlug: "heap",
      questionId: 23,
      lastShownChangelogVersion: "v0.6.0",
      backfillNudgeShown: true,
    });
  });

  test("a sync setDir between a scheduled debounce and its fire is not clobbered", () => {
    // In one process: save() schedules the debounced write; setDir() writes
    // synchronously; flush waits for the debounce to fire. The debounce must
    // serialize the live mirror (both fields), not a stale position-only
    // snapshot — verified by reading back from a fresh process.
    run([
      { op: "save", state: { topicSlug: "dp", questionId: 70 } },
      { op: "setDir", dir: "/race/solutions" },
      { op: "flush" },
    ]);

    const final = run([]);
    expect(final).toEqual({ solutionsDir: "/race/solutions", topicSlug: "dp", questionId: 70 });
  });
});

// shouldShowBackfillNudge is a pure function (no fs I/O), so it's tested directly
// in-process rather than via the subprocess harness above.
describe("shouldShowBackfillNudge", () => {
  test("false once already shown, regardless of data/mode", () => {
    expect(shouldShowBackfillNudge(true, false, "browse")).toBe(false);
  });

  test("false when submissions data already exists", () => {
    expect(shouldShowBackfillNudge(false, true, "browse")).toBe(false);
  });

  test("true only when not shown, no data, and mode is browse", () => {
    expect(shouldShowBackfillNudge(false, false, "browse")).toBe(true);
  });

  test("false when not currently in browse mode", () => {
    expect(shouldShowBackfillNudge(false, false, "problem")).toBe(false);
  });
});
