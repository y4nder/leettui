// Tests the pure comment-preserving TOML rewrite that backs persistThemeName
// (Stage 2/theme) and persistSolutionsDir (Stage 10). Both go through
// `upsertSectionString`, so exercising the theme cases here is what proves the
// item-3 refactor kept theme persistence behavior-identical.

import { describe, expect, test } from "bun:test";
import { parse } from "smol-toml";
import { upsertSectionString } from "./index";

// A config with the same commented-out scaffolding as the shipped DEFAULT_TOML:
// `[paths]`/`[theme]` exist only as comments, so they are NOT real sections.
const FRESH = `# LeetCode authentication tokens
csrftoken = "abc"
lc_session = "def"

# [paths]
# db = ""        # Default: ~/.local/share/leettui/questions.db
# solutions = "" # Default: ~/.local/share/leettui/solutions/

# [theme]
# name = "tokyo-night"
`;

describe("upsertSectionString — append a new section", () => {
  test("paths.solutions on a fresh config appends a real [paths] section", () => {
    const next = upsertSectionString(FRESH, "paths", "solutions", "/home/me/leetcode");
    expect(parse(next).paths).toEqual({ solutions: "/home/me/leetcode" });
    // The commented scaffolding is untouched, and tokens survive.
    expect(next).toContain('# solutions = ""');
    expect(parse(next).csrftoken).toBe("abc");
  });

  test("theme.name on a fresh config appends a real [theme] section", () => {
    const next = upsertSectionString(FRESH, "theme", "name", "catppuccin");
    expect((parse(next).theme as { name: string }).name).toBe("catppuccin");
  });
});

describe("upsertSectionString — insert into an existing section", () => {
  const withPaths = `csrftoken = "x"

[paths]
db = "/data/q.db"  # keep me
`;

  test("adds the key under the existing header, preserving siblings + comments", () => {
    const next = upsertSectionString(withPaths, "paths", "solutions", "/sol");
    expect(parse(next).paths).toEqual({ db: "/data/q.db", solutions: "/sol" });
    expect(next).toContain("# keep me");
  });
});

describe("upsertSectionString — replace an existing value", () => {
  const withValue = `[theme]
name = "tokyo-night"  # my pick
`;

  test("replaces the value in place, keeping the trailing comment line", () => {
    const next = upsertSectionString(withValue, "theme", "name", "system");
    expect((parse(next).theme as { name: string }).name).toBe("system");
    expect(next).toContain("# my pick");
  });

  test("escapes embedded quotes and backslashes in the value", () => {
    const next = upsertSectionString(FRESH, "paths", "solutions", 'C:\\Users\\a "b"');
    expect((parse(next).paths as { solutions: string }).solutions).toBe('C:\\Users\\a "b"');
  });
});
