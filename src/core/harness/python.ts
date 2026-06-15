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

// Parsed shape of LeetCode's `metaData` JSON.
export interface MetaData {
  name: string;
  params: { name: string; type: string }[];
  return: { type: string };
}

// LeetCode types that need real deserialization we don't do yet. Anything else
// (integer, integer[], integer[][], string, string[], double, boolean,
// character, ...) round-trips correctly through `json.loads`.
const DEFERRED_TYPES = new Set(["ListNode", "TreeNode"]);

function baseType(type: string): string {
  // Strip trailing array markers: "integer[][]" -> "integer".
  return type.replace(/(\[\])+$/, "");
}

export function parseMetaData(raw: string): MetaData {
  const data = JSON.parse(raw);
  if (
    !data ||
    typeof data.name !== "string" ||
    !Array.isArray(data.params) ||
    !data.return ||
    typeof data.return.type !== "string"
  ) {
    throw new Error("metaData missing name/params/return");
  }
  return data as MetaData;
}

export function generatePythonHarness(meta: MetaData): string {
  const argReads = meta.params.map((p, i) => {
    const deferred = DEFERRED_TYPES.has(baseType(p.type));
    const comment = deferred
      ? `  # ${p.type} — TODO: deserialize ${baseType(p.type)}`
      : `  # ${p.type}`;
    return `    ${p.name} = json.loads(data[${i}])${comment}`;
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
