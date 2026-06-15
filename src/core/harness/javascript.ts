// JavaScript harness generator (Stage 7 item 5). Turns LeetCode `metaData`
// (function name + typed params + return type) into a self-contained `main.js`
// that reads one JSON value per stdin line, calls the solution's `{fn}(...)`,
// and prints the result as JSON. The shared skeleton lives in `ecma.ts`; this
// file only supplies the JS-specific `loadSolution()`.
//
// LeetCode JS snippets are bare top-level functions (`var twoSum = function`,
// `function twoSum`, `const twoSum = () =>`), never CommonJS-exported — and the
// solution file must stay byte-for-byte submittable, so the harness must not
// require an export. Instead it reads `solution.js` as text and evaluates it
// via `new Function(src + "return {fn};")`, which declares `{fn}` in the
// Function's scope and hands it back. This keeps `solution.js` pristine.
//
// The item-4 local runner feeds a `tests/case-NN.txt` file on stdin
// (`node main.js < tests/case-01.txt`) with cwd set to the language folder, but
// the harness resolves `solution.js` via `__dirname` so it works regardless.

import { type MetaData } from "./meta";
import { generateEcmaHarness } from "./ecma";

export function generateJavascriptHarness(meta: MetaData): string {
  const loadSolution = `// Load the bare LeetCode function from solution.js without requiring it to
// export anything, so solution.js stays exactly as submitted.
function loadSolution() {
  const src = fs.readFileSync(path.join(__dirname, "solution.js"), "utf8");
  return new Function(src + "\\nreturn ${meta.name};")();
}`;

  return generateEcmaHarness(meta, loadSolution);
}
