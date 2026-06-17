// LeetCode → Rust type mapping for the Rust local harness (Stage 14). Unlike the
// interpreted harnesses (`python.ts`/`ecma.ts`), which pass JSON straight through
// (`json.loads`/`JSON.parse` → call → print), Rust is statically typed: each arg
// must be `serde_json::from_str::<T>(line)` against the *exact* concrete type from
// the solution signature, and the result `serde_json::to_string`-ed. That needs a
// LeetCode-type → Rust-type map, which lives here (mirroring `ecma.ts` owning the
// JS/TS skeleton). The type map + arg-read renderers are the pure seam (item 1);
// `generateRustHarness` (item 2) assembles them into the `Cargo.toml`/`.gitignore`/
// `main.rs` file set that `index.ts` dispatches and `create.ts` writes.

import { type HarnessFile, type MetaData, DEFERRED_TYPES, baseType } from "./meta";

// LeetCode scalar metaData types → their concrete serde-deserializable Rust types.
// A JSON number/string/bool round-trips into these via `serde_json::from_str`:
// a 1-char JSON string deserializes into `char`, a JSON array into `Vec<…>`.
const SCALAR_MAP: Record<string, string> = {
  integer: "i32",
  long: "i64",
  string: "String",
  double: "f64",
  boolean: "bool",
  character: "char",
};

// Maps a LeetCode metaData type to a concrete Rust type for serde, or null when
// the type isn't mappable — a deferred `ListNode`/`TreeNode` (no real deserializer
// yet, and a non-mappable type is a *compile* error in Rust, not a passthrough) or
// an unknown scalar. Array markers nest into `Vec<…>`: "integer[]" → "Vec<i32>",
// "integer[][]" → "Vec<Vec<i32>>".
export function rustType(leetType: string): string | null {
  const base = baseType(leetType);
  if (DEFERRED_TYPES.has(base)) return null;
  const scalar = SCALAR_MAP[base];
  if (!scalar) return null;
  const depth = (leetType.match(/\[\]/g) ?? []).length;
  let t = scalar;
  for (let i = 0; i < depth; i++) t = `Vec<${t}>`;
  return t;
}

// The Rust type of the solution's return value. A `void` return (in-place problems
// like `setZeroes`) maps to `()` so the harness still compiles and prints `null` —
// consistent with the dynamic harnesses, which emit `json.dumps(None)`. Returns
// null when the declared return type is unmappable (a deferred type).
export function rustReturnType(meta: MetaData): string | null {
  return meta.return.type === "void" ? "()" : rustType(meta.return.type);
}

// True when every param type and the return type maps to a concrete Rust type.
// A signature touching any `DEFERRED_TYPES` member (or an unknown scalar) is
// unmappable, so item 2's generator emits a blank `solution.rs` stub (no harness)
// rather than uncompilable Rust.
export function isRustMappable(meta: MetaData): boolean {
  return rustReturnType(meta) !== null && meta.params.every((p) => rustType(p.type) !== null);
}

// Renders the per-arg deserialization lines (4-space indented for a Rust `main`):
//   `    let {name}: {T} = serde_json::from_str(data[{i}]).unwrap();`
// `data[i]` is the i-th stdin line (a `&str`), supplied by the item-2 harness.
// Returns null when any param is unmappable (so the caller falls back to a stub).
export function renderRustArgReads(meta: MetaData): string | null {
  const lines = meta.params.map((p, i) => {
    const t = rustType(p.type);
    return t === null
      ? null
      : `    let ${p.name}: ${t} = serde_json::from_str(data[${i}]).unwrap();`;
  });
  return lines.includes(null) ? null : lines.join("\n");
}

// LeetCode's `metaData.name` is camelCase (`twoSum`), but the Rust `impl
// Solution` it hands you defines the fn in snake_case (`two_sum`). The harness
// calls `Solution::{fn}`, so the name must be converted or it won't compile.
function toSnakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "");
}

// Assembles the full Rust harness file set for a mappable signature, or null
// when item-1's gate (`isRustMappable`) rejects it (a deferred `ListNode`/
// `TreeNode` or unknown scalar) — the caller then writes a blank `solution.rs`
// stub, since a non-mappable type is a hard *compile* error in Rust.
//
// Three files (the flat, build-verified layout from the stage plan):
//   - `Cargo.toml` — `[package]` + a `[[bin]]` pointing at `main.rs` (no `src/`)
//     + the one `serde_json` dependency the deserialization needs;
//   - `.gitignore` — ignores the per-problem `/target` build dir (Stage-10 the
//     solutions tree is git-pushable, and `target/` bloat shouldn't ride along);
//   - `main.rs` — reads stdin lines into `data`, runs item-1's typed
//     `serde_json::from_str` per arg, calls `Solution::{fn}(...)`, and prints
//     `serde_json::to_string(&result)`. `struct Solution;` + `include!` pulls in
//     the un-modified, byte-for-byte-submittable `solution.rs` (the same "load
//     the solution without touching it" trick as the JS/TS harnesses). A `void`
//     return maps to `()`, whose JSON is `null` — matching the dynamic harnesses.
export function generateRustHarness(meta: MetaData): HarnessFile[] | null {
  const argReads = renderRustArgReads(meta);
  if (argReads === null || !isRustMappable(meta)) return null;

  const fn = toSnakeCase(meta.name);
  const argList = meta.params.map((p) => p.name).join(", ");

  const cargoToml = `[package]
name = "main"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "main"
path = "main.rs"

[dependencies]
serde_json = "1"
`;

  const gitignore = "/target\n";

  const mainRs = `use std::io::{self, Read};

struct Solution;
include!("solution.rs");

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let data: Vec<&str> = input.lines().collect();
${argReads}
    let result = Solution::${fn}(${argList});
    println!("{}", serde_json::to_string(&result).unwrap());
}
`;

  return [
    { filename: "Cargo.toml", content: cargoToml },
    { filename: ".gitignore", content: gitignore },
    { filename: "main.rs", content: mainRs },
  ];
}
