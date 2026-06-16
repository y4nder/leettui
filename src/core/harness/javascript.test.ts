import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseMetaData } from "./meta";
import { generateJavascriptHarness } from "./javascript";
import { generateHarness, getRunnerSpec } from "./index";

const TWO_SUM = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
});

const STRING_PARAM = JSON.stringify({
  name: "lengthOfLongestSubstring",
  params: [{ name: "s", type: "string" }],
  return: { type: "integer" },
});

const MATRIX_PARAM = JSON.stringify({
  name: "setZeroes",
  params: [{ name: "matrix", type: "integer[][]" }],
  return: { type: "void" },
});

const LISTNODE_PARAM = JSON.stringify({
  name: "reverseList",
  params: [{ name: "head", type: "ListNode" }],
  return: { type: "ListNode" },
});

describe("generateJavascriptHarness", () => {
  test("reads one json value per param and calls fn(...)", () => {
    const src = generateJavascriptHarness(parseMetaData(TWO_SUM));
    expect(src).toContain("const nums = JSON.parse(data[0]);");
    expect(src).toContain("const target = JSON.parse(data[1]);");
    expect(src).toContain("return new Function(src + ");
    expect(src).toContain("return twoSum;");
    expect(src).toContain("const result = loadSolution()(nums, target);");
    expect(src).toContain("console.log(JSON.stringify(result ?? null));");
  });

  test("handles a single string param", () => {
    const src = generateJavascriptHarness(parseMetaData(STRING_PARAM));
    expect(src).toContain("const s = JSON.parse(data[0]);");
    expect(src).toContain("return lengthOfLongestSubstring;");
    expect(src).toContain("loadSolution()(s)");
  });

  test("handles a matrix (integer[][]) param via JSON.parse", () => {
    const src = generateJavascriptHarness(parseMetaData(MATRIX_PARAM));
    expect(src).toContain("const matrix = JSON.parse(data[0]);");
    expect(src).toContain("loadSolution()(matrix)");
  });

  test("ListNode param is passed through raw with a TODO comment", () => {
    const src = generateJavascriptHarness(parseMetaData(LISTNODE_PARAM));
    expect(src).toContain("const head = JSON.parse(data[0]);");
    expect(src).toContain("TODO: deserialize ListNode");
  });
});

describe("generateHarness dispatcher (javascript)", () => {
  test("returns main.js for javascript", () => {
    const out = generateHarness("javascript", TWO_SUM);
    expect(out).not.toBeNull();
    expect(out!.filename).toBe("main.js");
    expect(out!.content).toContain("return twoSum;");
  });

  test("registers a node runner spec for javascript", () => {
    expect(getRunnerSpec("javascript")).toEqual({
      harnessFilename: "main.js",
      command: ["node"],
    });
  });
});

// The assertion that actually matters: a real, filled-in `solution.js` loaded
// via `new Function` and driven by the generated harness under the real
// interpreter, fed a real stdin case — exactly the item-4 runner's contract.
describe("end-to-end execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "leettui-js-harness-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("a bare LeetCode-style solution.js runs against a stdin case", async () => {
    const harness = generateHarness("javascript", TWO_SUM)!;
    writeFileSync(join(dir, harness.filename), harness.content);
    writeFileSync(
      join(dir, "solution.js"),
      `var twoSum = function(nums, target) {
  const seen = {};
  for (let i = 0; i < nums.length; i++) {
    const c = target - nums[i];
    if (c in seen) return [seen[c], i];
    seen[nums[i]] = i;
  }
};`,
    );
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9\n");

    const spec = getRunnerSpec("javascript")!;
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
