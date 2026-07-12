// Guards the termcn-imported themes: every palette must convert to a complete Theme
// (no undefined token — catches a mapping typo), every registered name must resolve to a
// real preset (not the fallback), and the four legacy names must still exist (config-compat
// after overwriting the old hand-tuned presets with termcn equivalents).

import { describe, expect, test } from "bun:test";
import { fromTermcn, TERMCN_NAMES, TERMCN_PALETTES } from "@/ui/themes/termcn";
import { listThemeNames, resolveTheme, type Theme } from "@/ui/themes/index";

const THEME_KEYS: (keyof Theme)[] = [
  "easy",
  "medium",
  "hard",
  "accepted",
  "attempted",
  "locked",
  "border",
  "borderFocused",
  "bg",
  "bgHighlight",
  "bgPopup",
  "surface",
  "surfaceAlt",
  "fg",
  "fgDim",
  "fgAccent",
  "subtle",
  "accent",
  "mutedAccent",
  "success",
  "warn",
  "error",
  "info",
  "statusBar",
  "statusBarFg",
];

describe("fromTermcn converter", () => {
  test("every palette yields all 27 tokens with no undefined", () => {
    for (const [name, palette] of Object.entries(TERMCN_PALETTES)) {
      const theme = fromTermcn(palette);
      for (const key of THEME_KEYS) {
        expect(theme[key], `${name}.${key}`).toBeTruthy();
      }
    }
  });

  // Selected rows render `fgAccent` text on a `bgHighlight` background; if the two are
  // equal the text is invisible (many termcn themes set selection == primary — the bug
  // that drove mapping bgHighlight to `muted` instead of `selection`). The highlight must
  // also differ from the popup surface it sits on, or the selected row can't be seen.
  test("selected-row highlight differs from its text and from the popup surface", () => {
    for (const [name, palette] of Object.entries(TERMCN_PALETTES)) {
      const t = fromTermcn(palette);
      const hl = String(t.bgHighlight).toLowerCase();
      expect(hl, `${name}: bgHighlight vs fgAccent`).not.toBe(String(t.fgAccent).toLowerCase());
      expect(hl, `${name}: bgHighlight vs bgPopup`).not.toBe(String(t.bgPopup).toLowerCase());
    }
  });

  // The *unfocused* panel's selected row renders `mutedAccent` text on a `surface`
  // background; equal colors make it illegible (the bug: mapping mutedAccent to the
  // inconsistent `secondary`, which for some themes matched the surface tint).
  test("unfocused selected-row text differs from its surface background", () => {
    for (const [name, palette] of Object.entries(TERMCN_PALETTES)) {
      const t = fromTermcn(palette);
      expect(String(t.mutedAccent).toLowerCase(), `${name}: mutedAccent vs surface`).not.toBe(
        String(t.surface).toLowerCase(),
      );
    }
  });
});

describe("theme registry", () => {
  test("listThemeNames includes every termcn name plus system", () => {
    const names = listThemeNames();
    for (const name of TERMCN_NAMES) expect(names).toContain(name);
    expect(names).toContain("system");
  });

  test("every registered name resolves to a real preset (not the fallback)", () => {
    // resolveTheme falls back to tokyo-night for unknown names; assert each name's bg
    // matches its own palette so a name silently collapsing to the fallback is caught.
    for (const name of TERMCN_NAMES) {
      const theme = resolveTheme(name);
      expect(theme.bg, name).toBe(TERMCN_PALETTES[name]!.background);
    }
  });

  test("legacy theme names still resolve (config-compat)", () => {
    for (const legacy of ["tokyo-night", "catppuccin", "rose-pine", "nord"]) {
      expect(TERMCN_NAMES).toContain(legacy);
      expect(resolveTheme(legacy)).toBeDefined();
    }
  });

  test("an unknown name falls back rather than throwing", () => {
    expect(resolveTheme("no-such-theme")).toBe(resolveTheme("tokyo-night"));
  });
});
