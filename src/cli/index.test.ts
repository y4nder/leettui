import { describe, expect, test } from "bun:test";
import { matchCliVerb, verbArg, bootstrapApiClient, AUTH_HINT } from "./index";
import {
  presentResultView,
  exitCodeForLocalRun,
  exitCodeForResultView,
  brandHeader,
  formatTargetError,
  exitCodeForSave,
  presentSaveSummary,
  saveReminder,
} from "./present";
import type { LocalRunReport, LocalCaseResult } from "../core/testRunner";
import type { DbQuestion } from "../db/questions";
import type { Config } from "../config/types";
import type { ResultKind } from "../views/browse/resultView";
import { buildLocalRunView } from "../views/browse/resultView";
import type { SaveResult } from "../core/solutions";

describe("matchCliVerb", () => {
  test("matches each verb as an exact argv element", () => {
    expect(matchCliVerb(["bun", "src/index.tsx", "test"])).toBe("test");
    expect(matchCliVerb(["bun", "src/index.tsx", "run"])).toBe("run");
    expect(matchCliVerb(["bun", "src/index.tsx", "submit"])).toBe("submit");
    expect(matchCliVerb(["bun", "src/index.tsx", "new", "rust"])).toBe("new");
  });

  test("returns null with no verb", () => {
    expect(matchCliVerb(["bun", "src/index.tsx"])).toBeNull();
    expect(matchCliVerb(["bun", "src/index.tsx", "auth"])).toBeNull();
  });

  test("does not match a substring inside a path element", () => {
    // A binary living in a `leettui-test/` dir must not trip the `test` verb.
    expect(matchCliVerb(["/home/u/leettui-test/leettui"])).toBeNull();
  });

  test("returns the earliest verb so a verb-named argument can't shadow it", () => {
    // `new`'s language argument happening to equal another verb token must not
    // win — the verb is whichever recognized token comes *first* in argv.
    expect(matchCliVerb(["bun", "src/index.tsx", "new", "run"])).toBe("new");
    expect(matchCliVerb(["bun", "src/index.tsx", "new", "submit"])).toBe("new");
  });
});

describe("verbArg", () => {
  test("returns the positional token after the verb", () => {
    expect(verbArg(["bun", "src/index.tsx", "new", "rust"], "new")).toBe("rust");
  });

  test("undefined when the verb has no following token", () => {
    expect(verbArg(["bun", "src/index.tsx", "new"], "new")).toBeUndefined();
    expect(verbArg(["bun", "src/index.tsx", "test"], "test")).toBeUndefined();
  });

  test("skips leading flags to the first real token", () => {
    expect(verbArg(["bun", "src/index.tsx", "new", "--debug", "python3"], "new")).toBe("python3");
  });
});

function ran(...cases: LocalCaseResult[]): LocalRunReport {
  return { kind: "ran", cases };
}

describe("exitCodeForLocalRun", () => {
  test("all pass → 0", () => {
    expect(exitCodeForLocalRun(ran({ name: "case-01", status: "pass" }))).toBe(0);
  });

  test("ran clean with no expected outputs → 0", () => {
    expect(exitCodeForLocalRun(ran({ name: "case-01", status: "ran" }))).toBe(0);
  });

  test("any fail → 1", () => {
    expect(
      exitCodeForLocalRun(
        ran({ name: "case-01", status: "pass" }, { name: "case-02", status: "fail" }),
      ),
    ).toBe(1);
  });

  // The discriminating case: a crashing solution against seeded (input-only)
  // tests produces all `error` cases with no `.out`. `buildLocalRunView` collapses
  // that to kind "info"; the exit code must NOT — it has to be non-zero.
  test("error with no expected output → 1 (not derived from view.kind)", () => {
    const report = ran({ name: "case-01", status: "error", actual: "Traceback..." });
    expect(buildLocalRunView(report).kind).toBe("info");
    expect(exitCodeForLocalRun(report)).toBe(1);
  });

  test("timeout → 1", () => {
    expect(exitCodeForLocalRun(ran({ name: "case-01", status: "timeout" }))).toBe(1);
  });

  test("setup arms: no-cases & unsupported → 0, no-harness → 2 (couldn't run)", () => {
    expect(exitCodeForLocalRun({ kind: "no-cases" })).toBe(0);
    expect(exitCodeForLocalRun({ kind: "unsupported", langSlug: "rust" })).toBe(0);
    // no-harness is the designed fallback for an unsupported type (Stage 15) —
    // the verb couldn't run, so exit 2 (not a failed test's 1).
    expect(
      exitCodeForLocalRun({ kind: "no-harness", langSlug: "python3", harnessFilename: "main.py" }),
    ).toBe(2);
  });

  // A compile failure means the harness never ran → "couldn't run the verb", the
  // exit-2 family (same as a target-resolution failure), not ran-but-failed (1).
  test("compile-error → 2 (couldn't run), missing toolchain or not", () => {
    expect(
      exitCodeForLocalRun({
        kind: "compile-error",
        langSlug: "rust",
        toolchainMissing: true,
        output: "spawn cargo ENOENT",
      }),
    ).toBe(2);
    expect(
      exitCodeForLocalRun({
        kind: "compile-error",
        langSlug: "rust",
        toolchainMissing: false,
        output: "error[E0308]: mismatched types",
      }),
    ).toBe(2);
  });
});

describe("buildLocalRunView (compile-error)", () => {
  test("missing toolchain → an install hint, not the raw spawn error", () => {
    const view = buildLocalRunView({
      kind: "compile-error",
      langSlug: "rust",
      toolchainMissing: true,
      output: "spawn cargo ENOENT",
    });
    expect(view.kind).toBe("error");
    expect(view.title).toContain("toolchain not found");
    expect(view.error).toContain("rustup");
    expect(view.error).not.toContain("ENOENT");
  });

  test("real compile failure → the compiler diagnostics", () => {
    const view = buildLocalRunView({
      kind: "compile-error",
      langSlug: "rust",
      toolchainMissing: false,
      output: "error[E0308]: mismatched types",
    });
    expect(view.kind).toBe("error");
    expect(view.title).toContain("Compile Error");
    expect(view.error).toContain("error[E0308]");
  });

  test("missing toolchain hint is per-language (csharp → .NET SDK, not rustup)", () => {
    const view = buildLocalRunView({
      kind: "compile-error",
      langSlug: "csharp",
      toolchainMissing: true,
      output: "spawn dotnet ENOENT",
    });
    expect(view.kind).toBe("error");
    expect(view.title).toContain(".NET SDK");
    expect(view.error).toContain("dotnet");
    expect(view.error).not.toContain("rustup");
    expect(view.error).not.toContain("ENOENT");
  });
});

describe("buildLocalRunView (no-harness)", () => {
  test("is actionable: names the language and points to R/s", () => {
    const view = buildLocalRunView({
      kind: "no-harness",
      langSlug: "python3",
      harnessFilename: "main.py",
    });
    expect(view.kind).toBe("error");
    expect(view.title).toContain("python3");
    expect(view.error).toContain("R to run");
    expect(view.error).toContain("s to submit");
  });
});

describe("exitCodeForResultView (API verbs)", () => {
  const code = (kind: ResultKind) => exitCodeForResultView({ kind, title: "" });

  test("accepted → 0", () => expect(code("accepted")).toBe(0));
  test("info → 0", () => expect(code("info")).toBe(0));
  test("wrong → 1", () => expect(code("wrong")).toBe(1));
  test("error → 1", () => expect(code("error")).toBe(1));
  test("loading → 1", () => expect(code("loading")).toBe(1));
});

describe("bootstrapApiClient", () => {
  // Config is injected so the missing-session branch is testable without the
  // real config or any network.
  test("blank tokens → error telling the user to run `leettui auth`", () => {
    const result = bootstrapApiClient({ csrftoken: "", lc_session: "" } as Config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(AUTH_HINT);
      expect(result.error).toContain("leettui auth");
    }
  });

  test("present tokens → ok (client initialized)", () => {
    const result = bootstrapApiClient({ csrftoken: "csrf", lc_session: "sess" } as Config);
    expect(result.ok).toBe(true);
  });
});

// `present.ts` gates ANSI color on `process.stdout.isTTY` at module load — false
// when test stdout is piped (CI), true in an interactive terminal. So glyphs like
// `✓`/`!` may arrive wrapped in color codes (`\x1b[32m✓\x1b[0m`), breaking a
// contiguous-substring assert. Strip ANSI so these tests check the plain text
// regardless of where they run.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC (\x1b) of an ANSI SGR sequence is the whole point
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("presentResultView", () => {
  test("renders title, metrics, and per-case verdicts", () => {
    const view = buildLocalRunView(
      ran(
        { name: "case-01", status: "pass", expected: "[0,1]", actual: "[0,1]" },
        { name: "case-02", status: "fail", expected: "[0,1]", actual: "[1,0]" },
      ),
    );
    const out = stripAnsi(presentResultView(view));
    expect(out).toContain("Local: 1/2 passed");
    expect(out).toContain("Passed: 1/2");
    expect(out).toContain("✓ case-01");
    expect(out).toContain("✗ case-02");
    // fail → indented Expected / Your Output sections (mirrors ResultBody)
    expect(out).toMatch(/Expected\s+\[0,1\]/);
    expect(out).toMatch(/Your Output\s+\[1,0\]/);
  });

  test("shows an errored case with its (error) suffix and message", () => {
    const out = stripAnsi(
      presentResultView(
        buildLocalRunView(ran({ name: "case-01", status: "error", actual: "NameError: x" })),
      ),
    );
    expect(out).toContain("! case-01 (error)");
    expect(out).toContain("NameError: x");
  });
});

const fakeQuestion: DbQuestion = {
  id: 1,
  title: "Two Sum",
  title_slug: "two-sum",
  difficulty: "Easy",
  paid_only: 0,
  status: null,
  ac_rate: null,
  last_runtime: null,
  last_memory: null,
};

describe("brandHeader / formatTargetError", () => {
  test("brand header echoes verb + resolved problem + language", () => {
    const out = brandHeader({ verb: "test", question: fakeQuestion, langSlug: "typescript" });
    expect(out).toContain("leettui");
    expect(out).toContain("test");
    expect(out).toContain("1. Two Sum");
    expect(out).toContain("typescript");
  });

  test("target error is branded", () => {
    expect(formatTargetError("nope")).toContain("leettui");
    expect(formatTargetError("nope")).toContain("nope");
  });
});

describe("exitCodeForSave", () => {
  test("at least one non-skipped outcome → 0", () => {
    const results: SaveResult[] = [
      { name: "case-01", outcome: "created" },
      { name: "case-02", outcome: "skipped" },
    ];
    expect(exitCodeForSave(results)).toBe(0);
  });

  test("all-skipped → 2 (nothing writable, couldn't bless)", () => {
    const results: SaveResult[] = [
      { name: "case-01", outcome: "skipped" },
      { name: "case-02", outcome: "skipped" },
    ];
    expect(exitCodeForSave(results)).toBe(2);
  });
});

describe("presentSaveSummary", () => {
  test("renders each case name and the created/changed/unchanged/skipped glyphs", () => {
    const results: SaveResult[] = [
      { name: "case-01", outcome: "created" },
      { name: "case-02", outcome: "changed" },
      { name: "case-03", outcome: "unchanged" },
      { name: "case-04", outcome: "skipped" },
    ];
    const out = stripAnsi(presentSaveSummary(results));

    expect(out).toContain("case-01");
    expect(out).toContain("case-02");
    expect(out).toContain("case-03");
    expect(out).toContain("case-04");
    expect(out).toContain("+");
    expect(out).toContain("~");
    expect(out).toContain("=");
    expect(out).toContain("!");
  });
});

describe("saveReminder", () => {
  test("reminds the user to verify correctness before trusting the golden", () => {
    expect(saveReminder(2)).toContain("accepted on LeetCode");
  });
});
