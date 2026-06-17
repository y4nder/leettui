import { describe, expect, test } from "bun:test";
import { parseMetaData } from "./meta";
import { isRustMappable, renderRustArgReads, rustReturnType, rustType } from "./rust";

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
