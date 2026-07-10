// Golden-snapshot writer for `leettui test --save` (Phase 2.1, TCASE-01/TCASE-03).
// Consumes the `LocalCaseResult[]` `runLocalTests` already produced (D-12 — no
// re-run, no re-compile) and blesses each cleanly-run case's stdout into a
// sibling `case-NN.out`, jest-`-u` style: overwrite-on-purpose (D-03), never
// touching an unrelated case (D-04), never blessing a crash (D-02).
//
// Mirrors `create.ts`'s `seedTests` never-throws / best-effort idiom — no
// try/catch, since `mkdirSync`/`Bun.write` on a resolvable path don't throw in
// practice.

import type { LocalCaseResult } from "../testRunner";

export type SaveOutcome = "created" | "changed" | "unchanged" | "skipped";

export interface SaveResult {
  name: string;
  outcome: SaveOutcome;
}

export function saveGoldenOutputs(_testsDir: string, _cases: LocalCaseResult[]): SaveResult[] {
  return [];
}
