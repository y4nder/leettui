// Headless CLI scaffold (Stage 8; `new` = Stage 22). Dispatched from
// `src/index.tsx` before the renderer is created: bootstraps the bare engine
// (`loadConfig` → `openDatabase`, no TUI), resolves the active problem from cwd,
// runs a verb, prints plain text, and returns an exit code. Verbs: `test`
// (local, offline), `run`/`submit` (API), and `new <language>` (scaffold a
// solution + harness for a language, resolving at the problem level + taking the
// language as an argument) — wired through one matcher here so `src/index.tsx`
// only learns the CLI seam once.

import { loadConfig, getDbPath, hasTokens } from "../config";
import type { Config } from "../config/types";
import { openDatabase } from "../db";
import { initClient, AuthError } from "../api/client";
import { runLocalTests } from "../core/testRunner";
import { runSolution, submitSolution } from "../core/submission";
import type { ParsedResponse } from "../api/types";
import { fetchEditorData } from "../api/queries/editor-data";
import { fetchConsolePanelConfig } from "../api/queries/console-panel-config";
import {
  addCase,
  createSolutionWithHarness,
  getSolutionPath,
  getTestsDir,
  saveGoldenOutputs,
  solutionExists,
} from "../core/solutions";
import { buildLocalRunView, buildResultView } from "../views/browse/resultView";
import {
  presentResultView,
  exitCodeForLocalRun,
  exitCodeForResultView,
  exitCodeForSave,
  presentSaveSummary,
  saveReminder,
  brandHeader,
  formatTargetError,
  startStatus,
} from "./present";
import { resolveProblemTarget, resolveTarget } from "./target";

// Shown when there's no usable saved session. Headless verbs never launch the
// interactive Firefox-import/paste flow from a non-TTY editor child — they tell
// the user to run the dedicated `auth` subcommand instead.
export const AUTH_HINT = "No LeetCode session — run `leettui auth` to sign in.";
const SESSION_EXPIRED =
  "LeetCode session rejected (it may have expired) — run `leettui auth` to re-authenticate.";

export const CLI_VERBS = ["test", "run", "submit", "new"] as const;
export type CliVerb = (typeof CLI_VERBS)[number];

// Matches the same way the existing `auth`/`update`/`version` tokens do — an
// exact argv element, so a runtime/script path that merely contains "test"
// (e.g. a `leettui-test/` dir) never trips it. Returns the verb appearing
// **earliest** in argv, so `leettui new run` (a hypothetical `run`-named lang
// arg) resolves to `new`, not the later `run` token — the verb is whichever
// recognized token comes first, never one buried in another's argument.
export function matchCliVerb(argv: string[]): CliVerb | null {
  let best: { verb: CliVerb; at: number } | null = null;
  for (const v of CLI_VERBS) {
    const at = argv.indexOf(v);
    if (at >= 0 && (best === null || at < best.at)) best = { verb: v, at };
  }
  return best ? best.verb : null;
}

// The positional argument following a verb (the `new` verb's language). Returns
// the first non-flag token after the verb, so `leettui new rust` yields `rust`
// and a stray `--flag` is skipped; `undefined` when the verb is last or absent.
export function verbArg(argv: string[], verb: CliVerb): string | undefined {
  const i = argv.indexOf(verb);
  if (i < 0) return undefined;
  for (let j = i + 1; j < argv.length; j++) {
    const tok = argv[j];
    if (tok && !tok.startsWith("-")) return tok;
  }
  return undefined;
}

// A boolean flag anywhere in argv (`--save`) — an exact-element check, mirroring
// `matchCliVerb`'s exact-token matching so a path/arg that merely contains the
// flag text never trips it.
export function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

// The first non-flag token after `flag` (e.g. `--add-case cases.txt` → the file
// arg), mirroring `verbArg`'s "first non-flag token after X" shape.
export function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  for (let j = i + 1; j < argv.length; j++) {
    const tok = argv[j];
    if (tok && !tok.startsWith("-")) return tok;
  }
  return undefined;
}

export async function runCli(
  verb: CliVerb,
  cwd: string = process.cwd(),
  argv: string[] = process.argv,
): Promise<number> {
  loadConfig();
  openDatabase(getDbPath());

  const arg = verbArg(argv, verb);
  const save = hasFlag(argv, "--save");

  // `new` resolves at the **problem** level (no langSlug from cwd — it takes the
  // language as `arg`) and fetches the snippet over the network, so it branches
  // before the langSlug-requiring `resolveTarget` the other verbs share.
  if (verb === "new") return runNewVerb(cwd, arg);

  const resolved = resolveTarget(cwd);
  if (!resolved.ok) {
    // Target-resolution failures go to stderr with exit 2, distinct from a
    // ran-but-failed test (exit 1), so hooks can tell "couldn't run" from "failed".
    console.error(formatTargetError(resolved.error));
    return 2;
  }
  const { question, langSlug } = resolved.target;
  const header = brandHeader({ verb, question, langSlug });

  switch (verb) {
    case "test": {
      // `--add-case` is an alternate mode of `test` that writes a new case
      // input and exits — it never runs the solution. Handled before
      // `runLocalTests` so it short-circuits the normal run/save path.
      if (hasFlag(argv, "--add-case")) {
        const filePath = flagValue(argv, "--add-case");
        const input = filePath ? await Bun.file(filePath).text() : await Bun.stdin.text();
        if (input.trim() === "") {
          console.error(
            formatTargetError(
              "No case input — pipe it on stdin (leettui test --add-case < input.txt) or pass a file.",
            ),
          );
          return 2;
        }
        const testsDir = getTestsDir(question.id, question.title_slug);
        const path = addCase(testsDir, input);
        process.stdout.write(`${header}\n\n  created: ${path}\n`);
        return 0;
      }
      // Always run the cases first (D-12) — `--save` consumes this same
      // `LocalCaseResult[]`, never re-running/re-compiling.
      const report = await runLocalTests(question, langSlug);
      if (!save) {
        process.stdout.write(`${header}\n${presentResultView(buildLocalRunView(report))}\n`);
        return exitCodeForLocalRun(report);
      }
      // Nothing to bless (unsupported/no-harness/no-cases/compile-error) — show
      // the normal view and exit exactly as plain `test` would.
      if (report.kind !== "ran") {
        process.stdout.write(`${header}\n${presentResultView(buildLocalRunView(report))}\n`);
        return exitCodeForLocalRun(report);
      }
      const testsDir = getTestsDir(question.id, question.title_slug);
      const results = saveGoldenOutputs(testsDir, report.cases);
      const written = results.filter((r) => r.outcome !== "skipped").length;
      const lines = [`${header}\n${presentSaveSummary(results)}`];
      if (written > 0) lines.push(saveReminder(written));
      process.stdout.write(`${lines.join("\n")}\n`);
      return exitCodeForSave(results);
    }
    case "run":
      return runApiVerb(header, "Running against example cases on LeetCode…", () =>
        runSolution(question, langSlug),
      );
    case "submit":
      // Reuses `runApiVerb` verbatim — `submitSolution` already persists status
      // and runtime/memory stats to the DB (markAccepted/setSubmissionStats),
      // exactly as the TUI submit path does.
      return runApiVerb(header, "Submitting to LeetCode…", () =>
        submitSolution(question, langSlug),
      );
  }
}

// `leettui new <language>` — scaffolds a solution + harness + seeded tests for a
// language directly from the problem workspace dir, the headless analogue of the
// TUI solution picker's create path (`handlePickerOpenEditor`). The user is
// already in their editor, so it never opens one: it creates the files and
// prints the path. The set of valid `<language>`s is exactly what LeetCode
// offers for this problem (the editor-data code snippets) — no local allowlist,
// matching the picker; an unsupported signature simply yields a plain solution
// file with no harness (`createSolutionWithHarness` is best-effort), never an
// error. Needs the network + a valid session for the snippet/metaData fetch, so
// it shares the auth-expiry handling of the API verbs.
async function runNewVerb(cwd: string, langArg?: string): Promise<number> {
  const resolved = resolveProblemTarget(cwd);
  if (!resolved.ok) {
    console.error(formatTargetError(resolved.error));
    return 2;
  }
  const { question } = resolved.target;

  const boot = bootstrapApiClient();
  if (!boot.ok) {
    console.error(formatTargetError(boot.error));
    return 2;
  }

  // The code snippets enumerate the languages LeetCode offers for this problem —
  // the same source the TUI picker lists.
  let snippets: { langSlug: string; code: string }[];
  try {
    const editorData = await fetchEditorData(question.title_slug);
    snippets = editorData.question.codeSnippets ?? [];
  } catch (err) {
    if (err instanceof AuthError) {
      console.error(formatTargetError(SESSION_EXPIRED));
      return 2;
    }
    console.error(formatTargetError(err instanceof Error ? err.message : String(err)));
    return 2;
  }

  if (snippets.length === 0) {
    console.error(formatTargetError(`No code snippets available for '${question.title_slug}'.`));
    return 2;
  }

  const available = snippets
    .map((s) => s.langSlug)
    .sort()
    .join(", ");

  // No language given, or one LeetCode doesn't offer here → list the choices and
  // exit 2 (the "couldn't run the verb" family — nothing was created).
  if (!langArg) {
    console.error(
      formatTargetError(`Specify a language: leettui new <language>. Available: ${available}`),
    );
    return 2;
  }
  const snippet = snippets.find((s) => s.langSlug === langArg);
  if (!snippet) {
    console.error(
      formatTargetError(
        `Language '${langArg}' isn't available for this problem. Available: ${available}`,
      ),
    );
    return 2;
  }

  const header = brandHeader({ verb: "new", question, langSlug: langArg });

  // Idempotent: the create flow is create-if-absent, so a pre-existing solution
  // is reported (and its path echoed) rather than silently re-running.
  if (solutionExists(question.id, question.title_slug, langArg)) {
    const path = getSolutionPath(question.id, question.title_slug, langArg);
    process.stdout.write(`${header}\n\n  already exists: ${path}\n`);
    return 0;
  }

  // metaData + example cases drive harness generation + tests seeding, exactly as
  // the picker's create path. Best-effort: a missing/failed fetch still creates a
  // plain solution file (no harness/tests), never blocking the scaffold.
  const cfg = await fetchConsolePanelConfig(question.title_slug).catch(() => null);
  const path = createSolutionWithHarness(
    question.id,
    question.title_slug,
    langArg,
    snippet.code,
    cfg?.question.metaData,
    cfg?.question.exampleTestcaseList,
  );

  process.stdout.write(`${header}\n\n  created: ${path}\n`);
  return 0;
}

// Initializes the singleton API client from saved tokens. Config is injectable so
// the missing-session branch is unit-testable without touching the real config.
// Never invokes any interactive auth flow — that's a TUI/`auth`-subcommand concern.
export function bootstrapApiClient(
  config: Config = loadConfig(),
): { ok: true } | { ok: false; error: string } {
  if (!hasTokens(config)) return { ok: false, error: AUTH_HINT };
  initClient(config.csrftoken, config.lc_session);
  return { ok: true };
}

// The shared API-verb runner (the "API-from-CLI + auth-expiry pattern" item 3
// establishes; item 4's `submit` reuses it verbatim). Bootstraps the client,
// runs the action, prints the `ParsedResponse` via the same presenter as `test`,
// and maps the outcome to an exit code: 0 accepted · 1 ran-but-not-accepted ·
// 2 couldn't-run (missing/expired session, or unreadable solution file).
async function runApiVerb(
  header: string,
  status: string,
  action: () => Promise<ParsedResponse>,
): Promise<number> {
  const boot = bootstrapApiClient();
  if (!boot.ok) {
    console.error(formatTargetError(boot.error));
    return 2;
  }
  // Header to stdout immediately (reassuring context), then a transient spinner
  // on stderr while we wait on the API + polling, so the terminal isn't silent.
  process.stdout.write(`${header}\n`);
  const stopStatus = startStatus(status);
  try {
    const view = buildResultView(await action());
    stopStatus();
    process.stdout.write(`${presentResultView(view)}\n`);
    return exitCodeForResultView(view);
  } catch (err) {
    stopStatus();
    // AuthError carries a TUI-oriented "Ctrl+P" hint in its message — override it
    // with the CLI's `leettui auth` guidance rather than leaking that text.
    if (err instanceof AuthError) {
      console.error(formatTargetError(SESSION_EXPIRED));
      return 2;
    }
    // SolutionError (unreadable file) and any other failure surface their message.
    const message = err instanceof Error ? err.message : String(err);
    console.error(formatTargetError(message));
    return 2;
  }
}
