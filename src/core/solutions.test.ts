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
import { overlayTemplates, renderTemplate, resolveProblemPath } from "./solutions";

const TWO_SUM_META = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
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

const SOLUTIONS_MODULE = join(import.meta.dir, "solutions.ts");
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
      env: { ...process.env, HOME: home, XDG_DATA_HOME: undefined, XDG_CONFIG_HOME: undefined },
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
    // rust has no harness generator → no main.rs default appears.
    expect(existsSync(join(dir, "main.rs"))).toBe(false);
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
