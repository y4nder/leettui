// Shared skeleton for the ECMAScript-family harness generators (`javascript.ts`
// + `typescript.ts`). Both emit a harness that reads one JSON value per stdin
// line, calls the solution's `{fn}(...)`, and prints the result as JSON; they
// differ only in how `loadSolution()` obtains the function from the sibling
// solution file (plain-text eval for JS, transpile-then-eval for TS). The
// arg-reading and `main()` body are identical, so they live here and each
// language file passes in just its `loadSolution()` definition.

import { type MetaData, DEFERRED_TYPES, baseType } from "./meta";

// Renders the `const x = JSON.parse(data[i]);` lines (2-space indented) with a
// trailing type comment, and a TODO for the not-yet-deserialized ListNode/
// TreeNode params (passed through raw, mirroring the Python harness).
export function renderArgReads(meta: MetaData): string {
  return meta.params
    .map((p, i) => {
      const deferred = DEFERRED_TYPES.has(baseType(p.type));
      const comment = deferred
        ? ` // ${p.type} — TODO: deserialize ${baseType(p.type)}`
        : ` // ${p.type}`;
      return `  const ${p.name} = JSON.parse(data[${i}]);${comment}`;
    })
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
