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

  test("is not JSON-normalized — spacing differences fail", () => {
    expect(compareOutput("[1,2]", "[1, 2]")).toBe(false);
  });

  test("distinct values differ", () => {
    expect(compareOutput("3", "4")).toBe(false);
  });
});
