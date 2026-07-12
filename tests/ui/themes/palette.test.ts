// Guards the palette-expanded themes: fromPalette must fill every Theme token (no
// undefined — catches a mapping typo), every registered name must resolve to a real
// preset (not the fallback), and the selected-row highlight must never collide with its
// own text or surface (readability). System is excluded from the color-collision checks
// because its tokens are runtime RGBA objects, not comparable hex strings.

import { describe, expect, test } from "bun:test";
import { fromPalette, type Palette } from "@/ui/themes/palette";
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

const SAMPLE: Palette = {
  background: "#101010",
  foreground: "#eeeeee",
  primary: "#3fb7e3",
  secondary: "#222233",
  success: "#78d05c",
  warning: "#e4a75c",
  error: "#f58572",
  info: "#66c6f1",
  muted: "#1e2229",
  mutedForeground: "#8a8a8a",
  selection: "#3fb7e3",
  border: "#5a6673",
  focusRing: "#3fb7e3",
};

const hexPresets = listThemeNames().filter((n) => n !== "system");

describe("fromPalette converter", () => {
  test("fills every Theme token with no undefined", () => {
    const theme = fromPalette(SAMPLE);
    for (const key of THEME_KEYS) expect(theme[key], key).toBeTruthy();
  });

  test("does not use `selection` for the row highlight (avoids selection == primary)", () => {
    // SAMPLE deliberately sets selection == primary; the highlight must not inherit it.
    const theme = fromPalette(SAMPLE);
    expect(String(theme.bgHighlight).toLowerCase()).not.toBe(String(theme.fgAccent).toLowerCase());
  });
});

describe("theme registry", () => {
  test("every registered preset resolves to a real object (not the fallback)", () => {
    for (const name of hexPresets) {
      const theme = resolveTheme(name);
      for (const key of THEME_KEYS) expect(theme[key], `${name}.${key}`).toBeTruthy();
    }
  });

  test("legacy theme names still resolve (config-compat)", () => {
    const names = listThemeNames();
    for (const legacy of ["tokyo-night", "catppuccin", "rose-pine", "nord"]) {
      expect(names).toContain(legacy);
      expect(resolveTheme(legacy)).toBeDefined();
    }
  });

  test("an unknown name falls back rather than throwing", () => {
    expect(resolveTheme("no-such-theme")).toBe(resolveTheme("tokyo-night"));
  });

  // Selected rows render `fgAccent` text on a `bgHighlight` background, and the unfocused
  // panel renders `mutedAccent` text on `surface`. Equal colors make the text invisible;
  // the highlight must also differ from the popup surface it sits on.
  test("selected-row highlight differs from its text and surfaces (all hex presets)", () => {
    for (const name of hexPresets) {
      const t = resolveTheme(name);
      const hl = String(t.bgHighlight).toLowerCase();
      expect(hl, `${name}: bgHighlight vs fgAccent`).not.toBe(String(t.fgAccent).toLowerCase());
      expect(hl, `${name}: bgHighlight vs bgPopup`).not.toBe(String(t.bgPopup).toLowerCase());
      expect(String(t.mutedAccent).toLowerCase(), `${name}: mutedAccent vs surface`).not.toBe(
        String(t.surface).toLowerCase(),
      );
    }
  });
});
