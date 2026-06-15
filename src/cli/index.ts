// Headless CLI scaffold (Stage 8). Dispatched from `src/index.tsx` before the
// renderer is created: bootstraps the bare engine (`loadConfig` → `openDatabase`,
// no TUI), resolves the active problem from cwd, runs a verb, prints plain text,
// and returns an exit code. Three verbs are planned — `test` (local, offline,
// this item), `run` and `submit` (API, items 3 & 4) — wired through one matcher
// here so `src/index.tsx` only learns the CLI seam once.

import { loadConfig, getDbPath, hasTokens } from "../config";
import type { Config } from "../config/types";
import { openDatabase } from "../db";
import { initClient, AuthError } from "../api/client";
import { runLocalTests } from "../core/testRunner";
import { runSolution } from "../core/submission";
import type { ParsedResponse } from "../api/types";
import { buildLocalRunView, buildResultView } from "../views/browse/resultView";
import {
  presentResultView,
  exitCodeForLocalRun,
  exitCodeForResultView,
  brandHeader,
  formatTargetError,
  startStatus,
} from "./present";
import { resolveTarget } from "./target";

// Shown when there's no usable saved session. Headless verbs never launch the
// interactive Firefox-import/paste flow from a non-TTY editor child — they tell
// the user to run the dedicated `auth` subcommand instead.
export const AUTH_HINT = "No LeetCode session — run `leettui auth` to sign in.";
const SESSION_EXPIRED =
  "LeetCode session rejected (it may have expired) — run `leettui auth` to re-authenticate.";

export const CLI_VERBS = ["test", "run", "submit"] as const;
export type CliVerb = (typeof CLI_VERBS)[number];

// Matches the same way the existing `auth`/`update`/`version` tokens do — an
// exact argv element, so a runtime/script path that merely contains "test"
// (e.g. a `leettui-test/` dir) never trips it.
export function matchCliVerb(argv: string[]): CliVerb | null {
  for (const v of CLI_VERBS) {
    if (argv.includes(v)) return v;
  }
  return null;
}

export async function runCli(
  verb: CliVerb,
  cwd: string = process.cwd()
): Promise<number> {
  loadConfig();
  openDatabase(getDbPath());

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
      const report = await runLocalTests(question, langSlug);
      process.stdout.write(`${header}\n${presentResultView(buildLocalRunView(report))}\n`);
      return exitCodeForLocalRun(report);
    }
    case "run":
      return runApiVerb(header, "Running against example cases on LeetCode…", () =>
        runSolution(question, langSlug)
      );
    case "submit":
      // Item 4 fills this in, reusing `runApiVerb` (the bootstrap + auth pattern
      // established here). `submitSolution` already persists status/stats itself.
      console.error(formatTargetError(`'${verb}' is not implemented yet.`));
      return 2;
  }
}

// Initializes the singleton API client from saved tokens. Config is injectable so
// the missing-session branch is unit-testable without touching the real config.
// Never invokes any interactive auth flow — that's a TUI/`auth`-subcommand concern.
export function bootstrapApiClient(
  config: Config = loadConfig()
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
  action: () => Promise<ParsedResponse>
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
