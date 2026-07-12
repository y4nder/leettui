import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pairCases, compareOutput } from "@/core/testRunner";
import { generateHarness, getRunnerSpec, prepareSolutionSnippet } from "@/core/harness";

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

describe("rust RunnerSpec", () => {
  test("registers a compile phase + the produced binary as the per-case command", () => {
    expect(getRunnerSpec("rust")).toEqual({
      harnessFilename: "main.rs",
      command: ["./target/debug/main"],
      compile: { command: ["cargo", "build", "--quiet"] },
    });
  });
});

// The compiled-language proof: drive a real `solution.rs` through the generated
// harness exactly as `runLocalTests` does — run `compile.command` once to produce
// the binary, then spawn `command` (NOT appending `harnessFilename`) on a stdin
// case. Gated on `cargo` being on PATH so CI without a Rust toolchain skips it
// rather than failing; the first build also fetches serde from crates.io, so this
// needs network and is intentionally slow.
const HAS_CARGO = Bun.which("cargo") !== null;
const TWO_SUM = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
});

describe.if(HAS_CARGO)("rust end-to-end execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "leettui-rs-harness-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test(
    "a real solution.rs compiles once and runs a stdin case",
    async () => {
      const harness = generateHarness("rust", TWO_SUM)!;
      for (const file of harness.files) {
        writeFileSync(join(dir, file.filename), file.content);
      }
      // LeetCode's bare `impl Solution` (snake_case fn the harness call
      // `Solution::two_sum` resolves against), written through the create-flow's
      // snippet transform so it carries the `#[cfg(feature = "harness")] struct
      // Solution;` the new `mod solution; use solution::Solution;` main.rs needs to
      // resolve. This proves the feature-on local build path compiles + runs.
      writeFileSync(
        join(dir, "solution.rs"),
        prepareSolutionSnippet(
          "rust",
          `impl Solution {
    pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {
        for i in 0..nums.len() {
            for j in (i + 1)..nums.len() {
                if nums[i] + nums[j] == target {
                    return vec![i as i32, j as i32];
                }
            }
        }
        vec![]
    }
}`,
        ),
      );

      const spec = getRunnerSpec("rust")!;

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
