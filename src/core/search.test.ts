import { describe, expect, test } from "bun:test";
import { filterTopics } from "./search";

describe("filterTopics", () => {
  const topics = ["all", "array", "binary-search", "dynamic-programming", "hash-table"];

  test("empty needle returns the list unchanged", () => {
    expect(filterTopics(topics, "")).toEqual(topics);
    expect(filterTopics(topics, "   ")).toEqual(topics);
  });

  test("substring match scores highest / filters out non-matches", () => {
    const r = filterTopics(topics, "arr");
    expect(r).toContain("array");
    expect(r).not.toContain("hash-table");
  });

  test("subsequence (fuzzy) match works", () => {
    // "dp" is a subsequence of "dynamic-programming"
    expect(filterTopics(topics, "dp")).toContain("dynamic-programming");
  });

  test("no match returns empty", () => {
    expect(filterTopics(topics, "zzzz")).toEqual([]);
  });
});
