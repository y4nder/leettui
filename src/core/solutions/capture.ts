// Auto-capture writers for Phase 2.2 (TCASE-04/TCASE-05): turn a failing (or
// authoritative) LeetCode `CheckResponse` into local `tests/case-NN.txt`
// (+`case-NN.out`) files, closing the online→offline debug loop (`leettui
// test` immediately reproduces/grades a captured case, no LeetCode
// round-trip).
//
// Two siblings, not a new "capture engine": `captureFailingCase` (submit-side
// new-case writer, D-01/D-03/D-04/D-05/D-06) reuses `addCase` for numbering/
// input-writing (`./add-case`) and `discoverCases`/`compareOutput`/`normalize`
// for content-matching/grading (`../testRunner`) — exactly the primitives
// Phase 2.1 already built. `blessRunOutputs` (run-side, D-02/D-07) fills
// missing `.out`s for existing seeded cases by content match, never index.
//
// Mirrors `save-output.ts`/`add-case.ts`'s never-throws / dir-injected /
// outcome-type idiom exactly — synchronous `node:fs`, no try/catch (a
// resolvable path doesn't throw in practice; same documented rationale as
// `seedTests`/`saveGoldenOutputs`).
//
// Security invariant (T-02.2-01): a write path is only ever built from
// `nextCaseName`'s generated `case-NN` name (via `addCase`) or an existing
// `DiscoveredCase.name` — `CheckResponse` string content (`last_testcase`,
// `expected_output`, `expected_code_answer[]`, `exampleTestcaseList[i]`) is
// only ever written as file CONTENT, never interpolated into a path segment.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addCase } from "@/core/solutions/add-case";
import { compareOutput, discoverCases, normalize } from "@/core/testRunner";

export type CaptureOutcome = "captured" | "blessed" | "duplicate" | "mismatch";

export interface CaptureResult {
  name: string;
  outcome: CaptureOutcome;
  note: string;
}

// Content-match a normalized `input` against every existing case's `.txt`
// (D-04/D-07) — never by array index/position, since `tests/` may hold
// user-added (`--add-case`) or previously-captured cases interleaved with the
// originally-seeded example cases.
function findCaseByInput(testsDir: string, input: string) {
  const target = normalize(input);
  return discoverCases(testsDir).find(
    (c) => normalize(readFileSync(c.inputPath, "utf-8")) === target,
  );
}

// Submit-side new-case writer. `expectedOutput` undefined means an
// input-only capture (D-03 — RE/TLE/MLE, whose `last_testcase` is present
// without `expected_output`).
//
// No match: writes a new case via `addCase` (reused verbatim, T-02.2-01 —
// the write path is always the generated `case-NN` name, never derived from
// `input`), plus the sibling `.out` when `expectedOutput` is present (D-01).
// Match, no `.out`: fills the missing `.out` (D-05, a fill not a clobber) —
// or, with no `expectedOutput` to fill it with, reports a plain duplicate.
// Match, disagreeing `.out`: never overwritten — a "mismatch" note is
// returned instead (D-06). Match, agreeing/no comparison possible:
// "duplicate".
export function captureFailingCase(
  testsDir: string,
  input: string,
  expectedOutput?: string,
): CaptureResult {
  const existing = findCaseByInput(testsDir, input);

  if (!existing) {
    const path = addCase(testsDir, input);
    const name = path.split("/").pop()?.replace(".txt", "") ?? "";
    if (expectedOutput !== undefined) {
      writeFileSync(join(testsDir, `${name}.out`), expectedOutput);
      return { name, outcome: "captured", note: `Captured ${name} (input + expected)` };
    }
    return { name, outcome: "captured", note: `Captured ${name} (input only)` };
  }

  if (!existing.expectedPath) {
    if (expectedOutput === undefined) {
      return {
        name: existing.name,
        outcome: "duplicate",
        note: `${existing.name} already captured`,
      };
    }
    // D-05: fill the missing sibling .out, never write a duplicate case.
    writeFileSync(join(testsDir, `${existing.name}.out`), expectedOutput);
    return { name: existing.name, outcome: "blessed", note: `Blessed ${existing.name}.out` };
  }

  if (expectedOutput !== undefined) {
    const prev = readFileSync(existing.expectedPath, "utf-8");
    if (!compareOutput(expectedOutput, prev)) {
      // D-06: never overwrite a disagreeing .out — surface, don't write.
      return {
        name: existing.name,
        outcome: "mismatch",
        note: `${existing.name}.out disagrees with LeetCode's expected output`,
      };
    }
  }
  return { name: existing.name, outcome: "duplicate", note: `${existing.name} already captured` };
}

// Run-side blessing: fills missing `.out`s for existing seeded cases from
// `expectedCodeAnswer[]`, matched to the local case by normalized
// `exampleTestcaseList[i]` content — never by index (D-07), since `tests/`
// order can diverge from the run's `exampleTestcaseList` order the moment a
// case is added/reordered/captured. A matched case that already has a `.out`
// is skipped (never overwritten); an unmatched answer is simply not written;
// `expectedCodeAnswer` undefined/empty returns [].
export function blessRunOutputs(
  testsDir: string,
  exampleTestcaseList: string[],
  expectedCodeAnswer?: string[],
): CaptureResult[] {
  if (!expectedCodeAnswer || expectedCodeAnswer.length === 0) return [];
  const cases = discoverCases(testsDir);
  const results: CaptureResult[] = [];
  for (let i = 0; i < exampleTestcaseList.length; i++) {
    const answer = expectedCodeAnswer[i];
    const input = exampleTestcaseList[i];
    if (answer === undefined || input === undefined) continue;
    const target = normalize(input);
    const match = cases.find((c) => normalize(readFileSync(c.inputPath, "utf-8")) === target);
    if (!match || match.expectedPath) continue; // D-07: content match; skip if already has a .out
    writeFileSync(join(testsDir, `${match.name}.out`), answer);
    results.push({ name: match.name, outcome: "blessed", note: `Blessed ${match.name}.out` });
  }
  return results;
}
