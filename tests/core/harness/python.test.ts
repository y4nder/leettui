import { describe, expect, test } from "bun:test";
import { parseMetaData } from "@/core/harness/meta";
import { generatePythonHarness } from "@/core/harness/python";
import { generateHarness } from "@/core/harness/index";

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

describe("parseMetaData", () => {
  test("parses name, params, and return", () => {
    const meta = parseMetaData(TWO_SUM);
    expect(meta.name).toBe("twoSum");
    expect(meta.params).toEqual([
      { name: "nums", type: "integer[]" },
      { name: "target", type: "integer" },
    ]);
    expect(meta.return.type).toBe("integer[]");
  });

  test("throws on malformed metaData", () => {
    expect(() => parseMetaData("{}")).toThrow();
    expect(() => parseMetaData("not json")).toThrow();
  });
});

describe("generatePythonHarness", () => {
  test("reads one json value per param and calls Solution().fn(...)", () => {
    const src = generatePythonHarness(parseMetaData(TWO_SUM));
    expect(src).toContain("from solution import Solution");
    expect(src).toContain("nums = json.loads(data[0])");
    expect(src).toContain("target = json.loads(data[1])");
    expect(src).toContain("result = Solution().twoSum(nums, target)");
    expect(src).toContain("print(json.dumps(result))");
  });

  test("handles a single string param", () => {
    const src = generatePythonHarness(parseMetaData(STRING_PARAM));
    expect(src).toContain("s = json.loads(data[0])");
    expect(src).toContain("Solution().lengthOfLongestSubstring(s)");
  });

  test("handles a matrix (integer[][]) param via json.loads", () => {
    const src = generatePythonHarness(parseMetaData(MATRIX_PARAM));
    expect(src).toContain("matrix = json.loads(data[0])");
    expect(src).toContain("Solution().setZeroes(matrix)");
  });

  test("no TODO/passthrough branch survives — scalars/arrays only", () => {
    const src = generatePythonHarness(parseMetaData(TWO_SUM));
    expect(src).not.toContain("TODO");
  });
});

describe("generateHarness dispatcher", () => {
  test("returns main.py for python3", () => {
    const out = generateHarness("python3", TWO_SUM);
    expect(out).not.toBeNull();
    expect(out!.files).toHaveLength(1);
    expect(out!.files[0]!.filename).toBe("main.py");
    expect(out!.files[0]!.content).toContain("Solution().twoSum");
  });

  test("returns null for unsupported languages", () => {
    expect(generateHarness("cpp", TWO_SUM)).toBeNull();
    expect(generateHarness("go", TWO_SUM)).toBeNull();
  });

  test("refuses a deferred-type signature (no broken passthrough)", () => {
    const treeReturn = JSON.stringify({
      name: "insertIntoBST",
      params: [{ name: "val", type: "integer" }],
      return: { type: "TreeNode" },
    });
    expect(generateHarness("python3", LISTNODE_PARAM)).toBeNull();
    expect(generateHarness("python3", treeReturn)).toBeNull();
  });

  test("returns null (never throws) on missing or bad metaData", () => {
    expect(generateHarness("python3", undefined)).toBeNull();
    expect(generateHarness("python3", "")).toBeNull();
    expect(generateHarness("python3", "{bad json")).toBeNull();
  });
});
