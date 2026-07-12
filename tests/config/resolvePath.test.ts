import { describe, expect, test, afterEach } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandPath, resolveBase, resolveConfigPath } from "@/config/resolvePath";

// homedir() is fixed by Bun at process launch, so the helpers and these tests
// observe the same value — comparisons against join(homedir(), ...) are valid
// in-process. Env vars, by contrast, are read at call time, so they can be set
// per-test (and must be cleaned up to avoid cross-test pollution).
const home = homedir();

afterEach(() => {
  delete process.env.LEETTUI_TEST_VAR;
});

describe("expandPath", () => {
  test("expands a bare tilde to the home dir", () => {
    expect(expandPath("~")).toBe(home);
  });

  test("expands a leading ~/ to the home dir", () => {
    expect(expandPath("~/leetcode")).toBe(join(home, "leetcode"));
  });

  test("leaves ~user untouched (we don't resolve other users' homes)", () => {
    expect(expandPath("~someone/x")).toBe("~someone/x");
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${VAR} in the test name is intentional
  test("substitutes $VAR and ${VAR}", () => {
    process.env.LEETTUI_TEST_VAR = "/data";
    expect(expandPath("$LEETTUI_TEST_VAR/sub")).toBe("/data/sub");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${VAR} is the literal syntax under test
    expect(expandPath("${LEETTUI_TEST_VAR}/sub")).toBe("/data/sub");
  });

  test("an unset var expands to empty string (shell behavior)", () => {
    expect(expandPath("$LEETTUI_TEST_VAR/x")).toBe("/x");
  });

  test("leaves an already-absolute path unchanged", () => {
    expect(expandPath("/abs/path")).toBe("/abs/path");
  });

  test("leaves a bare relative path unchanged", () => {
    expect(expandPath("rel/path")).toBe("rel/path");
  });
});

describe("resolveBase (XDG policy)", () => {
  test("uses an absolute env value", () => {
    expect(resolveBase("/xdg/data", "/fallback")).toBe("/xdg/data");
  });

  test("expands a tilde env value to an absolute path and uses it", () => {
    expect(resolveBase("~/xdg", "/fallback")).toBe(join(home, "xdg"));
  });

  test("ignores an unset value", () => {
    expect(resolveBase(undefined, "/fallback")).toBe("/fallback");
  });

  test("ignores a relative value (spec: must fall back to default)", () => {
    expect(resolveBase("relative/xdg", "/fallback")).toBe("/fallback");
  });
});

describe("resolveConfigPath (config-path policy)", () => {
  test("returns an absolute path as-is", () => {
    expect(resolveConfigPath("/home/me/leetcode")).toBe("/home/me/leetcode");
  });

  test("expands a tilde to the home dir", () => {
    expect(resolveConfigPath("~/leetcode")).toBe(join(home, "leetcode"));
  });

  test("anchors a relative path to the home dir (cwd-independent)", () => {
    expect(resolveConfigPath("leetcode")).toBe(join(home, "leetcode"));
  });
});
