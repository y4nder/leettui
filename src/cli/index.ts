// Headless CLI scaffold (Stage 8). Dispatched from `src/index.tsx` before the
// renderer is created: bootstraps the bare engine (`loadConfig` → `openDatabase`,
// no TUI), resolves the active problem from cwd, runs a verb, prints plain text,
// and returns an exit code. Three verbs are planned — `test` (local, offline,
// this item), `run` and `submit` (API, items 3 & 4) — wired through one matcher
// here so `src/index.tsx` only learns the CLI seam once.

import { loadConfig, getDbPath } from "../config";
import { openDatabase } from "../db";
import { runLocalTests } from "../core/testRunner";
import { buildLocalRunView } from "../views/browse/resultView";
import {
  presentResultView,
  exitCodeForLocalRun,
  brandHeader,
  formatTargetError,
} from "./present";
import { resolveTarget } from "./target";

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
    case "submit":
      // Items 3 & 4 fill these in, reusing this bootstrap + target + presenter.
      console.error(`'${verb}' is not implemented yet.`);
      return 2;
  }
}
