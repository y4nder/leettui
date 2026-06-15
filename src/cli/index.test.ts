import { describe, expect, test } from "bun:test";
import { matchCliVerb } from "./index";
import {
  presentResultView,
  exitCodeForLocalRun,
  brandHeader,
  formatTargetError,
} from "./present";
import type { LocalRunReport, LocalCaseResult } from "../core/testRunner";
import type { DbQuestion } from "../db/questions";
import { buildLocalRunView } from "../views/browse/resultView";

describe("matchCliVerb", () => {
  test("matches each verb as an exact argv element", () => {
    expect(matchCliVerb(["bun", "src/index.tsx", "test"])).toBe("test");
    expect(matchCliVerb(["bun", "src/index.tsx", "run"])).toBe("run");
    expect(matchCliVerb(["bun", "src/index.tsx", "submit"])).toBe("submit");
  });

  test("returns null with no verb", () => {
    expect(matchCliVerb(["bun", "src/index.tsx"])).toBeNull();
    expect(matchCliVerb(["bun", "src/index.tsx", "auth"])).toBeNull();
  });

  test("does not match a substring inside a path element", () => {
    // A binary living in a `leettui-test/` dir must not trip the `test` verb.
    expect(matchCliVerb(["/home/u/leettui-test/leettui"])).toBeNull();
  });
});

function ran(...cases: LocalCaseResult[]): LocalRunReport {
  return { kind: "ran", cases };
}

describe("exitCodeForLocalRun", () => {
  test("all pass → 0", () => {
    expect(
      exitCodeForLocalRun(ran({ name: "case-01", status: "pass" }))
    ).toBe(0);
  });

  test("ran clean with no expected outputs → 0", () => {
    expect(
      exitCodeForLocalRun(ran({ name: "case-01", status: "ran" }))
    ).toBe(0);
  });

  test("any fail → 1", () => {
    expect(
      exitCodeForLocalRun(
        ran({ name: "case-01", status: "pass" }, { name: "case-02", status: "fail" })
      )
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
    expect(
      exitCodeForLocalRun(ran({ name: "case-01", status: "timeout" }))
    ).toBe(1);
  });

  test("setup arms: no-cases & unsupported → 0, no-harness → 1", () => {
    expect(exitCodeForLocalRun({ kind: "no-cases" })).toBe(0);
    expect(exitCodeForLocalRun({ kind: "unsupported", langSlug: "rust" })).toBe(0);
    expect(
      exitCodeForLocalRun({ kind: "no-harness", langSlug: "python3", harnessFilename: "main.py" })
    ).toBe(1);
  });
});

// bun's test runner pipes stdout, so STDOUT_COLOR is false here — assertions
// match the plain (uncolored) text.
describe("presentResultView", () => {
  test("renders title, metrics, and per-case verdicts", () => {
    const view = buildLocalRunView(
      ran(
        { name: "case-01", status: "pass", expected: "[0,1]", actual: "[0,1]" },
        { name: "case-02", status: "fail", expected: "[0,1]", actual: "[1,0]" }
      )
    );
    const out = presentResultView(view);
    expect(out).toContain("Local: 1/2 passed");
    expect(out).toContain("Passed: 1/2");
    expect(out).toContain("✓ case-01");
    expect(out).toContain("✗ case-02");
    // fail → indented Expected / Your Output sections (mirrors ResultBody)
    expect(out).toMatch(/Expected\s+\[0,1\]/);
    expect(out).toMatch(/Your Output\s+\[1,0\]/);
  });

  test("shows an errored case with its (error) suffix and message", () => {
    const out = presentResultView(
      buildLocalRunView(ran({ name: "case-01", status: "error", actual: "NameError: x" }))
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
