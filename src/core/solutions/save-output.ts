// Golden-snapshot writer for `leettui test --save` (Phase 2.1, TCASE-01/TCASE-03).
// Consumes the `LocalCaseResult[]` `runLocalTests` already produced (D-12 — no
// re-run, no re-compile) and blesses each cleanly-run case's stdout into a
// sibling `case-NN.out`, jest-`-u` style: overwrite-on-purpose (D-03), never
// touching an unrelated case (D-04), never blessing a crash (D-02).
//
// Mirrors `create.ts`'s `seedTests` never-throws / best-effort idiom — no
// try/catch, since `mkdirSync`/`Bun.write` on a resolvable path don't throw in
// practice.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareOutput } from "@/core/testRunner";
import type { LocalCaseResult } from "@/core/testRunner";

export type SaveOutcome = "created" | "changed" | "unchanged" | "skipped";

export interface SaveResult {
  name: string;
  outcome: SaveOutcome;
}

// Blesses each cleanly-run case's `actual` stdout into its sibling `case-NN.out`
// (jest `-u` model). Only cases with a status that ran cleanly and produced
// output are writable — `error`/`timeout` (or a missing `actual`) are skipped,
// never blessed (D-02): a crash's stderr/partial output must never become the
// expected answer. Overwrite is intentional (D-03); `compareOutput` (the same
// JSON-normalized grading `testRunner.ts` uses to read `.out` files) decides
// changed vs. unchanged so a re-save with only spacing differences doesn't
// falsely report a change. Only `join(testsDir, "{name}.out")` is ever written —
// no user-controlled path segment — so an unrelated sibling case is never
// touched (D-04). Synchronous + total (no try/catch), matching `seedTests`.
export function saveGoldenOutputs(testsDir: string, cases: LocalCaseResult[]): SaveResult[] {
  return cases.map((c): SaveResult => {
    if (c.status === "error" || c.status === "timeout" || c.actual === undefined) {
      return { name: c.name, outcome: "skipped" };
    }
    mkdirSync(testsDir, { recursive: true });
    const path = join(testsDir, `${c.name}.out`);
    const existed = existsSync(path);
    const prev = existed ? readFileSync(path, "utf-8") : null;
    writeFileSync(path, c.actual);
    if (!existed) return { name: c.name, outcome: "created" };
    return {
      name: c.name,
      outcome: compareOutput(c.actual, prev as string) ? "unchanged" : "changed",
    };
  });
}
