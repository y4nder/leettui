// Plain-text presentation for the headless CLI — the stdout parallel to the
// OpenTUI `ResultBody`/`resultView` rendering path. Both consume the same
// `ResultView`, so the CLI mirrors the TUI's structure and color *semantics*
// (success→green, error→red, subtle→dim, info→cyan) as text. It can't reuse
// `ResultBody` itself (that's an OpenTUI widget; the CLI runs with no renderer),
// and it intentionally uses the 16-color ANSI palette rather than converting the
// theme's RGBA tokens — that way it honors the user's terminal colorscheme, the
// same intent as the `system` theme.
//
// Color is gated on a TTY and `NO_COLOR`, so piped output (editor quickfix, git
// hooks) stays plain and parseable. Editors/hooks branch on the *exit code*, not
// this text.

import type { DbQuestion } from "../db/questions";
import type { ResultView, ResultKind } from "../views/browse/resultView";
import type { CaseStatus, LocalRunReport } from "../core/testRunner";

// ── ANSI ────────────────────────────────────────────────────────────────────

const STDOUT_COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const STDERR_COLOR = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;

function sgr(on: boolean, code: string): (s: string) => string {
  return (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
}

// One palette per stream — stderr (target-resolution errors) may be a TTY while
// stdout is piped, or vice versa.
function palette(on: boolean) {
  return {
    green: sgr(on, "32"),
    red: sgr(on, "31"),
    cyan: sgr(on, "36"),
    blue: sgr(on, "34"),
    dim: sgr(on, "2"),
    bold: sgr(on, "1"),
  };
}

const c = palette(STDOUT_COLOR);
const e = palette(STDERR_COLOR);

const INDENT = "  ";
const SECTION_INDENT = "      ";

// ── color mapping (mirrors ResultBody's titleColor / caseGlyph) ───────────────

function paintTitle(kind: ResultKind, s: string): string {
  switch (kind) {
    case "accepted":
      return c.green(s);
    case "wrong":
    case "error":
      return c.red(s);
    case "loading":
    case "info":
      return c.dim(s);
  }
}

function caseGlyph(status: CaseStatus): string {
  switch (status) {
    case "pass":
      return c.green("✓");
    case "fail":
      return c.red("✗");
    case "error":
    case "timeout":
      return c.red("!");
    case "ran":
      return c.dim("·");
  }
}

// A labeled value block, mirroring ResultBody's bordered `Section`. Single-line
// values render inline (`label  value`); multi-line values get a label line
// followed by indented lines.
function section(label: string, paint: (s: string) => string, value: string): string[] {
  const lines = value.split("\n");
  if (lines.length === 1) {
    return [`${SECTION_INDENT}${paint(label.padEnd(12))}${lines[0]}`];
  }
  return [`${SECTION_INDENT}${paint(label)}`, ...lines.map((l) => `${SECTION_INDENT}  ${l}`)];
}

// ── brand header ──────────────────────────────────────────────────────────────

export interface BrandContext {
  verb: string;
  question: DbQuestion;
  langSlug: string;
}

// The consistent CLI wordmark ("tagged lines" style): a single context line —
// the `leettui` brand tag + `<verb>` + the resolved problem/language (reassuring,
// since the target is inferred from cwd), dot-separated, no rule. Always emitted
// (context is useful even piped); only color is gated.
export function brandHeader({ verb, question, langSlug }: BrandContext): string {
  return (
    ` ${c.bold(c.blue("leettui"))}  ${c.dim(verb)} ${c.dim("·")} ` +
    `${question.id}. ${question.title} ${c.dim(`· ${langSlug}`)}`
  );
}

// Branded one-liner for target-resolution failures (stderr).
export function formatTargetError(message: string): string {
  return `${e.bold(e.blue("leettui"))} ${e.red("error")} ${message}`;
}

// ── progress ────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Transient progress feedback for the API verbs while they wait on the network +
// result polling (otherwise the user stares at a silent terminal for a few
// seconds). Goes to **stderr** so piped stdout (the result body) stays clean and
// parseable. On a TTY it animates a spinner and erases itself when stopped;
// otherwise it prints one plain line. Returns a `stop()` to call once the result
// is in hand (idempotent).
export function startStatus(message: string): () => void {
  if (!process.stderr.isTTY) {
    process.stderr.write(`${message}\n`);
    return () => {};
  }
  let i = 0;
  const render = () => {
    const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length];
    process.stderr.write(`\r${e.dim(`${frame} ${message}`)}`);
  };
  render();
  const timer = setInterval(render, 80);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    process.stderr.write("\r\x1b[K"); // carriage return + clear-to-end-of-line
  };
}

// ── body ──────────────────────────────────────────────────────────────────────

// Renders a `ResultView` to a plain-text block (no trailing newline), indented
// under the brand header. Generic over every field so it serves `test`
// (cases/metrics) and the later API verbs (diff/outputs/error) unchanged.
export function presentResultView(view: ResultView): string {
  const lines: string[] = ["", `${INDENT}${paintTitle(view.kind, view.title)}`];

  if (view.metrics?.length) {
    lines.push("");
    for (const m of view.metrics) {
      const subtle = m.subtle ? c.dim(` (${m.subtle})`) : "";
      lines.push(`${INDENT}${c.dim(`${m.label}:`)} ${m.value}${subtle}`);
    }
  }

  if (view.cases?.length) {
    lines.push("");
    for (const cse of view.cases) {
      const suffix =
        cse.status === "error" || cse.status === "timeout" ? c.dim(` (${cse.status})`) : "";
      lines.push(`${INDENT}${caseGlyph(cse.status)} ${cse.name}${suffix}`);
      if (cse.status === "fail") {
        if (cse.expected !== undefined) lines.push(...section("Expected", c.green, cse.expected));
        if (cse.actual !== undefined) lines.push(...section("Your Output", c.red, cse.actual));
      } else if ((cse.status === "error" || cse.status === "timeout") && cse.actual) {
        lines.push(...section("Error", c.red, cse.actual));
      } else if (cse.status === "ran" && cse.actual !== undefined && cse.actual !== "") {
        lines.push(...section("Output", c.cyan, cse.actual));
      }
    }
  }

  if (view.diff) {
    lines.push("");
    if (view.diff.testcase) lines.push(...section("Last Testcase", c.cyan, view.diff.testcase));
    lines.push(...section("Expected", c.green, view.diff.expected));
    lines.push(...section("Your Output", c.red, view.diff.actual));
  }

  if (view.outputs?.length) {
    lines.push("");
    for (const o of view.outputs) {
      const paint = o.label.startsWith("Expected") ? c.green : c.cyan;
      lines.push(`${INDENT}${paint(`${o.label}:`)} ${o.value}`);
    }
  }

  if (view.error) {
    lines.push("");
    for (const line of view.error.split("\n")) lines.push(`${INDENT}${c.red(line)}`);
  }

  return lines.join("\n");
}

// Exit code for `leettui test`, derived from the RAW report — not from
// `buildLocalRunView`'s `ResultView.kind`. The view is lossy about failures:
// its "ran" arm only counts pass/fail into the verdict, so `error`/`timeout`
// cases with no `.out` collapse to kind "info". Deriving the code from the
// report keeps the done-criterion exact: non-zero on *any* fail/error/timeout.
//   - ran:           1 if any case failed/errored/timed out, else 0
//   - no-harness:    2 — the harness never ran (none was generated); a "couldn't
//                    run the verb" outcome, NOT a test failure. Since Stage 15
//                    this is the *designed fallback* for an unsupported type
//                    (e.g. ListNode/TreeNode) — the verb couldn't execute, same
//                    family as a target-resolution / compile failure, so a
//                    `leettui test && …` hook or quickfix must not read it as a
//                    failed test (exit 1).
//   - compile-error: 2 — the harness never ran (no binary produced); same
//                    "couldn't run the verb" family as no-harness
//   - unsupported / no-cases: 0 — nothing to run; don't block hooks/quickfix
export function exitCodeForLocalRun(report: LocalRunReport): number {
  switch (report.kind) {
    case "ran":
      return report.cases.some(
        (cse) => cse.status === "fail" || cse.status === "error" || cse.status === "timeout",
      )
        ? 1
        : 0;
    case "no-harness":
      return 2;
    case "compile-error":
      return 2;
    case "unsupported":
    case "no-cases":
      return 0;
  }
}

// Exit code for the API verbs (`run`/`submit`), derived from `ResultView.kind`.
// Unlike `buildLocalRunView`, `buildResultView` is NOT lossy about failures —
// nothing maps a real failure to `accepted` (only `run_accepted`/`submit_accepted`
// do) — so `kind` is an exact verdict here. `accepted` (and the can't-happen-for-API
// `info`) → 0; `wrong`/`error`/`loading` → 1, matching the `test` verb's
// "any non-pass is 1". A couldn't-run condition (auth) is exit 2, handled by the
// caller before this is reached — never folded in here.
export function exitCodeForResultView(view: ResultView): number {
  switch (view.kind) {
    case "accepted":
    case "info":
      return 0;
    case "wrong":
    case "error":
    case "loading":
      return 1;
  }
}
