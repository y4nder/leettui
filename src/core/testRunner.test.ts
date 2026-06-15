import { describe, expect, test } from "bun:test";
import { pairCases, compareOutput } from "./testRunner";

describe("pairCases", () => {
  test("pairs inputs with their .out siblings, sorted", () => {
    const files = ["case-02.txt", "case-01.txt", "case-01.out"];
    expect(pairCases(files)).toEqual([
      { name: "case-01", hasExpected: true },
      { name: "case-02", hasExpected: false },
    ]);
  });

  test("ignores non-case files and stray .out without an input", () => {
    const files = ["case-01.txt", "notes.md", "case-99.out", "README"];
    expect(pairCases(files)).toEqual([{ name: "case-01", hasExpected: false }]);
  });

  test("empty dir yields no cases", () => {
    expect(pairCases([])).toEqual([]);
  });
});

describe("compareOutput", () => {
  test("ignores trailing whitespace and newlines", () => {
    expect(compareOutput("[1, 2]\n", "[1, 2]")).toBe(true);
    expect(compareOutput("[1, 2]", "[1, 2]   \n\n")).toBe(true);
  });

  test("normalizes CRLF", () => {
    expect(compareOutput("a\r\nb", "a\nb")).toBe(true);
  });

  test("is JSON-normalized — spacing differences match", () => {
    // The harness emits compact `[0,1]`; a copied `.out` uses display spacing.
    expect(compareOutput("[0,1]", "[0, 1]")).toBe(true);
    expect(compareOutput('{"a":1,"b":2}', '{ "b": 2, "a": 1 }')).toBe(true);
    expect(compareOutput("1.0", "1")).toBe(true);
  });

  test("JSON-normalized values that actually differ still fail", () => {
    expect(compareOutput("[0,1]", "[1,0]")).toBe(false);
    expect(compareOutput("3", "4")).toBe(false);
  });

  test("falls back to string equality for non-JSON output", () => {
    expect(compareOutput("hello", "hello")).toBe(true);
    expect(compareOutput("hello", "world")).toBe(false);
  });
});
