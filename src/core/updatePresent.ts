// Console (renderer-less) presentation for the `update` subcommand and the
// "update available" quit notice. The renderer isn't mounted on either path, so
// these draw with plain text + ANSI, gated on a stdout TTY and NO_COLOR (so a
// piped/redirected `leettui update` stays plain). Sibling to `cli/present.ts`
// (which serves the headless verbs); kept here in `core/` because `update.ts`
// already owns the `update` subcommand's stdout.

import { VERSION } from "@/core/version";

const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function sgr(code: string): (s: string) => string {
  return (s: string) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
}

const bold = sgr("1");
const dim = sgr("2");
const blue = sgr("34");
const green = sgr("32");
const red = sgr("31");

// The block-letter wordmark, mirroring the in-app `onboarding/Logo`. A narrow
// single-line fallback is used when the terminal is too thin for the art.
const WORDMARK = [
  "█   █▀▀ █▀▀ ▀█▀ ▀█▀ █ █ █",
  "█   █▀  █▀   █   █  █ █ █",
  "█▄▄ █▄▄ █▄▄  █   █  █▄█ █",
];
const WORDMARK_WIDTH = Math.max(...WORDMARK.map((l) => l.length));

/** Branded banner printed at the top of the `update` subcommand. */
export function brandBanner(): string {
  const width = process.stdout.columns ?? 80;
  const tagline = `LeetCode in your terminal · ${VERSION}`;
  if (width < WORDMARK_WIDTH + 4) {
    return `\n  ${bold(blue("‹ leettui ›"))}\n  ${dim(tagline)}\n`;
  }
  const mark = WORDMARK.map((l) => `  ${bold(blue(l))}`).join("\n");
  return `\n${mark}\n  ${dim(tagline)}\n`;
}

const BAR_WIDTH = 28;

function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

// A live download progress bar. On a TTY it redraws in place (carriage return);
// off a TTY it prints the label once and the bar updates are no-ops, so piped
// output stays a single clean line. `done(finalLabel?)` clears the bar and
// optionally prints a closing line; it's safe to call more than once.
export function startProgress(label: string): {
  update: (received: number, total: number) => void;
  done: (finalLabel?: string) => void;
} {
  const tty = Boolean(process.stdout.isTTY);
  if (!tty) process.stdout.write(`  ${label}\n`);
  let finished = false;

  const update = (received: number, total: number): void => {
    if (!tty || finished) return;
    const ratio = total > 0 ? Math.min(received / total, 1) : 0;
    const filled = Math.round(ratio * BAR_WIDTH);
    const bar = blue("█".repeat(filled)) + dim("░".repeat(BAR_WIDTH - filled));
    const pct = `${Math.round(ratio * 100)}`.padStart(3);
    const size = total > 0 ? `${fmtMB(received)}/${fmtMB(total)} MB` : `${fmtMB(received)} MB`;
    process.stdout.write(`\r  ${label}  ${bar} ${pct}%  ${dim(size)}`);
  };

  const done = (finalLabel?: string): void => {
    if (finished) return;
    finished = true;
    if (tty) process.stdout.write("\r\x1b[K"); // clear the bar line
    if (finalLabel) process.stdout.write(`  ${finalLabel}\n`);
  };

  return { update, done };
}

/** Success line for a completed self-update. */
export function updateSuccess(from: string, to: string): string {
  return `  ${green("✓")} ${bold("Updated")} ${dim(`${from} →`)} ${green(to)}  ${dim("· restart to use it")}`;
}

/** Branded error line for the update path. */
export function updateError(message: string): string {
  return `  ${red("✗")} ${message}`;
}

// The "a newer release exists" reminder shown on quit (printed by the exit hook
// in `index.tsx` after the renderer has torn down). Independent of the in-app
// banner's dismiss state — a user who dismissed the banner mid-session still
// gets this last nudge.
export function updateNotice(tag: string, current: string): string {
  return (
    `\n${blue("▲")} ${bold("leettui update available")}  ${dim(`${current} →`)} ${green(tag)}\n` +
    `  Run ${bold(blue("leettui update"))} to upgrade.\n`
  );
}

// The quit notice's "already installed" variant: the background auto-update
// swapped the binary during the session, so the only step left is a relaunch.
export function updateInstalledNotice(tag: string): string {
  return `\n${green("✓")} ${bold(`leettui ${tag} installed`)}  ${dim("— takes effect on next launch.")}\n`;
}
