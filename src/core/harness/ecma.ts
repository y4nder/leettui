// Shared skeleton for the ECMAScript-family harness generators (`javascript.ts`
// + `typescript.ts`). Both emit a harness that reads one JSON value per stdin
// line, calls the solution's `{fn}(...)`, and prints the result as JSON; they
// differ only in how `loadSolution()` obtains the function from the sibling
// solution file (plain-text eval for JS, transpile-then-eval for TS). The
// arg-reading and `main()` body are identical, so they live here and each
// language file passes in just its `loadSolution()` definition.

import type { MetaData } from "./meta";

// Renders the `const x = JSON.parse(data[i]);` lines (2-space indented) with a
// trailing type comment. Only called for round-trippable signatures — the
// dispatcher (`index.ts`) refuses `ListNode`/`TreeNode` before reaching here, so
// every param parses straight through `JSON.parse`.
export function renderArgReads(meta: MetaData): string {
  return meta.params
    .map((p, i) => `  const ${p.name} = JSON.parse(data[${i}]); // ${p.type}`)
    .join("\n");
}

// Assembles a full harness from a language-specific `loadSolution()` definition
// (a complete function declaration as source text).
export function generateEcmaHarness(meta: MetaData, loadSolutionFn: string): string {
  const argList = meta.params.map((p) => p.name).join(", ");

  return `const fs = require("fs");
const path = require("path");

${loadSolutionFn}

function main() {
  const data = fs.readFileSync(0, "utf8").split(/\\r?\\n/);
${renderArgReads(meta)}
  const result = loadSolution()(${argList});
  console.log(JSON.stringify(result ?? null));
}

main();
`;
}
