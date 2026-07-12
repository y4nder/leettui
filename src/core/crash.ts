// Crash visibility. A render-time throw (or an unhandled rejection) with the TUI
// on the alternate screen and no reporting leaves a cleared, black terminal — the
// exact "black screen" failure mode that made the Windows release bug invisible.
// These helpers make such failures observable: every crash is appended to a log
// file, and the process-level handlers also restore the main screen so the stack
// lands in normal scrollback instead of a torn alt-screen buffer.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "@/config/paths";

export const CRASH_LOG = join(DATA_DIR, "crash.log");

function formatError(err: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  return `${e.name}: ${e.message}\n${e.stack ?? "(no stack)"}`;
}

// Append a crash to the log file and return the formatted body. Never throws — a
// failure to log must not itself crash the crash handler.
export function logCrash(context: string, err: unknown): string {
  const body = `[${new Date().toISOString()}] ${context}\n${formatError(err)}\n\n`;
  try {
    mkdirSync(dirname(CRASH_LOG), { recursive: true });
    appendFileSync(CRASH_LOG, body);
  } catch {
    // best-effort
  }
  return body;
}

// Leave the alternate-screen buffer and restore the cursor so a crash message is
// visible in normal scrollback rather than swallowed by a cleared alt-screen.
function restoreTerminal(): void {
  try {
    // ?1049l = leave alternate screen buffer; ?25h = show cursor.
    process.stdout.write("\x1b[?1049l\x1b[?25h");
  } catch {
    // terminal may already be torn down
  }
}

// Last-resort handlers for throws/rejections outside React's render tree (e.g. the
// fail-silent `.then(...)` chains at boot, or native async errors).
//
// - uncaughtException is fatal (Bun would exit anyway): restore the main screen,
//   print the stack, and exit — so the user sees *why* instead of a black screen.
// - unhandledRejection is only logged: tearing down the TUI on a stray rejection
//   would regress otherwise-benign cases, so we surface it to the log for
//   diagnosis and let the app keep running.
export function installCrashHandlers(): void {
  process.on("uncaughtException", (err) => {
    const body = logCrash("uncaughtException", err);
    restoreTerminal();
    try {
      process.stderr.write(`\nleettui crashed:\n\n${body}Logged to ${CRASH_LOG}\n`);
    } catch {
      // nothing more we can do
    }
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logCrash("unhandledRejection", reason);
  });
}
