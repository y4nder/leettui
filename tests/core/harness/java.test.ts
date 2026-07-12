import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compareOutput } from "@/core/testRunner";
import { generateHarness, getRunnerSpec, prepareSolutionSnippet } from "@/core/harness/index";
import { parseMetaData } from "@/core/harness/meta";
import {
  generateJavaHarness,
  isJavaMappable,
  javaReturnType,
  javaType,
  prepareJavaSolution,
  renderJavaArgReads,
} from "@/core/harness/java";

const TWO_SUM = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
});

const MATRIX_PARAM = JSON.stringify({
  name: "setZeroes",
  params: [{ name: "matrix", type: "integer[][]" }],
  return: { type: "void" },
});

const SCALARS = JSON.stringify({
  name: "kitchenSink",
  params: [
    { name: "a", type: "long" },
    { name: "b", type: "string" },
    { name: "c", type: "double" },
    { name: "d", type: "boolean" },
    { name: "e", type: "character" },
  ],
  return: { type: "boolean" },
});

const LISTNODE_PARAM = JSON.stringify({
  name: "reverseList",
  params: [{ name: "head", type: "ListNode" }],
  return: { type: "ListNode" },
});

const TREENODE_RETURN = JSON.stringify({
  name: "insertIntoBST",
  params: [{ name: "val", type: "integer" }],
  return: { type: "TreeNode" },
});

describe("javaType", () => {
  test("maps each scalar", () => {
    expect(javaType("integer")).toBe("int");
    expect(javaType("long")).toBe("long");
    expect(javaType("string")).toBe("String");
    expect(javaType("double")).toBe("double");
    expect(javaType("boolean")).toBe("boolean");
    expect(javaType("character")).toBe("char");
  });

  test("appends [] for 1-D arrays", () => {
    expect(javaType("integer[]")).toBe("int[]");
    expect(javaType("string[]")).toBe("String[]");
  });

  test("appends [][] for 2-D arrays", () => {
    expect(javaType("integer[][]")).toBe("int[][]");
    expect(javaType("character[][]")).toBe("char[][]");
  });

  test("returns null for deferred types (ListNode/TreeNode), even as arrays", () => {
    expect(javaType("ListNode")).toBeNull();
    expect(javaType("TreeNode")).toBeNull();
    expect(javaType("TreeNode[]")).toBeNull();
  });

  test("returns null for unknown scalars", () => {
    expect(javaType("widget")).toBeNull();
  });
});

describe("javaReturnType", () => {
  test("maps a concrete return type", () => {
    expect(javaReturnType(parseMetaData(TWO_SUM))).toBe("int[]");
  });

  test("keeps void as the literal void (generator special-cases it)", () => {
    expect(javaReturnType(parseMetaData(MATRIX_PARAM))).toBe("void");
  });

  test("returns null when the return type is deferred", () => {
    expect(javaReturnType(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("isJavaMappable", () => {
  test("true for an all-scalar/array signature", () => {
    expect(isJavaMappable(parseMetaData(TWO_SUM))).toBe(true);
    expect(isJavaMappable(parseMetaData(SCALARS))).toBe(true);
    expect(isJavaMappable(parseMetaData(MATRIX_PARAM))).toBe(true);
  });

  test("false when a param is a deferred type", () => {
    expect(isJavaMappable(parseMetaData(LISTNODE_PARAM))).toBe(false);
  });

  test("false when the return is a deferred type", () => {
    expect(isJavaMappable(parseMetaData(TREENODE_RETURN))).toBe(false);
  });
});

describe("renderJavaArgReads", () => {
  test("emits a typed convert(parseJson(...), T.class) line per positional arg", () => {
    const reads = renderJavaArgReads(parseMetaData(TWO_SUM));
    expect(reads).toBe(
      [
        "        int[] nums = (int[]) convert(parseJson(lines[0]), int[].class);",
        "        int target = (int) convert(parseJson(lines[1]), int.class);",
      ].join("\n"),
    );
  });

  test("maps every scalar in the read lines", () => {
    const reads = renderJavaArgReads(parseMetaData(SCALARS));
    expect(reads).toContain("long a = (long) convert(parseJson(lines[0]), long.class);");
    expect(reads).toContain("String b = (String) convert(parseJson(lines[1]), String.class);");
    expect(reads).toContain("double c = (double) convert(parseJson(lines[2]), double.class);");
    expect(reads).toContain("boolean d = (boolean) convert(parseJson(lines[3]), boolean.class);");
    expect(reads).toContain("char e = (char) convert(parseJson(lines[4]), char.class);");
  });

  test("returns null when any param is unmappable", () => {
    expect(renderJavaArgReads(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("prepareJavaSolution", () => {
  test("prepends java.util.* so a bare collections snippet compiles locally", () => {
    const out = prepareJavaSolution("class Solution {}");
    expect(out).toBe("import java.util.*;\n\nclass Solution {}");
  });

  test("is wired into the dispatcher's prepareSolutionSnippet for java only", () => {
    expect(prepareSolutionSnippet("java", "class Solution {}")).toBe(
      "import java.util.*;\n\nclass Solution {}",
    );
    // Other languages are untouched by the java transform.
    expect(prepareSolutionSnippet("python3", "class Solution {}")).toBe("class Solution {}");
  });
});

describe("generateJavaHarness", () => {
  test("emits .gitignore + main.java for a mappable signature", () => {
    const files = generateJavaHarness(parseMetaData(TWO_SUM));
    expect(files).not.toBeNull();
    expect(files!.map((f) => f.filename)).toEqual([".gitignore", "main.java"]);
  });

  test(".gitignore ignores the compiled classes", () => {
    const files = generateJavaHarness(parseMetaData(TWO_SUM))!;
    expect(files.find((f) => f.filename === ".gitignore")!.content).toBe("*.class\n");
  });

  test("main.java is a package-private class Main with embedded JSON helpers", () => {
    const main = generateJavaHarness(parseMetaData(TWO_SUM))!.find(
      (f) => f.filename === "main.java",
    )!.content;
    // Package-private (NOT `public class Main`) so the `main.java` filename is legal.
    expect(main).toContain("class Main {");
    expect(main).not.toContain("public class Main");
    expect(main).toContain("public static void main(String[] args)");
    // The dependency-free embedded JSON seam.
    expect(main).toContain("static Object parseJson(String str)");
    expect(main).toContain("static Object convert(Object o, Class<?> t)");
    expect(main).toContain("static String toJson(Object o)");
    expect(main).toContain("int[] nums = (int[]) convert(parseJson(lines[0]), int[].class);");
    expect(main).toContain("System.out.println(toJson(result));");
  });

  test("calls the camelCase method verbatim (Java needs no name-case conversion)", () => {
    const main = generateJavaHarness(parseMetaData(TWO_SUM))!.find(
      (f) => f.filename === "main.java",
    )!.content;
    expect(main).toContain("new Solution().twoSum(nums, target)");
  });

  test("a void return calls without assignment and prints null", () => {
    const main = generateJavaHarness(parseMetaData(MATRIX_PARAM))!.find(
      (f) => f.filename === "main.java",
    )!.content;
    expect(main).toContain("new Solution().setZeroes(matrix);");
    expect(main).toContain('System.out.println("null");');
    expect(main).not.toContain("toJson(result)");
  });

  test("returns null for a deferred-type signature (no compilable harness)", () => {
    expect(generateJavaHarness(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("generateHarness dispatcher (java)", () => {
  test("returns the two-file java set", () => {
    const out = generateHarness("java", TWO_SUM);
    expect(out).not.toBeNull();
    expect(out!.files.map((f) => f.filename)).toEqual([".gitignore", "main.java"]);
  });

  test("returns null for a deferred signature", () => {
    expect(generateHarness("java", LISTNODE_PARAM)).toBeNull();
  });
});

describe("java RunnerSpec", () => {
  test("registers a javac compile phase + `java -cp . Main` as the per-case command", () => {
    expect(getRunnerSpec("java")).toEqual({
      harnessFilename: "main.java",
      command: ["java", "-cp", ".", "Main"],
      compile: { command: ["javac", "solution.java", "main.java"] },
    });
  });
});

// The compiled-language proof: drive a real `solution.java` through the generated
// harness exactly as `runLocalTests` does — run `compile.command` once to produce
// the `Main.class`/`Solution.class`, then spawn `command` (NOT appending
// `harnessFilename`) on a stdin case. Gated on `javac`/`java` being on PATH so CI
// without a JDK skips rather than failing. The solution uses `HashMap` with NO
// import line, written through `prepareJavaSolution` — so the e2e genuinely
// exercises the `import java.util.*;` prepend (a no-collections solution would
// pass while hiding that bug, per the C# `Dictionary` precedent).
const HAS_JAVA = Bun.which("javac") !== null && Bun.which("java") !== null;

describe.if(HAS_JAVA)("java end-to-end execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "leettui-java-harness-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test(
    "a real solution.java compiles once and runs a stdin case",
    async () => {
      const harness = generateHarness("java", TWO_SUM)!;
      for (const file of harness.files) {
        writeFileSync(join(dir, file.filename), file.content);
      }
      // LeetCode's bare package-private `class Solution`, using `HashMap` with NO
      // explicit import — local `javac` only compiles it because
      // `prepareJavaSolution` prepended `import java.util.*;`.
      const bare = `class Solution {
    public int[] twoSum(int[] nums, int target) {
        var seen = new HashMap<Integer, Integer>();
        for (int i = 0; i < nums.length; i++) {
            if (seen.containsKey(target - nums[i])) {
                return new int[] { seen.get(target - nums[i]), i };
            }
            seen.put(nums[i], i);
        }
        return new int[] {};
    }
}`;
      const prepared = prepareJavaSolution(bare);
      expect(prepared).toContain("import java.util.*;");
      writeFileSync(join(dir, "solution.java"), prepared);

      const spec = getRunnerSpec("java")!;

      const build = Bun.spawn([...spec.compile!.command], { cwd: dir, stderr: "pipe" });
      const buildErr = await new Response(build.stderr).text();
      expect(await build.exited).toBe(0);
      expect(buildErr).toBe(""); // a clean compile emits nothing on stderr

      writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9\n");
      const run = Bun.spawn([...spec.command], {
        cwd: dir,
        stdin: Bun.file(join(dir, "case-01.txt")),
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(run.stdout).text();
      expect(await run.exited).toBe(0);
      expect(stdout.trim()).toBe("[0,1]");
      // The grader normalizes spacing, so a display-spaced `.out` still matches.
      expect(compareOutput(stdout, "[0, 1]")).toBe(true);
    },
    { timeout: 120_000 },
  );
});
