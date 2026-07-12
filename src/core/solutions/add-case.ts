// New-case input writer for `leettui test --add-case` (Phase 2.1, TCASE-02).
// Writes a brand-new case's INPUT only (never a `.out` — D-05) as the next
// sequential `case-NN.txt`, so it's picked up by the existing
// `discoverCases`/`pairCases` on the next run with zero runner changes (D-06).
//
// Mirrors `create.ts`'s `seedTests` never-throws / best-effort idiom — no
// try/catch, since `mkdirSync`/`writeFileSync` on a resolvable path don't throw
// in practice.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverCases } from "@/core/testRunner";

// The next `case-NN` base name: max existing index + 1, zero-padded to 2
// digits to match `seedTests`' convention. Not gap-fill — a gap (case-01,
// case-03) still yields case-04, keeping the numbering monotonic and
// collision-free (T-02.1-04). >99 cases is out of scope for LeetCode example
// sets; the numeric max+1 stays correct regardless, only the lexical display
// order would drift past 99, which does not occur here.
export function nextCaseName(testsDir: string): string {
  const nums = discoverCases(testsDir)
    .map((c) => parseInt(c.name.replace("case-", ""), 10))
    .filter(Number.isFinite);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `case-${String(next).padStart(2, "0")}`;
}

// Writes the new case's input verbatim as `{nextCaseName}.txt` and returns its
// absolute path. Creates `testsDir` if absent. Writes ONLY the `.txt` input,
// never a `.out` (D-05) — the expected output is blessed later by `--save`.
export function addCase(testsDir: string, input: string): string {
  mkdirSync(testsDir, { recursive: true });
  const path = join(testsDir, `${nextCaseName(testsDir)}.txt`);
  // Synchronous on purpose: callers read/discover the file immediately after
  // this returns (an unawaited async write loses that race on Windows).
  writeFileSync(path, input);
  return path;
}
