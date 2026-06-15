// Local test runner (Stage 7 item 4). Runs a problem's harness against every
// case in its shared `tests/` dir entirely on the local machine — no LeetCode
// API. For each `tests/case-NN.txt` it spawns the language's interpreter on the
// harness (`getRunnerSpec`) with cwd = the language folder (so the harness can
// import the sibling `solution.*`) and feeds the case file on stdin, exactly
// the contract `core/harness/python.ts` was built around.
//
// Verdicts are diffed against an *optional* sibling `case-NN.out`. Seeded cases
// only ship inputs (LeetCode's `exampleTestcaseList` has no expected outputs),
// so a problem with no `.out` files runs every case with no verdict (`ran`) —
// the caller renders that as info, never a green "all passed".
//
// The pure parts (`pairCases`, `compareOutput`) are unit-tested in
// `testRunner.test.ts`; the spawn path is exercised manually.

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

import type { DbQuestion } from "../db/questions";
import { getProblemDir, getTestsDir } from "./solutions";
import { getRunnerSpec, type RunnerSpec } from "./harness";

// Kill a case that runs too long (an accidental infinite loop) so the handler
// never hangs forever.
const TIMEOUT_MS = 10_000;

export type CaseStatus =
  | "pass" // output matched the expected `.out`
  | "fail" // ran cleanly but output differed from `.out`
  | "ran" // ran cleanly, no `.out` to compare against
  | "error" // interpreter exited non-zero (runtime/compile error)
  | "timeout"; // killed after exceeding TIMEOUT_MS

export interface LocalCaseResult {
  name: string; // e.g. "case-01"
  status: CaseStatus;
  expected?: string; // present for pass/fail
  actual?: string; // stdout (pass/fail/ran) or stderr (error/timeout)
}

// Discriminated union mirroring `ParsedResponse`'s style: the non-`ran` arms
// are "couldn't even start" outcomes the view turns into a single message.
export type LocalRunReport =
  | { kind: "unsupported"; langSlug: string }
  | { kind: "no-harness"; langSlug: string; harnessFilename: string }
  | { kind: "no-cases" }
  | { kind: "ran"; cases: LocalCaseResult[] };

interface DiscoveredCase {
  name: string;
  inputPath: string;
  expectedPath: string | null;
}

// Pure: given the filenames in a tests dir, return ordered case base-names
// (`case-NN`) paired with whether a sibling `case-NN.out` exists. Only
// `case-NN.txt` inputs anchor a case; a stray `.out` with no input is ignored.
export function pairCases(filenames: string[]): { name: string; hasExpected: boolean }[] {
  const expected = new Set(
    filenames.filter((f) => f.endsWith(".out")).map((f) => f.slice(0, -".out".length))
  );
  return filenames
    .filter((f) => /^case-\d+\.txt$/.test(f))
    .map((f) => f.slice(0, -".txt".length))
    .sort()
    .map((name) => ({ name, hasExpected: expected.has(name) }));
}

// Pure: trailing-whitespace-insensitive (and CRLF-insensitive) string equality.
// Note: not JSON-normalized — `[1, 2]` from `json.dumps` won't equal a `[1,2]`
// hand-written `.out`. JSON-aware comparison is a deliberate follow-up.
function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

export function compareOutput(actual: string, expected: string): boolean {
  return normalize(actual) === normalize(expected);
}

export function discoverCases(testsDir: string): DiscoveredCase[] {
  let entries: string[];
  try {
    entries = readdirSync(testsDir);
  } catch {
    return [];
  }
  return pairCases(entries).map((p) => ({
    name: p.name,
    inputPath: join(testsDir, `${p.name}.txt`),
    expectedPath: p.hasExpected ? join(testsDir, `${p.name}.out`) : null,
  }));
}

async function runOneCase(
  spec: RunnerSpec,
  langDir: string,
  c: DiscoveredCase
): Promise<LocalCaseResult> {
  try {
    const proc = Bun.spawn([...spec.command, spec.harnessFilename], {
      cwd: langDir,
      stdin: Bun.file(c.inputPath),
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, TIMEOUT_MS);

    // Drain both streams while the process runs to avoid a pipe-buffer deadlock.
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timer);

    if (timedOut) {
      return { name: c.name, status: "timeout", actual: `Killed after ${TIMEOUT_MS / 1000}s` };
    }
    if (exitCode !== 0) {
      return { name: c.name, status: "error", actual: stderr.trim() || `Exited with code ${exitCode}` };
    }
    if (c.expectedPath) {
      const expected = readFileSync(c.expectedPath, "utf-8");
      return {
        name: c.name,
        status: compareOutput(stdout, expected) ? "pass" : "fail",
        expected: expected.trimEnd(),
        actual: stdout.trimEnd(),
      };
    }
    return { name: c.name, status: "ran", actual: stdout.trimEnd() };
  } catch (e: any) {
    // Spawn failure — interpreter not on PATH, etc.
    return { name: c.name, status: "error", actual: e?.message ?? String(e) };
  }
}

export async function runLocalTests(
  question: DbQuestion,
  langSlug: string
): Promise<LocalRunReport> {
  const spec = getRunnerSpec(langSlug);
  if (!spec) return { kind: "unsupported", langSlug };

  const langDir = join(getProblemDir(question.id, question.title_slug), langSlug);
  if (!existsSync(join(langDir, spec.harnessFilename))) {
    return { kind: "no-harness", langSlug, harnessFilename: spec.harnessFilename };
  }

  const cases = discoverCases(getTestsDir(question.id, question.title_slug));
  if (cases.length === 0) return { kind: "no-cases" };

  const results: LocalCaseResult[] = [];
  for (const c of cases) {
    results.push(await runOneCase(spec, langDir, c));
  }
  return { kind: "ran", cases: results };
}
