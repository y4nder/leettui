// Language dispatcher for local test harness generation. Given a langSlug and
// the problem's raw `metaData` JSON, returns the harness file to write next to
// `solution.{ext}`, or null when the language is unsupported or the metaData is
// unusable. Never throws — solution creation must not fail on a bad harness.
//
// Supported: `python3` (Stage 7 item 3), `javascript` (item 5), and
// `typescript`. Adding a language is one `case` below + one `RUNNERS` entry —
// the item-4 runner stays unchanged.

import { parseMetaData } from "./meta";
import { generatePythonHarness } from "./python";
import { generateJavascriptHarness } from "./javascript";
import { generateTypescriptHarness } from "./typescript";

export interface GeneratedHarness {
  filename: string;
  content: string;
}

export function generateHarness(
  langSlug: string,
  metaDataRaw: string | undefined | null
): GeneratedHarness | null {
  if (!metaDataRaw) return null;

  try {
    switch (langSlug) {
      case "python3": {
        const meta = parseMetaData(metaDataRaw);
        return { filename: "main.py", content: generatePythonHarness(meta) };
      }
      case "javascript": {
        const meta = parseMetaData(metaDataRaw);
        return { filename: "main.js", content: generateJavascriptHarness(meta) };
      }
      case "typescript": {
        const meta = parseMetaData(metaDataRaw);
        return { filename: "main.ts", content: generateTypescriptHarness(meta) };
      }
      default:
        return null;
    }
  } catch {
    // Missing/unparseable metaData — skip the harness, keep the solution.
    return null;
  }
}

// How the local test runner (Stage 7 item 4) executes a language's harness:
// the harness file to invoke and the interpreter argv prefix. The runner spawns
// `[...command, harnessFilename]` with cwd = the language folder so the harness
// can `import` the sibling `solution.*`. Keeping this beside `generateHarness`
// means a new language is one entry here + one `case` above; the runner itself
// stays unchanged. Each `command` is a toolchain the user must have on PATH
// (`python3`/`node`/`bun`) — a missing one degrades to a per-case `error`.
export interface RunnerSpec {
  harnessFilename: string;
  command: string[];
}

const RUNNERS: Record<string, RunnerSpec> = {
  python3: { harnessFilename: "main.py", command: ["python3"] },
  javascript: { harnessFilename: "main.js", command: ["node"] },
  typescript: { harnessFilename: "main.ts", command: ["bun"] },
};

export function getRunnerSpec(langSlug: string): RunnerSpec | null {
  return RUNNERS[langSlug] ?? null;
}
