// Shared parsing of LeetCode's `metaData` JSON (function name + typed params +
// return type), language-agnostic so every harness generator (python.ts,
// javascript.ts, ...) derives args the same way. The per-language files turn a
// parsed `MetaData` into their own harness source.

// Parsed shape of LeetCode's `metaData` JSON.
export interface MetaData {
  name: string;
  params: { name: string; type: string }[];
  return: { type: string };
}

// One file a harness generator emits. Most languages produce a single harness
// file (`main.py`/`main.js`/`main.ts`); a compiled language like Rust produces
// several (`Cargo.toml` + `.gitignore` + `main.rs`). Lives here, language-
// agnostic, so both the dispatcher (`index.ts`) and the generators share it.
export interface HarnessFile {
  filename: string;
  content: string;
}

// LeetCode types that need real deserialization we don't do yet. Anything else
// (integer, integer[], integer[][], string, string[], double, boolean,
// character, ...) round-trips correctly through `JSON.parse` / `json.loads`.
export const DEFERRED_TYPES = new Set(["ListNode", "TreeNode"]);

export function baseType(type: string): string {
  // Strip trailing array markers: "integer[][]" -> "integer".
  return type.replace(/(\[\])+$/, "");
}

// True when any param or the return type touches a `DEFERRED_TYPES` member
// (`ListNode`/`TreeNode`), at any array depth. The interpreted harness
// generators (python/js/ts) refuse such a signature — returning no harness
// rather than emitting a broken passthrough that hands a raw `[1,2,3]` array to
// a function expecting a node and crashes confusingly at run time. (Rust uses
// its own `isRustMappable` gate, which also rejects unknown scalars.)
export function hasDeferredType(meta: MetaData): boolean {
  return (
    DEFERRED_TYPES.has(baseType(meta.return.type)) ||
    meta.params.some((p) => DEFERRED_TYPES.has(baseType(p.type)))
  );
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
