import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { parseMetaData } from "./meta";
import { generateTypescriptHarness } from "./typescript";
import { generateHarness, getRunnerSpec } from "./index";

const TWO_SUM = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
});

const LISTNODE_PARAM = JSON.stringify({
  name: "reverseList",
  params: [{ name: "head", type: "ListNode" }],
  return: { type: "ListNode" },
});

describe("generateTypescriptHarness", () => {
  test("reads one json value per param and transpiles before eval", () => {
    const src = generateTypescriptHarness(parseMetaData(TWO_SUM));
    expect(src).toContain("const nums = JSON.parse(data[0]);");
    expect(src).toContain("const target = JSON.parse(data[1]);");
    expect(src).toContain('fs.readFileSync(path.join(__dirname, "solution.ts")');
    expect(src).toContain('new Bun.Transpiler({ loader: "ts" }).transformSync(src)');
    expect(src).toContain("return twoSum;");
    expect(src).toContain("const result = loadSolution()(nums, target);");
    expect(src).toContain("console.log(JSON.stringify(result ?? null));");
  });

  test("ListNode param is passed through raw with a TODO comment", () => {
    const src = generateTypescriptHarness(parseMetaData(LISTNODE_PARAM));
    expect(src).toContain("const head = JSON.parse(data[0]);");
    expect(src).toContain("TODO: deserialize ListNode");
  });
});

describe("generateHarness dispatcher (typescript)", () => {
  test("returns main.ts for typescript", () => {
    const out = generateHarness("typescript", TWO_SUM);
    expect(out).not.toBeNull();
    expect(out!.filename).toBe("main.ts");
    expect(out!.content).toContain("Bun.Transpiler");
  });

  test("registers a bun runner spec for typescript", () => {
    expect(getRunnerSpec("typescript")).toEqual({
      harnessFilename: "main.ts",
      command: ["bun"],
    });
  });
});

// The assertion that matters: a real, *typed* solution.ts driven by the
// generated harness under `bun`, fed a real stdin case. The type annotations
// make this genuinely exercise the `Bun.Transpiler` step — an untyped function
// would run even if transpilation were broken, so it must stay typed.
describe("end-to-end execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "leettui-ts-harness-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("a typed LeetCode-style solution.ts runs against a stdin case", async () => {
    const harness = generateHarness("typescript", TWO_SUM)!;
    writeFileSync(join(dir, harness.filename), harness.content);
    writeFileSync(
      join(dir, "solution.ts"),
      `function twoSum(nums: number[], target: number): number[] {
  const seen: Record<number, number> = {};
  for (let i = 0; i < nums.length; i++) {
    const complement: number = target - nums[i];
    if (complement in seen) return [seen[complement], i];
    seen[nums[i]] = i;
  }
  return [];
}`
    );
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9\n");

    const spec = getRunnerSpec("typescript")!;
    const proc = Bun.spawn([...spec.command, spec.harnessFilename], {
      cwd: dir,
      stdin: Bun.file(join(dir, "case-01.txt")),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exit = await proc.exited;

    expect(stderr).toBe("");
    expect(exit).toBe(0);
    expect(stdout.trim()).toBe("[0,1]");
  });
});
