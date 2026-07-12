// TypeScript harness generator. Same contract as the JS harness (`ecma.ts` +
// `javascript.ts`) — read one JSON value per stdin line, call the solution's
// `{fn}(...)`, print the result as JSON — but the emitted file is a `main.ts`
// run by `bun`, and `loadSolution()` has one extra step.
//
// The JS harness loads the bare un-exported function via `new Function(src +
// "return {fn};")` over the raw file text. That breaks on TypeScript: a snippet
// like `function twoSum(nums: number[], target: number): number[]` is invalid
// JS, so `new Function` throws `Unexpected token ':'`. So the TS harness first
// strips types with `Bun.Transpiler({ loader: "ts" })`, then evals the result —
// keeping `solution.ts` byte-for-byte submittable, exactly like the JS path.
//
// `main.ts` is run by `bun` (the runner registers `command: ["bun"]`); this
// requires `bun` on PATH on the machine running the tests, the same toolchain
// caveat as `node` (JS) / `python3` (Python). A missing interpreter degrades to
// a per-case `error` in the runner, not a crash.

import type { MetaData } from "@/core/harness/meta";
import { generateEcmaHarness } from "@/core/harness/ecma";

export function generateTypescriptHarness(meta: MetaData): string {
  const loadSolution = `// Load the bare LeetCode function from solution.ts without requiring it to
// export anything, so solution.ts stays exactly as submitted. TypeScript type
// annotations are invalid JS, so the source is transpiled before eval.
function loadSolution() {
  const src = fs.readFileSync(path.join(__dirname, "solution.ts"), "utf8");
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(src);
  return new Function(js + "\\nreturn ${meta.name};")();
}`;

  return generateEcmaHarness(meta, loadSolution);
}
