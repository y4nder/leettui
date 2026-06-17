// Local test runner (Stage 7 item 4). Runs a problem's harness against every
// case in its shared `tests/` dir entirely on the local machine — no LeetCode
// API. For each `tests/case-NN.txt` it spawns the language's interpreter on the
// harness (`getRunnerSpec`) with cwd = the language folder (so the harness can
// import the sibling `solution.*`) and feeds the case file on stdin, exactly
// the contract `core/harness/python.ts` was built around.
//
// Compiled languages (Stage 14 — rust) add a one-shot **compile phase**: the
// `RunnerSpec.compile` command runs once in the language folder (its own generous
// timeout — the first `cargo` build fetches+compiles serde, well past the per-case
// limit) to produce a binary, then the case loop spawns that binary directly
// (`spec.command`, *not* appending `harnessFilename`). A compile failure surfaces
// as a single `compile-error` report instead of N per-case errors.
//
// Verdicts are diffed against an *optional* sibling `case-NN.out`. Seeded cases
// only ship inputs (LeetCode's `exampleTestcaseList` has no expected outputs),
// so a problem with no `.out` files runs every case with no verdict (`ran`) —
// the caller renders that as info, never a green "all passed".
//
// The pure parts (`pairCases`, `compareOutput`) are unit-tested in
// `testRunner.test.ts`; the spawn path is exercised manually.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DbQuestion } from "../db/questions";
import { getProblemDir, getTestsDir } from "./solutions";
import { getRunnerSpec, type RunnerSpec } from "./harness";
import { errMessage } from "../debug";

// Kill a case that runs too long (an accidental infinite loop) so the handler
// never hangs forever.
const TIMEOUT_MS = 10_000;

// The compile phase gets its own, far more generous budget: the *first* rust
// build downloads serde_json + serde from crates.io and compiles them (easily
// >10s, the per-case limit). Distinct from `TIMEOUT_MS` on purpose.
const COMPILE_TIMEOUT_MS = 120_000;

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
  // A compiled language's one-shot compile phase failed before any case ran.
  // `toolchainMissing` splits "cargo not on PATH" (a one-line install hint) from
  // a real compile error (`output` carries the compiler diagnostics).
  | { kind: "compile-error"; langSlug: string; toolchainMissing: boolean; output: string }
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
    filenames.filter((f) => f.endsWith(".out")).map((f) => f.slice(0, -".out".length)),
  );
  return filenames
    .filter((f) => /^case-\d+\.txt$/.test(f))
    .map((f) => f.slice(0, -".txt".length))
    .sort()
    .map((name) => ({ name, hasExpected: expected.has(name) }));
}

// Trailing-whitespace-insensitive (and CRLF-insensitive) string normalization.
function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

// Recursively sort object keys so two JSON values that differ only in key order
// (or array/scalar spacing) serialize identically. Arrays keep their order.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

// Canonical JSON serialization, or null if the string isn't a single JSON value.
function tryCanonicalJson(s: string): string | null {
  try {
    return JSON.stringify(canonicalize(JSON.parse(s)));
  } catch {
    return null;
  }
}

// Pure equality used to grade a case against its `.out`. JSON-aware: the harness
// emits compact `JSON.stringify(result)` (`[0,1]`), but a hand-written or
// LeetCode-copied `.out` uses the display spacing (`[0, 1]`) — same value, so
// both are canonicalized and compared. Floats normalize too (`1.0` == `1`). When
// either side isn't valid JSON (a non-JSON or multi-line `.out`), it falls back
// to trailing-whitespace/CRLF-insensitive string equality.
export function compareOutput(actual: string, expected: string): boolean {
  const a = normalize(actual);
  const b = normalize(expected);
  if (a === b) return true;
  const aj = tryCanonicalJson(a);
  const bj = tryCanonicalJson(b);
  if (aj !== null && bj !== null) return aj === bj;
  return false;
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
  c: DiscoveredCase,
): Promise<LocalCaseResult> {
  try {
    // Interpreted: `[...command, harnessFilename]` (run the harness source). Compiled:
    // `[...command]` alone — `command` is the produced binary, which reads stdin
    // directly; appending a source-file arg would be wrong.
    const argv = spec.compile ? [...spec.command] : [...spec.command, spec.harnessFilename];
    const proc = Bun.spawn(argv, {
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
      return {
        name: c.name,
        status: "error",
        actual: stderr.trim() || `Exited with code ${exitCode}`,
      };
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
  } catch (e) {
    // Spawn failure — interpreter not on PATH, etc.
    return { name: c.name, status: "error", actual: errMessage(e) };
  }
}

// Run a compiled language's one-shot compile phase in the lang dir. Returns `ok`
// on a clean build; otherwise distinguishes a missing toolchain (spawn threw —
// `cargo` not on PATH) from a real compile failure (non-zero exit, diagnostics in
// `output`) or a timeout, so the caller can phrase one clear message.
async function runCompile(
  spec: RunnerSpec,
  langDir: string,
): Promise<{ ok: true } | { ok: false; toolchainMissing: boolean; output: string }> {
  // Caller only invokes this when `spec.compile` is set; guard keeps it total.
  if (!spec.compile) return { ok: true };
  try {
    const proc = Bun.spawn([...spec.compile.command], {
      cwd: langDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, COMPILE_TIMEOUT_MS);

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timer);

    if (timedOut) {
      return {
        ok: false,
        toolchainMissing: false,
        output: `Compile timed out after ${COMPILE_TIMEOUT_MS / 1000}s`,
      };
    }
    if (exitCode !== 0) {
      return {
        ok: false,
        toolchainMissing: false,
        output: stderr.trim() || stdout.trim() || `Compile exited with code ${exitCode}`,
      };
    }
    return { ok: true };
  } catch (err) {
    // Spawn threw — the compiler (`cargo`) isn't on PATH.
    return { ok: false, toolchainMissing: true, output: errMessage(err) };
  }
}

export async function runLocalTests(
  question: DbQuestion,
  langSlug: string,
): Promise<LocalRunReport> {
  const spec = getRunnerSpec(langSlug);
  if (!spec) return { kind: "unsupported", langSlug };

  const langDir = join(getProblemDir(question.id, question.title_slug), langSlug);
  if (!existsSync(join(langDir, spec.harnessFilename))) {
    return { kind: "no-harness", langSlug, harnessFilename: spec.harnessFilename };
  }

  const cases = discoverCases(getTestsDir(question.id, question.title_slug));
  if (cases.length === 0) return { kind: "no-cases" };

  // Compiled languages: build once before the loop. A failure short-circuits to a
  // single report rather than N identical per-case errors.
  if (spec.compile) {
    const compiled = await runCompile(spec, langDir);
    if (!compiled.ok) {
      return {
        kind: "compile-error",
        langSlug,
        toolchainMissing: compiled.toolchainMissing,
        output: compiled.output,
      };
    }
  }

  const results: LocalCaseResult[] = [];
  for (const c of cases) {
    results.push(await runOneCase(spec, langDir, c));
  }
  return { kind: "ran", cases: results };
}
