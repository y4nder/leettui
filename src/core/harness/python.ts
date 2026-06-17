// Python harness generator. Turns LeetCode `metaData` (function name + typed
// params + return type) into a self-contained `main.py` that:
//   - reads one JSON value per line from stdin,
//   - parses each into the matching positional argument,
//   - calls `Solution().{fn}(...)`,
//   - prints the result as JSON.
//
// The item-4 local runner feeds a `tests/case-NN.txt` file on stdin
// (`python3 main.py < tests/case-01.txt`) with cwd set to the language folder
// so `from solution import Solution` resolves.

import type { MetaData } from "./meta";

// Only called for a signature of round-trippable types (scalars/arrays) — the
// dispatcher (`index.ts`) refuses `ListNode`/`TreeNode` before reaching here, so
// every param parses straight through `json.loads`.
export function generatePythonHarness(meta: MetaData): string {
  const argReads = meta.params.map((p, i) => {
    return `    ${p.name} = json.loads(data[${i}])  # ${p.type}`;
  });

  const argList = meta.params.map((p) => p.name).join(", ");

  return `import sys
import json

from solution import Solution


def main():
    data = sys.stdin.read().splitlines()
${argReads.join("\n")}
    result = Solution().${meta.name}(${argList})
    print(json.dumps(result))


if __name__ == "__main__":
    main()
`;
}
