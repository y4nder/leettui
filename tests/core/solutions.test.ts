// Per-language template overrides (Stage 7 item 6).
//
// `renderTemplate`/`overlayTemplates` are pure / dir-injected, so they're tested
// in-process. `createSolutionWithHarness` resolves both the solutions dir and the
// templates dir from `os.homedir()`, which Bun fixes at process launch (runtime
// mutation of $HOME is ignored), so the end-to-end create-flow tests run it in a
// subprocess with a temp $HOME — one spawn per scenario since each needs its own
// template state.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { overlayTemplates, renderTemplate, resolveProblemPath } from "@/core/solutions";

const TWO_SUM_META = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
});

// A deferred-type (ListNode) signature: the rust harness can't map it, so
// `generateHarness` returns null — no Cargo.toml/main.rs and no feature declared.
const REVERSE_LIST_META = JSON.stringify({
  name: "reverseList",
  params: [{ name: "head", type: "ListNode" }],
  return: { type: "ListNode" },
});

describe("renderTemplate", () => {
  test("substitutes functionName and titleSlug (with optional inner spaces)", () => {
    const out = renderTemplate("fn={{functionName}} slug={{ titleSlug }}", {
      functionName: "twoSum",
      titleSlug: "two-sum",
    });
    expect(out).toBe("fn=twoSum slug=two-sum");
  });

  test("missing functionName degrades to empty string", () => {
    expect(renderTemplate("[{{functionName}}]", { titleSlug: "x" })).toBe("[]");
  });
});

describe("overlayTemplates", () => {
  let src: string;
  let dest: string;

  beforeEach(() => {
    const base = join(
      tmpdir(),
      `leettui-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    src = join(base, "src");
    dest = join(base, "dest");
    mkdirSync(src, { recursive: true });
  });

  afterEach(() => {
    rmSync(join(src, ".."), { recursive: true, force: true });
  });

  test("renders every file into dest and returns the applied names", () => {
    writeFileSync(join(src, "main.py"), "# {{functionName}}");
    writeFileSync(join(src, "Cargo.toml"), 'name = "{{titleSlug}}"');

    const applied = overlayTemplates(src, dest, { functionName: "twoSum", titleSlug: "two-sum" });

    expect(applied).toEqual(new Set(["main.py", "Cargo.toml"]));
    expect(readFileSync(join(dest, "main.py"), "utf-8")).toBe("# twoSum");
    expect(readFileSync(join(dest, "Cargo.toml"), "utf-8")).toBe('name = "two-sum"');
  });

  test("is create-if-absent — never clobbers an existing dest file", () => {
    writeFileSync(join(src, "main.py"), "TEMPLATE");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "main.py"), "USER-EDIT");

    const applied = overlayTemplates(src, dest, { titleSlug: "x" });

    expect(applied.has("main.py")).toBe(true); // still "owned" by the template
    expect(readFileSync(join(dest, "main.py"), "utf-8")).toBe("USER-EDIT");
  });

  test("missing src dir → empty set, no dest created", () => {
    const applied = overlayTemplates(join(src, "nope"), dest, { titleSlug: "x" });
    expect(applied.size).toBe(0);
    expect(existsSync(dest)).toBe(false);
  });
});

// --- create-flow end state (subprocess with a temp $HOME) ---

interface CreateSpec {
  id: number;
  slug: string;
  lang: string;
  code: string;
  meta?: string;
  tests?: string[];
}

// Anchored at the repo root (bun test's cwd), not import.meta.dir: this test
// lives under tests/ but must import the real source module in the child spawn.
const SOLUTIONS_MODULE = join(process.cwd(), "src/core/solutions/index.ts");
let childScript: string;

beforeAll(() => {
  childScript = join(tmpdir(), `leettui-create-child-${Date.now()}.ts`);
  writeFileSync(
    childScript,
    `const { createSolutionWithHarness } = await import(${JSON.stringify(SOLUTIONS_MODULE)});\n` +
      `const s = JSON.parse(process.argv[2]);\n` +
      `createSolutionWithHarness(s.id, s.slug, s.lang, s.code, s.meta, s.tests);\n`,
  );
});

afterAll(() => {
  rmSync(childScript, { force: true });
});

describe("createSolutionWithHarness with template overrides", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `leettui-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function writeTemplate(lang: string, name: string, content: string) {
    const dir = join(home, ".config", "leettui", "templates", lang);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), content);
  }

  function runCreate(spec: CreateSpec) {
    const res = Bun.spawnSync(["bun", childScript, JSON.stringify(spec)], {
      // Clear XDG overrides so the child's DATA_DIR derives from the temp $HOME
      // regardless of the dev/CI environment (paths.ts honors $XDG_DATA_HOME).
      // USERPROFILE is what os.homedir() reads on Windows; HOME covers POSIX.
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_DATA_HOME: undefined,
        XDG_CONFIG_HOME: undefined,
      },
    });
    if (res.exitCode !== 0) {
      throw new Error(`child failed: ${res.stderr.toString()}`);
    }
  }

  function langDir(spec: CreateSpec): string {
    return join(
      home,
      ".local/share/leettui/solutions",
      `${String(spec.id).padStart(4, "0")}_${spec.slug}`,
      spec.lang,
    );
  }

  test("no template: writes the snippet + generated harness + seeds tests", () => {
    const spec: CreateSpec = {
      id: 1,
      slug: "two-sum",
      lang: "python3",
      code: "class Solution: pass",
      meta: TWO_SUM_META,
      tests: ["[2,7,11,15]\n9"],
    };
    runCreate(spec);

    const dir = langDir(spec);
    expect(readFileSync(join(dir, "solution.py"), "utf-8")).toBe("class Solution: pass");
    expect(readFileSync(join(dir, "main.py"), "utf-8")).toContain("Solution().twoSum");
    const testsCase = join(home, ".local/share/leettui/solutions/0001_two-sum/tests/case-01.txt");
    expect(readFileSync(testsCase, "utf-8")).toBe("[2,7,11,15]\n9");
  });

  test("solution.{ext} template replaces the snippet; harness still generated", () => {
    writeTemplate(
      "python3",
      "solution.py",
      "# {{titleSlug}} :: {{functionName}}\nclass Solution: ...",
    );
    const spec: CreateSpec = {
      id: 2,
      slug: "add-two-numbers",
      lang: "python3",
      code: "SNIPPET",
      meta: TWO_SUM_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    expect(readFileSync(join(dir, "solution.py"), "utf-8")).toBe(
      "# add-two-numbers :: twoSum\nclass Solution: ...",
    );
    // Harness default is not suppressed — only the solution was overridden.
    expect(readFileSync(join(dir, "main.py"), "utf-8")).toContain("Solution().twoSum");
  });

  test("harness template replaces the generated harness; snippet still written", () => {
    writeTemplate("python3", "main.py", "# custom harness for {{functionName}}");
    const spec: CreateSpec = {
      id: 3,
      slug: "longest-substring",
      lang: "python3",
      code: "SNIPPET-3",
      meta: TWO_SUM_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    expect(readFileSync(join(dir, "main.py"), "utf-8")).toBe("# custom harness for twoSum");
    expect(readFileSync(join(dir, "solution.py"), "utf-8")).toBe("SNIPPET-3");
  });

  test("manifest + extra files land alongside the snippet (no default to suppress)", () => {
    writeTemplate("rust", "Cargo.toml", '[package]\nname = "{{titleSlug}}"');
    writeTemplate("rust", "build.rs", "// build");
    const spec: CreateSpec = { id: 4, slug: "median-arrays", lang: "rust", code: "fn main() {}" };
    runCreate(spec);

    const dir = langDir(spec);
    expect(readFileSync(join(dir, "solution.rs"), "utf-8")).toBe("fn main() {}");
    expect(readFileSync(join(dir, "Cargo.toml"), "utf-8")).toBe(
      '[package]\nname = "median-arrays"',
    );
    expect(readFileSync(join(dir, "build.rs"), "utf-8")).toBe("// build");
    // No metaData in this spec → the rust generator returns null, so no default
    // main.rs appears (only the template-supplied files do).
    expect(existsSync(join(dir, "main.rs"))).toBe(false);
  });

  test("mappable rust: solution.rs gets the cfg-gated struct shim alongside the harness", () => {
    const spec: CreateSpec = {
      id: 5,
      slug: "two-sum-rs",
      lang: "rust",
      code: "impl Solution {\n    pub fn two_sum() {}\n}",
      meta: TWO_SUM_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    const solution = readFileSync(join(dir, "solution.rs"), "utf-8");
    expect(solution).toContain('#[cfg(feature = "harness")]\npub struct Solution;');
    expect(solution).toContain("impl Solution {");
    // The shim coheres only with the harness it travels with.
    expect(readFileSync(join(dir, "Cargo.toml"), "utf-8")).toContain('default = ["harness"]');
    expect(readFileSync(join(dir, "main.rs"), "utf-8")).toContain("mod solution;");
  });

  test("rust solution.rs template wins un-shimmed (Stage 21 caveat): user owns the cfg struct", () => {
    // Templates win untouched — the cfg-struct shim is only applied to the DEFAULT
    // snippet, not a user template. Since the generated main.rs no longer defines
    // `struct Solution;`, a template author must carry their own (documented).
    writeTemplate("rust", "solution.rs", "// my template\nimpl Solution {}");
    const spec: CreateSpec = {
      id: 7,
      slug: "templated-rs",
      lang: "rust",
      code: "impl Solution {}",
      meta: TWO_SUM_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    // Verbatim template, NOT shimmed.
    expect(readFileSync(join(dir, "solution.rs"), "utf-8")).toBe(
      "// my template\nimpl Solution {}",
    );
    // The generated harness still lands (only solution.rs was overridden).
    expect(readFileSync(join(dir, "main.rs"), "utf-8")).toContain("mod solution;");
  });

  test("unmappable rust (ListNode): plain snippet, no orphaned cfg shim or manifest", () => {
    const spec: CreateSpec = {
      id: 6,
      slug: "reverse-list-rs",
      lang: "rust",
      code: "impl Solution {\n    pub fn reverse_list() {}\n}",
      meta: REVERSE_LIST_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    // No harness (deferred type) → no feature is declared anywhere, so the snippet
    // must NOT carry a feature-gated struct (it'd reference an undeclared feature).
    expect(readFileSync(join(dir, "solution.rs"), "utf-8")).toBe(
      "impl Solution {\n    pub fn reverse_list() {}\n}",
    );
    expect(existsSync(join(dir, "Cargo.toml"))).toBe(false);
    expect(existsSync(join(dir, "main.rs"))).toBe(false);
  });

  test("mappable java: solution.java gets the java.util import prepend alongside the harness", () => {
    const spec: CreateSpec = {
      id: 8,
      slug: "two-sum-java",
      lang: "java",
      code: "class Solution {\n    public int[] twoSum(int[] nums, int target) { return new int[0]; }\n}",
      meta: TWO_SUM_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    const solution = readFileSync(join(dir, "solution.java"), "utf-8");
    // The import prepend rides the same `prepareSolutionSnippet` seam as rust's shim.
    expect(solution).toBe(`import java.util.*;\n\n${spec.code}`);
    // The two-file harness lands beside it (no build manifest).
    expect(readFileSync(join(dir, "main.java"), "utf-8")).toContain("class Main {");
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe("*.class\n");
  });

  test("unmappable java (ListNode): plain snippet, no import prepend or harness", () => {
    const spec: CreateSpec = {
      id: 9,
      slug: "reverse-list-java",
      lang: "java",
      code: "class Solution {\n    public ListNode reverseList(ListNode head) { return head; }\n}",
      meta: REVERSE_LIST_META,
    };
    runCreate(spec);

    const dir = langDir(spec);
    // No harness (deferred type) → the snippet must NOT carry the prepend either
    // (the prepend is coupled to harness presence, like rust's cfg shim).
    expect(readFileSync(join(dir, "solution.java"), "utf-8")).toBe(spec.code);
    expect(existsSync(join(dir, "main.java"))).toBe(false);
  });
});

// --- problem.md / workspace seam (Stage 13 item 1) ---
//
// `findExistingSolutions`/`listSolutionQuestionIds` resolve the solutions dir
// from `os.homedir()` (fixed at launch), so this runs in a subprocess with a
// temp $HOME like the create-flow tests above.

describe("ensureProblemMd + workspace seam (Stage 13)", () => {
  let home: string;
  let script: string;

  beforeEach(() => {
    home = join(tmpdir(), `leettui-pmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    script = join(home, "child.ts");
    writeFileSync(
      script,
      `const m = await import(${JSON.stringify(SOLUTIONS_MODULE)});\n` +
        `m.ensureProblemDir(42, "the-slug");\n` +
        `m.ensureProblemMd(42, "the-slug", "the description body", "The Title");\n` +
        `m.ensureNotesFile(42, "the-slug", "The Title");\n` +
        // Second call must not clobber an existing problem.md.
        `m.ensureProblemMd(42, "the-slug", "DIFFERENT BODY", "The Title");\n` +
        `console.log(JSON.stringify({\n` +
        `  existing: m.findExistingSolutions(42, "the-slug"),\n` +
        `  ids: [...m.listSolutionQuestionIds()],\n` +
        `  problemMd: m.readProblemMd(42, "the-slug"),\n` +
        `}));\n`,
    );
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("creating problem.md + notes.md does not flip the 'has solution' marker", () => {
    const res = Bun.spawnSync(["bun", script], {
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_DATA_HOME: undefined,
        XDG_CONFIG_HOME: undefined,
      },
    });
    if (res.exitCode !== 0) throw new Error(`child failed: ${res.stderr.toString()}`);
    // The config bootstrap may print a "Created config…" line; our JSON is last.
    const lines = res.stdout.toString().trim().split("\n");
    const out = JSON.parse(lines[lines.length - 1]!);

    // A problem folder holding only problem.md + notes.md is NOT a solution.
    expect(out.existing).toEqual([]);
    expect(out.ids).not.toContain(42);
    // problem.md is heading + the ORIGINAL description (create-if-absent: the
    // second ensureProblemMd with a different body left it untouched).
    expect(out.problemMd).toBe("# 42. The Title\n\nthe description body\n");
  });
});

describe("resolveProblemPath (Stage 8 cwd-inference)", () => {
  const root = join(tmpdir(), "leettui-solutions-root");

  test("resolves id + slug + lang from a lang folder", () => {
    expect(resolveProblemPath(join(root, "0001_two-sum", "python3"), root)).toEqual({
      questionId: 1,
      titleSlug: "two-sum",
      langSlug: "python3",
    });
  });

  test("resolves the lang from a nested subfolder (e.g. rust src/)", () => {
    expect(resolveProblemPath(join(root, "0004_median", "rust", "src"), root)).toEqual({
      questionId: 4,
      titleSlug: "median",
      langSlug: "rust",
    });
  });

  test("langSlug is null at the problem-folder level", () => {
    expect(resolveProblemPath(join(root, "0011_container"), root)).toEqual({
      questionId: 11,
      titleSlug: "container",
      langSlug: null,
    });
  });

  test("strips the id padding to a real number", () => {
    expect(
      resolveProblemPath(join(root, "0042_trapping-rain-water", "javascript"), root)?.questionId,
    ).toBe(42);
  });

  test("null when path is the solutions root itself", () => {
    expect(resolveProblemPath(root, root)).toBeNull();
  });

  test("null when path is outside the solutions root", () => {
    expect(resolveProblemPath(join(tmpdir(), "elsewhere", "0001_two-sum"), root)).toBeNull();
  });

  test("null when the first segment isn't a {paddedId}_{slug} dir", () => {
    expect(resolveProblemPath(join(root, "scratch", "python3"), root)).toBeNull();
  });
});

// --- deleteSolution (Stage 16) ---
//
// `deleteSolution`/`findExistingSolutions`/`listSolutionQuestionIds` resolve the
// solutions dir from `os.homedir()` (fixed at launch), so — like the create-flow
// + Stage 13 tests above — this runs the whole create→delete sequence in one
// subprocess with a temp $HOME and asserts on a single printed JSON snapshot set.

describe("deleteSolution (Stage 16)", () => {
  let home: string;
  let script: string;

  beforeEach(() => {
    home = join(tmpdir(), `leettui-del-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    script = join(home, "child.ts");
    writeFileSync(
      script,
      `import { existsSync } from "node:fs";\n` +
        `import { join } from "node:path";\n` +
        `const m = await import(${JSON.stringify(SOLUTIONS_MODULE)});\n` +
        `const META = ${JSON.stringify(TWO_SUM_META)};\n` +
        // Two languages + the shared problem-level files for question 7.
        `m.createSolutionWithHarness(7, "reverse-int", "python3", "class Solution: pass", META, ["1"]);\n` +
        `m.createSolutionWithHarness(7, "reverse-int", "rust", "impl Solution {}", META);\n` +
        `m.ensureNotesFile(7, "reverse-int", "Reverse Int");\n` +
        `m.ensureProblemMd(7, "reverse-int", "body", "Reverse Int");\n` +
        `const notes = m.getNotesPath(7, "reverse-int");\n` +
        `const problemMd = m.getProblemMdPath(7, "reverse-int");\n` +
        `const tests = m.getTestsDir(7, "reverse-int");\n` +
        `const pyDir = join(m.getProblemDir(7, "reverse-int"), "python3");\n` +
        `const problemDir = m.getProblemDir(7, "reverse-int");\n` +
        `const before = m.findExistingSolutions(7, "reverse-int");\n` +
        // Data-loss guard: an empty langSlug must be refused outright — otherwise the
        // target collapses to the problem dir and the recursive remove wipes the shared
        // notes/tests. Assert it's a pure no-op (everything still present).
        `m.deleteSolution(7, "reverse-int", "");\n` +
        `const afterEmpty = {\n` +
        `  problemDir: existsSync(problemDir),\n` +
        `  existing: m.findExistingSolutions(7, "reverse-int"),\n` +
        `  notes: existsSync(notes),\n` +
        `  tests: existsSync(tests),\n` +
        `};\n` +
        // Delete one language; the other + the shared files must survive.
        `m.deleteSolution(7, "reverse-int", "python3");\n` +
        // Idempotent + never-throws on an already-absent folder.
        `m.deleteSolution(7, "reverse-int", "python3");\n` +
        `const afterOne = {\n` +
        `  existing: m.findExistingSolutions(7, "reverse-int"),\n` +
        `  ids: [...m.listSolutionQuestionIds()],\n` +
        `  pyDir: existsSync(pyDir),\n` +
        `  notes: existsSync(notes),\n` +
        `  problemMd: existsSync(problemMd),\n` +
        `  tests: existsSync(tests),\n` +
        `};\n` +
        // Remove the LAST language: the id drops from the marker set, but the
        // problem-level notes survive (delete is lang-folder granularity only).
        `m.deleteSolution(7, "reverse-int", "rust");\n` +
        `const afterAllLangs = {\n` +
        `  existing: m.findExistingSolutions(7, "reverse-int"),\n` +
        `  ids: [...m.listSolutionQuestionIds()],\n` +
        `  notes: existsSync(notes),\n` +
        `};\n` +
        `console.log(JSON.stringify({ before, afterEmpty, afterOne, afterAllLangs }));\n`,
    );
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("removes only the lang subfolder; shared files + other langs survive; clears id on last", () => {
    const res = Bun.spawnSync(["bun", script], {
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_DATA_HOME: undefined,
        XDG_CONFIG_HOME: undefined,
      },
    });
    if (res.exitCode !== 0) throw new Error(`child failed: ${res.stderr.toString()}`);
    const lines = res.stdout.toString().trim().split("\n");
    const out = JSON.parse(lines[lines.length - 1]!);

    expect(out.before.sort()).toEqual(["python3", "rust"]);

    // Empty langSlug is refused: the problem dir + both languages + shared files
    // all survive (the guard against wiping the problem folder).
    expect(out.afterEmpty.problemDir).toBe(true);
    expect(out.afterEmpty.existing.sort()).toEqual(["python3", "rust"]);
    expect(out.afterEmpty.notes).toBe(true);
    expect(out.afterEmpty.tests).toBe(true);

    // After deleting python3 (twice — the second is the idempotency probe): only
    // the rust folder remains, the shared notes/problem.md/tests are untouched,
    // and the id is still marked (rust still has a solution).
    expect(out.afterOne.existing).toEqual(["rust"]);
    expect(out.afterOne.ids).toContain(7);
    expect(out.afterOne.pyDir).toBe(false);
    expect(out.afterOne.notes).toBe(true);
    expect(out.afterOne.problemMd).toBe(true);
    expect(out.afterOne.tests).toBe(true);

    // After removing the last language the id drops from the marker set, but the
    // problem-level notes.md still exists (lang-folder granularity).
    expect(out.afterAllLangs.existing).toEqual([]);
    expect(out.afterAllLangs.ids).not.toContain(7);
    expect(out.afterAllLangs.notes).toBe(true);
  });
});
