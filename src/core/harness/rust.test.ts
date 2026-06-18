import { describe, expect, test } from "bun:test";
import { generateHarness } from "./index";
import { parseMetaData } from "./meta";
import {
  generateRustHarness,
  isRustMappable,
  prepareRustSolution,
  renderRustArgReads,
  rustReturnType,
  rustType,
} from "./rust";
import { prepareSolutionSnippet } from "./index";

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

describe("rustType", () => {
  test("maps each scalar", () => {
    expect(rustType("integer")).toBe("i32");
    expect(rustType("long")).toBe("i64");
    expect(rustType("string")).toBe("String");
    expect(rustType("double")).toBe("f64");
    expect(rustType("boolean")).toBe("bool");
    expect(rustType("character")).toBe("char");
  });

  test("wraps 1-D arrays in Vec", () => {
    expect(rustType("integer[]")).toBe("Vec<i32>");
    expect(rustType("string[]")).toBe("Vec<String>");
  });

  test("wraps 2-D arrays in nested Vec", () => {
    expect(rustType("integer[][]")).toBe("Vec<Vec<i32>>");
    expect(rustType("character[][]")).toBe("Vec<Vec<char>>");
  });

  test("returns null for deferred types (ListNode/TreeNode), even as arrays", () => {
    expect(rustType("ListNode")).toBeNull();
    expect(rustType("TreeNode")).toBeNull();
    expect(rustType("TreeNode[]")).toBeNull();
  });

  test("returns null for unknown scalars", () => {
    expect(rustType("widget")).toBeNull();
  });
});

describe("rustReturnType", () => {
  test("maps a concrete return type", () => {
    expect(rustReturnType(parseMetaData(TWO_SUM))).toBe("Vec<i32>");
  });

  test("maps void to the unit type", () => {
    expect(rustReturnType(parseMetaData(MATRIX_PARAM))).toBe("()");
  });

  test("returns null when the return type is deferred", () => {
    expect(rustReturnType(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("isRustMappable", () => {
  test("true for an all-scalar/array signature", () => {
    expect(isRustMappable(parseMetaData(TWO_SUM))).toBe(true);
    expect(isRustMappable(parseMetaData(SCALARS))).toBe(true);
    expect(isRustMappable(parseMetaData(MATRIX_PARAM))).toBe(true);
  });

  test("false when a param is a deferred type", () => {
    expect(isRustMappable(parseMetaData(LISTNODE_PARAM))).toBe(false);
  });

  test("false when the return is a deferred type", () => {
    expect(isRustMappable(parseMetaData(TREENODE_RETURN))).toBe(false);
  });
});

describe("renderRustArgReads", () => {
  test("emits a typed serde_json::from_str line per positional arg", () => {
    const reads = renderRustArgReads(parseMetaData(TWO_SUM));
    expect(reads).toBe(
      [
        "    let nums: Vec<i32> = serde_json::from_str(data[0]).unwrap();",
        "    let target: i32 = serde_json::from_str(data[1]).unwrap();",
      ].join("\n"),
    );
  });

  test("maps every scalar in the read lines", () => {
    const reads = renderRustArgReads(parseMetaData(SCALARS));
    expect(reads).toContain("let a: i64 = serde_json::from_str(data[0]).unwrap();");
    expect(reads).toContain("let b: String = serde_json::from_str(data[1]).unwrap();");
    expect(reads).toContain("let c: f64 = serde_json::from_str(data[2]).unwrap();");
    expect(reads).toContain("let d: bool = serde_json::from_str(data[3]).unwrap();");
    expect(reads).toContain("let e: char = serde_json::from_str(data[4]).unwrap();");
  });

  test("returns null when any param is unmappable", () => {
    expect(renderRustArgReads(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("generateRustHarness", () => {
  test("emits Cargo.toml + .gitignore + main.rs for a mappable signature", () => {
    const files = generateRustHarness(parseMetaData(TWO_SUM));
    expect(files).not.toBeNull();
    expect(files!.map((f) => f.filename)).toEqual(["Cargo.toml", ".gitignore", "main.rs"]);
  });

  test("Cargo.toml declares the flat [[bin]] and the serde_json dep", () => {
    const files = generateRustHarness(parseMetaData(TWO_SUM))!;
    const cargo = files.find((f) => f.filename === "Cargo.toml")!.content;
    expect(cargo).toContain("[[bin]]");
    expect(cargo).toContain('name = "main"');
    expect(cargo).toContain('path = "main.rs"');
    expect(cargo).toContain('serde_json = "1"');
  });

  test("Cargo.toml declares a default-on harness feature (gates the LSP shim)", () => {
    const cargo = generateRustHarness(parseMetaData(TWO_SUM))!.find(
      (f) => f.filename === "Cargo.toml",
    )!.content;
    expect(cargo).toContain('default = ["harness"]');
    expect(cargo).toContain("harness = []");
  });

  test(".gitignore ignores the build dir", () => {
    const files = generateRustHarness(parseMetaData(TWO_SUM))!;
    expect(files.find((f) => f.filename === ".gitignore")!.content).toBe("/target\n");
  });

  test("main.rs pulls in solution.rs as a real module (mod, not include!) and drives it via serde", () => {
    const files = generateRustHarness(parseMetaData(TWO_SUM))!;
    const main = files.find((f) => f.filename === "main.rs")!.content;
    expect(main).toContain("mod solution;");
    expect(main).toContain("use solution::Solution;");
    // No `include!` — that's what broke rust-analyzer completion on solution.rs.
    expect(main).not.toContain("include!");
    expect(main).toContain("let nums: Vec<i32> = serde_json::from_str(data[0]).unwrap();");
    expect(main).toContain("let target: i32 = serde_json::from_str(data[1]).unwrap();");
    expect(main).toContain("serde_json::to_string(&result)");
  });

  test("calls the snake_case fn LeetCode emits, not the camelCase metaData name", () => {
    const main = generateRustHarness(parseMetaData(TWO_SUM))!.find(
      (f) => f.filename === "main.rs",
    )!.content;
    expect(main).toContain("Solution::two_sum(nums, target)");
    expect(main).not.toContain("twoSum");
  });

  test("returns null for a deferred-type signature (no compilable harness)", () => {
    expect(generateRustHarness(parseMetaData(LISTNODE_PARAM))).toBeNull();
  });
});

describe("generateHarness dispatcher (rust)", () => {
  test("returns the three-file rust set", () => {
    const out = generateHarness("rust", TWO_SUM);
    expect(out).not.toBeNull();
    expect(out!.files.map((f) => f.filename)).toEqual(["Cargo.toml", ".gitignore", "main.rs"]);
  });

  test("returns null for a deferred signature", () => {
    expect(generateHarness("rust", LISTNODE_PARAM)).toBeNull();
  });
});

describe("prepareRustSolution / prepareSolutionSnippet", () => {
  const SNIPPET = "impl Solution {\n    pub fn two_sum() {}\n}";

  test("prepends the cfg-gated struct so solution.rs is a real module", () => {
    expect(prepareRustSolution(SNIPPET)).toBe(
      `#[cfg(feature = "harness")]\npub struct Solution;\n\n${SNIPPET}`,
    );
  });

  test("prepareSolutionSnippet shims rust but passes other languages through unchanged", () => {
    expect(prepareSolutionSnippet("rust", SNIPPET)).toBe(prepareRustSolution(SNIPPET));
    expect(prepareSolutionSnippet("python3", "class Solution: pass")).toBe("class Solution: pass");
    expect(prepareSolutionSnippet("javascript", "var twoSum = function() {};")).toBe(
      "var twoSum = function() {};",
    );
  });
});
