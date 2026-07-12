// Tests the pure comment-preserving TOML rewrite that backs persistThemeName
// (Stage 2/theme) and persistSolutionsDir (Stage 10). Both go through
// `upsertSectionString`, so exercising the theme cases here is what proves the
// item-3 refactor kept theme persistence behavior-identical.

import { describe, expect, test } from "bun:test";
import { parse } from "smol-toml";
import { upsertSectionRaw, upsertSectionString } from "@/config/index";

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

  test("replaces a previously BARE scalar with a quoted one (detach cycle bug)", () => {
    // editor.detach flips writers: true/false persist bare (upsertSectionRaw),
    // "auto" persists a quoted string (this fn). Cycling false → "auto" must
    // REPLACE the bare value, not append a duplicate detach key (which produced a
    // "redefine an already defined value" TOML crash on the next load).
    const withBare = `[editor]
detach = false  # forced blocking
`;
    const next = upsertSectionString(withBare, "editor", "detach", "auto");
    expect((parse(next).editor as { detach: string }).detach).toBe("auto");
    expect(next).toContain("# forced blocking");
    // Exactly one detach line survives.
    expect(next.match(/^\s*detach\s*=/gm)).toHaveLength(1);
  });
});

describe("upsertSectionRaw — bare (unquoted) scalars", () => {
  test("appends a new section with a bare integer that parses as a NUMBER", () => {
    // The crux: quoting jump_rows would make clampJumpRows reject it. A bare int
    // must round-trip through smol-toml as a real number.
    const next = upsertSectionRaw(FRESH, "scroll", "jump_rows", "20");
    const scroll = parse(next).scroll as { jump_rows: number };
    expect(scroll.jump_rows).toBe(20);
    expect(typeof scroll.jump_rows).toBe("number");
  });

  test("writes a bare boolean that parses as a real boolean", () => {
    const next = upsertSectionRaw(FRESH, "editor", "detach", "true");
    const editor = parse(next).editor as { detach: boolean };
    expect(editor.detach).toBe(true);
    expect(typeof editor.detach).toBe("boolean");
  });

  test("replaces a previously QUOTED value with a bare one (fixes a hand-edit)", () => {
    const withQuoted = `[scroll]
jump_rows = "10"  # oops, quoted by hand
`;
    const next = upsertSectionRaw(withQuoted, "scroll", "jump_rows", "15");
    expect((parse(next).scroll as { jump_rows: number }).jump_rows).toBe(15);
    expect(next).toContain("# oops, quoted by hand");
  });

  test("adds a bare key under an existing section, preserving siblings + comments", () => {
    const withScroll = `[scroll]
# tuning
jump_rows = 5
`;
    const next = upsertSectionRaw(withScroll, "scroll", "jump_rows", "8");
    expect((parse(next).scroll as { jump_rows: number }).jump_rows).toBe(8);
    expect(next).toContain("# tuning");
  });
});
