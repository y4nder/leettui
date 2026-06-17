import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compareOutput } from "../testRunner";
import { generateHarness, getRunnerSpec } from "./index";
import { parseMetaData } from "./meta";
import {
  csharpReturnType,
  csharpType,
  generateCsharpHarness,
  isCsharpMappable,
  renderCsharpArgReads,
} from "./csharp";

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

describe("csharpType", () => {
  test("maps each scalar", () => {
    expect(csharpType("integer")).toBe("int");
    expect(csharpType("long")).toBe("long");
    expect(csharpType("string")).toBe("string");
    expect(csharpType("double")).toBe("double");
    expect(csharpType("boolean")).toBe("bool");
    expect(csharpType("character")).toBe("char");
  });

  test("appends [] for 1-D arrays", () => {
    expect(csharpType("integer[]")).toBe("int[]");
    expect(csharpType("string[]")).toBe("string[]");
  });

  test("appends [][] for 2-D arrays", () => {
    expect(csharpType("integer[][]")).toBe("int[][]");
    expect(csharpType("character[][]")).toBe("char[][]");
  });

  test("returns null for deferred types (ListNode/TreeNode), even as arrays", () => {
    expect(csharpType("ListNode")).toBeNull();
    expect(csharpType("TreeNode")).toBeNull();
    expect(csharpType("TreeNode[]")).toBeNull();
  });

  test("returns null for unknown scalars", () => {
    expect(csharpType("widget")).toBeNull();
  });
});

describe("csharpReturnType", () => {
  test("maps a concrete return type", () => {
    expect(csharpReturnType(parseMetaData(TWO_SUM))).toBe("int[]");
  });

  test("keeps void as the literal void (generator special-cases it)", () => {
    expect(csharpReturnType(parseMetaData(MATRIX_PARAM))).toBe("void");
  });

  test("returns null when the return type is deferred", () => {
    expect(csharpReturnType(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("isCsharpMappable", () => {
  test("true for an all-scalar/array signature", () => {
    expect(isCsharpMappable(parseMetaData(TWO_SUM))).toBe(true);
    expect(isCsharpMappable(parseMetaData(SCALARS))).toBe(true);
    expect(isCsharpMappable(parseMetaData(MATRIX_PARAM))).toBe(true);
  });

  test("false when a param is a deferred type", () => {
    expect(isCsharpMappable(parseMetaData(LISTNODE_PARAM))).toBe(false);
  });

  test("false when the return is a deferred type", () => {
    expect(isCsharpMappable(parseMetaData(TREENODE_RETURN))).toBe(false);
  });
});

describe("renderCsharpArgReads", () => {
  test("emits a typed JsonSerializer.Deserialize line per positional arg", () => {
    const reads = renderCsharpArgReads(parseMetaData(TWO_SUM));
    expect(reads).toBe(
      [
        "        int[] nums = JsonSerializer.Deserialize<int[]>(lines[0]);",
        "        int target = JsonSerializer.Deserialize<int>(lines[1]);",
      ].join("\n"),
    );
  });

  test("maps every scalar in the read lines", () => {
    const reads = renderCsharpArgReads(parseMetaData(SCALARS));
    expect(reads).toContain("long a = JsonSerializer.Deserialize<long>(lines[0]);");
    expect(reads).toContain("string b = JsonSerializer.Deserialize<string>(lines[1]);");
    expect(reads).toContain("double c = JsonSerializer.Deserialize<double>(lines[2]);");
    expect(reads).toContain("bool d = JsonSerializer.Deserialize<bool>(lines[3]);");
    expect(reads).toContain("char e = JsonSerializer.Deserialize<char>(lines[4]);");
  });

  test("returns null when any param is unmappable", () => {
    expect(renderCsharpArgReads(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("generateCsharpHarness", () => {
  test("emits main.csproj + .gitignore + main.cs for a mappable signature", () => {
    const files = generateCsharpHarness(parseMetaData(TWO_SUM));
    expect(files).not.toBeNull();
    expect(files!.map((f) => f.filename)).toEqual(["main.csproj", ".gitignore", "main.cs"]);
  });

  test("main.csproj declares an Exe + net9.0 + implicit usings + the main apphost name", () => {
    const files = generateCsharpHarness(parseMetaData(TWO_SUM))!;
    const csproj = files.find((f) => f.filename === "main.csproj")!.content;
    expect(csproj).toContain("<OutputType>Exe</OutputType>");
    expect(csproj).toContain("<TargetFramework>net9.0</TargetFramework>");
    expect(csproj).toContain("<ImplicitUsings>enable</ImplicitUsings>");
    expect(csproj).toContain("<AssemblyName>main</AssemblyName>");
    // No NuGet — System.Text.Json ships in the framework.
    expect(csproj).not.toContain("PackageReference");
  });

  test(".gitignore ignores the build dirs", () => {
    const files = generateCsharpHarness(parseMetaData(TWO_SUM))!;
    expect(files.find((f) => f.filename === ".gitignore")!.content).toBe("bin/\nobj/\nout/\n");
  });

  test("main.cs drives the co-compiled solution via System.Text.Json", () => {
    const files = generateCsharpHarness(parseMetaData(TWO_SUM))!;
    const main = files.find((f) => f.filename === "main.cs")!.content;
    expect(main).toContain("using System.Text.Json;");
    expect(main).toContain("int[] nums = JsonSerializer.Deserialize<int[]>(lines[0]);");
    expect(main).toContain("int target = JsonSerializer.Deserialize<int>(lines[1]);");
    expect(main).toContain("Console.WriteLine(JsonSerializer.Serialize(result));");
  });

  test("calls the PascalCase method LeetCode emits, not the camelCase metaData name", () => {
    const main = generateCsharpHarness(parseMetaData(TWO_SUM))!.find(
      (f) => f.filename === "main.cs",
    )!.content;
    expect(main).toContain("new Solution().TwoSum(nums, target)");
    expect(main).not.toContain("twoSum");
  });

  test("a void return calls without assignment and prints null", () => {
    const main = generateCsharpHarness(parseMetaData(MATRIX_PARAM))!.find(
      (f) => f.filename === "main.cs",
    )!.content;
    expect(main).toContain("new Solution().SetZeroes(matrix);");
    expect(main).toContain('Console.WriteLine("null");');
    expect(main).not.toContain("JsonSerializer.Serialize(result)");
  });

  test("returns null for a deferred-type signature (no compilable harness)", () => {
    expect(generateCsharpHarness(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("generateHarness dispatcher (csharp)", () => {
  test("returns the three-file csharp set", () => {
    const out = generateHarness("csharp", TWO_SUM);
    expect(out).not.toBeNull();
    expect(out!.files.map((f) => f.filename)).toEqual(["main.csproj", ".gitignore", "main.cs"]);
  });

  test("returns null for a deferred signature", () => {
    expect(generateHarness("csharp", LISTNODE_PARAM)).toBeNull();
  });
});

describe("csharp RunnerSpec", () => {
  test("registers a dotnet build compile phase + the produced apphost as the per-case command", () => {
    expect(getRunnerSpec("csharp")).toEqual({
      harnessFilename: "main.cs",
      command: ["./out/main"],
      compile: { command: ["dotnet", "build", "-o", "out", "--nologo", "-v", "q"] },
    });
  });
});

// The compiled-language proof: drive a real `solution.cs` through the generated
// harness exactly as `runLocalTests` does — run `compile.command` once to build
// the `out/main` apphost, then spawn `command` (NOT appending `harnessFilename`)
// on a stdin case. Gated on `dotnet` being on PATH so CI without the .NET SDK
// skips rather than failing; the first build is intentionally slow.
const HAS_DOTNET = Bun.which("dotnet") !== null;

describe.if(HAS_DOTNET)("csharp end-to-end execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "leettui-cs-harness-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test(
    "a real solution.cs compiles once and runs a stdin case",
    async () => {
      const harness = generateHarness("csharp", TWO_SUM)!;
      for (const file of harness.files) {
        writeFileSync(join(dir, file.filename), file.content);
      }
      // LeetCode's bare `public class Solution` — note the PascalCase method name
      // the harness call (`new Solution().TwoSum`) must resolve against, and the
      // `Dictionary<>` used without an explicit `using` (covered by implicit usings).
      writeFileSync(
        join(dir, "solution.cs"),
        `public class Solution {
    public int[] TwoSum(int[] nums, int target) {
        var seen = new Dictionary<int, int>();
        for (int i = 0; i < nums.Length; i++) {
            if (seen.ContainsKey(target - nums[i])) {
                return new int[] { seen[target - nums[i]], i };
            }
            seen[nums[i]] = i;
        }
        return new int[] {};
    }
}`,
      );

      const spec = getRunnerSpec("csharp")!;

      const build = Bun.spawn([...spec.compile!.command], { cwd: dir, stderr: "pipe" });
      const buildErr = await new Response(build.stderr).text();
      expect(await build.exited).toBe(0);
      expect(buildErr).toBe(""); // a clean build emits nothing on stderr

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
