// Language dispatcher for local test harness generation. Given a langSlug and
// the problem's raw `metaData` JSON, returns the harness file to write next to
// `solution.{ext}`, or null when the language is unsupported or the metaData is
// unusable. Never throws — solution creation must not fail on a bad harness.
//
// Supported: `python3` (Stage 7 item 3), `javascript` (item 5), `typescript`,
// `rust` (Stage 14 — the first compiled language), and `csharp` (Stage 17 — the
// second). Adding a language is one `case` below + one `RUNNERS` entry — the
// runner stays unchanged.

import { type HarnessFile, type MetaData, hasDeferredType, parseMetaData } from "./meta";
import { generatePythonHarness } from "./python";
import { generateJavascriptHarness } from "./javascript";
import { generateTypescriptHarness } from "./typescript";
import { generateRustHarness, prepareRustSolution } from "./rust";
import { generateCsharpHarness } from "./csharp";
import { generateJavaHarness, prepareJavaSolution } from "./java";

// A harness is a *set* of files, because a compiled language needs more than the
// single interpreter-run script: Rust emits `Cargo.toml` + `.gitignore` +
// `main.rs`. The interpreted languages return a one-element `files` array, so
// the create-flow writer (`create.ts`) iterates uniformly.
export interface GeneratedHarness {
  files: HarnessFile[];
}

export function generateHarness(
  langSlug: string,
  metaDataRaw: string | undefined | null,
): GeneratedHarness | null {
  if (!metaDataRaw) return null;

  let meta: MetaData;
  try {
    meta = parseMetaData(metaDataRaw);
  } catch {
    // Missing/unparseable metaData — skip the harness, keep the solution.
    return null;
  }

  switch (langSlug) {
    // The interpreted languages can only drive types that round-trip through
    // `json.loads`/`JSON.parse` (scalars, arrays). A `ListNode`/`TreeNode` would
    // need a real deserializer we don't have yet, so they refuse outright
    // (no harness) rather than emit a broken passthrough — the runner then shows
    // the honest "use R/s" no-harness message.
    case "python3":
      if (hasDeferredType(meta)) return null;
      return { files: [{ filename: "main.py", content: generatePythonHarness(meta) }] };
    case "javascript":
      if (hasDeferredType(meta)) return null;
      return { files: [{ filename: "main.js", content: generateJavascriptHarness(meta) }] };
    case "typescript":
      if (hasDeferredType(meta)) return null;
      return { files: [{ filename: "main.ts", content: generateTypescriptHarness(meta) }] };
    case "rust": {
      const files = generateRustHarness(meta);
      // null = a deferred/unmappable signature → no harness (blank stub).
      return files ? { files } : null;
    }
    case "csharp": {
      const files = generateCsharpHarness(meta);
      // null = a deferred/unmappable signature → no harness (blank stub).
      return files ? { files } : null;
    }
    case "java": {
      const files = generateJavaHarness(meta);
      // null = a deferred/unmappable signature → no harness (blank stub).
      return files ? { files } : null;
    }
    default:
      return null;
  }
}

// How the local test runner (Stage 7 item 4) executes a language's harness:
// the harness file to invoke and the interpreter argv prefix. Keeping this beside
// `generateHarness` means a new language is one entry here + one `case` above; the
// runner itself stays unchanged. Each `command` (and `compile.command`) is a
// toolchain the user must have on PATH (`python3`/`node`/`bun`/`cargo`) — a
// missing interpreter degrades to a per-case `error`, a missing compiler to the
// runner's one-shot `compile-error` report.
//
// Two execution models share this shape:
//   - **Interpreted** (no `compile`): the runner spawns `[...command,
//     harnessFilename]` per case, cwd = the language folder so the harness can
//     `import` the sibling `solution.*`.
//   - **Compiled** (`compile` present, Stage 14 — rust): the runner runs
//     `compile.command` **once** in the language folder to produce a binary, then
//     spawns `[...command]` per case — `command` already *is* the binary path
//     (`./target/debug/main`), so `harnessFilename` is NOT appended (a trailing
//     source-file arg would be wrong; the binary reads stdin directly).
//     `harnessFilename` still anchors the runner's "no harness generated yet"
//     precheck for both models.
export interface RunnerSpec {
  harnessFilename: string;
  command: string[];
  compile?: { command: string[] };
}

const RUNNERS: Record<string, RunnerSpec> = {
  python3: { harnessFilename: "main.py", command: ["python3"] },
  javascript: { harnessFilename: "main.js", command: ["node"] },
  typescript: { harnessFilename: "main.ts", command: ["bun"] },
  rust: {
    harnessFilename: "main.rs",
    command: ["./target/debug/main"],
    compile: { command: ["cargo", "build", "--quiet"] },
  },
  // C# (Stage 17): `dotnet build -o out` produces the `out/main` apphost (named
  // by `<AssemblyName>main</AssemblyName>`), run directly per case (reads stdin,
  // so `harnessFilename` isn't appended — same as rust's binary). `-v q --nologo`
  // keeps the build output quiet so a real failure's diagnostics stand out.
  csharp: {
    harnessFilename: "main.cs",
    command: ["./out/main"],
    compile: { command: ["dotnet", "build", "-o", "out", "--nologo", "-v", "q"] },
  },
  // Java (Stage 25): `javac solution.java main.java` compiles both sources (no
  // build manifest — the JDK compiles directly) into `Solution.class`/`Main.class`
  // in the cwd; `java -cp . Main` then runs the package-private `Main` per case,
  // reading stdin (so `harnessFilename` isn't appended — same as rust/csharp). The
  // explicit `-cp .` survives an exported `CLASSPATH` (which would otherwise drop
  // the implicit current-dir entry and fail to find `Main`). `javac` is listed
  // with explicit filenames since `Bun.spawn` doesn't glob `*.java`.
  java: {
    harnessFilename: "main.java",
    command: ["java", "-cp", ".", "Main"],
    compile: { command: ["javac", "solution.java", "main.java"] },
  },
};

export function getRunnerSpec(langSlug: string): RunnerSpec | null {
  return RUNNERS[langSlug] ?? null;
}

// Transforms the LeetCode solution snippet before it's written to `solution.{ext}`,
// so a language can adapt the on-disk file for its local tooling without touching the
// submittable shape. Two languages transform: **rust** prepends a `#[cfg]`-gated
// `struct Solution;` so `solution.rs` is a real module rust-analyzer can complete
// (see `prepareRustSolution`), and **java** prepends `import java.util.*;` so a bare
// snippet using `HashMap`/`List` compiles under local `javac` (LeetCode's judge
// auto-imports `java.util`; see `prepareJavaSolution`). Both stay submittable; every
// other language returns the snippet unchanged.
//
// **Couple it to harness presence at the call site** (`create.ts`): the rust shim only
// makes sense alongside the `Cargo.toml` (declaring the `harness` feature) + `main.rs`
// (`mod solution;`) that `generateHarness` carries. An unmappable signature (deferred
// `ListNode`/`TreeNode`) yields a null harness — no manifest — so it must get the plain
// snippet, not a feature-gated line with no feature declared anywhere.
export function prepareSolutionSnippet(langSlug: string, code: string): string {
  if (langSlug === "rust") return prepareRustSolution(code);
  if (langSlug === "java") return prepareJavaSolution(code);
  return code;
}
