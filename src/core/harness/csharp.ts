// LeetCode → C# type mapping for the C# local harness (Stage 17, the *second*
// compiled language after rust). Like rust (`rust.ts`), C# is statically typed,
// so each arg must be `JsonSerializer.Deserialize<T>(line)` against the *exact*
// concrete type from the solution signature, and the result `Serialize`-d. That
// needs a LeetCode-type → C#-type map, which lives here (mirroring `rust.ts`).
// The type map + arg-read renderers are the pure seam (item 1);
// `generateCsharpHarness` (item 2) assembles them into the `main.csproj`/
// `.gitignore`/`main.cs` file set that `index.ts` dispatches and `create.ts`
// writes. Unlike rust's serde, `System.Text.Json` ships in the framework — the
// `.csproj` needs no NuGet `PackageReference`, so the first build is offline.

import { type HarnessFile, type MetaData, DEFERRED_TYPES, baseType } from "./meta";

// LeetCode scalar metaData types → their concrete C# types. A JSON number/string/
// bool round-trips into these via `JsonSerializer.Deserialize<T>`: a 1-char JSON
// string deserializes into `char`, a JSON array into a C# array (`T[]`).
const SCALAR_MAP: Record<string, string> = {
  integer: "int",
  long: "long",
  string: "string",
  double: "double",
  boolean: "bool",
  character: "char",
};

// Maps a LeetCode metaData type to a concrete C# type for System.Text.Json, or
// null when the type isn't mappable — a deferred `ListNode`/`TreeNode` (no real
// deserializer yet, and a non-mappable type is a *compile* error in C#, not a
// passthrough) or an unknown scalar. Array markers append `[]` per depth:
// "integer[]" → "int[]", "integer[][]" → "int[][]".
export function csharpType(leetType: string): string | null {
  const base = baseType(leetType);
  if (DEFERRED_TYPES.has(base)) return null;
  const scalar = SCALAR_MAP[base];
  if (!scalar) return null;
  const depth = (leetType.match(/\[\]/g) ?? []).length;
  return scalar + "[]".repeat(depth);
}

// The C# type of the solution's return value. A `void` return (in-place problems
// like `setZeroes`) is kept as the literal `"void"` so item-2's generator can
// special-case it — calling the method without assigning a result and printing
// `null`, the analogue of rust's `()`→`null` and the dynamic harnesses' `None`.
// Returns null when the declared return type is unmappable (a deferred type).
export function csharpReturnType(meta: MetaData): string | null {
  return meta.return.type === "void" ? "void" : csharpType(meta.return.type);
}

// True when every param type and the return type maps to a concrete C# type.
// A signature touching any `DEFERRED_TYPES` member (or an unknown scalar) is
// unmappable, so item 2's generator emits a blank `solution.cs` stub (no harness)
// rather than uncompilable C#.
export function isCsharpMappable(meta: MetaData): boolean {
  return csharpReturnType(meta) !== null && meta.params.every((p) => csharpType(p.type) !== null);
}

// Renders the per-arg deserialization lines (8-space indented for the body of a
// `Program.Main`):
//   `        {T} {name} = JsonSerializer.Deserialize<{T}>(lines[{i}]);`
// `lines[i]` is the i-th stdin line (a string), supplied by the item-2 harness.
// Returns null when any param is unmappable (so the caller falls back to a stub).
export function renderCsharpArgReads(meta: MetaData): string | null {
  const lines = meta.params.map((p, i) => {
    const t = csharpType(p.type);
    return t === null
      ? null
      : `        ${t} ${p.name} = JsonSerializer.Deserialize<${t}>(lines[${i}]);`;
  });
  return lines.includes(null) ? null : lines.join("\n");
}

// LeetCode's `metaData.name` is camelCase (`twoSum`), but the C# `class Solution`
// it hands you defines the method in PascalCase (`TwoSum`). The harness calls
// `new Solution().{Method}`, so the name must be converted or it won't compile
// (the C# analogue of rust's snake_case fix).
function toPascalCase(name: string): string {
  return name.length === 0 ? name : name[0]!.toUpperCase() + name.slice(1);
}

// Assembles the full C# harness file set for a mappable signature, or null when
// item-1's gate (`isCsharpMappable`) rejects it (a deferred `ListNode`/`TreeNode`
// or unknown scalar) — the caller then writes a blank `solution.cs` stub, since a
// non-mappable type is a hard *compile* error in C#.
//
// Three files:
//   - `main.csproj` — `<OutputType>Exe</OutputType>` + a `TargetFramework` that
//     adapts to the installed SDK (`net$(NETCoreSdkVersion.Split('.')[0]).0` →
//     `net9.0` on a .NET 9 machine, `net10.0` on .NET 10, …) so the framework
//     reference pack always resolves. A hardcoded `net9.0` produced CS0518
//     ("predefined type System.Object is not defined") in the editor's C# LSP on
//     machines whose only SDK was a *different* major (no net9.0 ref pack ⇒ zero
//     framework references resolved). The `.Split('.')[0]` (vs. `Version.Parse`)
//     survives preview SDK strings like `10.0.100-preview.1`. Plus implicit
//     usings (mirrors LeetCode's C# environment so a bare snippet using `List<>`
//     etc. compiles) + `<AssemblyName>main</AssemblyName>` so the built apphost is
//     `out/main`. No `PackageReference`: System.Text.Json is in the framework.
//   - `.gitignore` — ignores the per-problem build dirs (`bin/`/`obj/`/`out/`);
//     Stage-10 the solutions tree is git-pushable, so build bloat shouldn't ride.
//   - `main.cs` — reads stdin lines, runs item-1's typed `Deserialize` per arg,
//     calls `new Solution().{Method}(...)`, and prints `JsonSerializer.Serialize`
//     of the result. `solution.cs` (the LeetCode snippet) is co-compiled by the
//     project (dotnet builds every `.cs`), so it stays byte-for-byte submittable
//     with no wrapper — the C# analogue of rust's `include!`/the JS `new Function`
//     trick. A `void` return calls the method without assignment and prints
//     `null` (matching rust's `()`).
export function generateCsharpHarness(meta: MetaData): HarnessFile[] | null {
  const argReads = renderCsharpArgReads(meta);
  const ret = csharpReturnType(meta);
  if (argReads === null || ret === null) return null;

  const method = toPascalCase(meta.name);
  const argList = meta.params.map((p) => p.name).join(", ");

  const call =
    ret === "void"
      ? `        new Solution().${method}(${argList});\n        Console.WriteLine("null");`
      : `        var result = new Solution().${method}(${argList});\n        Console.WriteLine(JsonSerializer.Serialize(result));`;

  const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net$(NETCoreSdkVersion.Split('.')[0]).0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>disable</Nullable>
    <AssemblyName>main</AssemblyName>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
`;

  const gitignore = "bin/\nobj/\nout/\n";

  const mainCs = `using System;
using System.Text.Json;

public class Program
{
    public static void Main()
    {
        var lines = Console.In.ReadToEnd().Split('\\n');
${argReads}
${call}
    }
}
`;

  return [
    { filename: "main.csproj", content: csproj },
    { filename: ".gitignore", content: gitignore },
    { filename: "main.cs", content: mainCs },
  ];
}
