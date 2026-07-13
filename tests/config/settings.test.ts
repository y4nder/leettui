// Tests the settings-editor metadata table (SETTINGS) and its per-setting coercers.
// The coercers are pure, so they're exercised directly (no filesystem); `read()` is
// deliberately NOT called here since it would hit loadConfig() and touch ~/.config.

import { describe, expect, test } from "bun:test";
import { LANGUAGE_SLUGS, SETTINGS, type SettingSpec } from "@/config/settings";

function byId(id: string): SettingSpec {
  const spec = SETTINGS.find((s) => s.id === id);
  if (!spec) throw new Error(`missing setting ${id}`);
  return spec;
}

describe("SETTINGS table shape", () => {
  test("every entry is well-formed", () => {
    for (const s of SETTINGS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.section.length).toBeGreaterThan(0);
      expect(s.key.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.read).toBe("function");
      expect(typeof s.coerce).toBe("function");
      // enum settings must supply their option source; others must not.
      if (s.kind === "enum") expect(typeof s.options).toBe("function");
    }
  });

  test("ids are unique", () => {
    expect(new Set(SETTINGS.map((s) => s.id)).size).toBe(SETTINGS.length);
  });
});

describe("enum coercion", () => {
  test("language.default accepts an in-set slug and rejects the rest", () => {
    const lang = byId("language.default");
    expect(lang.coerce("rust")).toBe("rust");
    expect(lang.coerce("cobol")).toBeNull();
  });

  test("editor.detach coerces auto/true/false", () => {
    const detach = byId("editor.detach");
    expect(detach.coerce("auto")).toBe("auto");
    expect(detach.coerce("true")).toBe(true);
    expect(detach.coerce("false")).toBe(false);
    expect(detach.coerce("garbage")).toBe("auto");
  });

  test("update.auto coerces to a real boolean and rejects the rest", () => {
    const auto = byId("update.auto");
    expect(auto.kind).toBe("enum");
    expect(auto.options?.()).toEqual(["true", "false"]);
    expect(auto.coerce("true")).toBe(true);
    expect(auto.coerce(" FALSE ")).toBe(false);
    // Rejected (null) rather than defaulted — the editor keeps the edit open.
    expect(auto.coerce("garbage")).toBeNull();
    expect(auto.coerce("")).toBeNull();
  });
});

describe("number coercion (scroll.jump_rows)", () => {
  const jump = byId("scroll.jump_rows");
  test("a valid count passes through", () => {
    expect(jump.coerce("25")).toBe(25);
    expect(jump.coerce("  30  ")).toBe(30);
  });
  test("zero clamps up to the default", () => {
    expect(jump.coerce("0")).toBe(10);
  });
  test("a non-integer is rejected", () => {
    expect(jump.coerce("abc")).toBeNull();
    expect(jump.coerce("1.5")).toBeNull();
    expect(jump.coerce("-4")).toBeNull();
  });
});

describe("text coercion trims", () => {
  test("editor.command / git.ui trim and allow empty", () => {
    expect(byId("editor.command").coerce("  code --wait  ")).toBe("code --wait");
    expect(byId("editor.command").coerce("")).toBe("");
    expect(byId("git.ui").coerce("  lazygit ")).toBe("lazygit");
  });
});

describe("LANGUAGE_SLUGS", () => {
  test("contains python3 and has no duplicates", () => {
    expect(LANGUAGE_SLUGS).toContain("python3");
    expect(new Set(LANGUAGE_SLUGS).size).toBe(LANGUAGE_SLUGS.length);
  });
});
