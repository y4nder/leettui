// Theme-aware SyntaxStyle for the OpenTUI <markdown> component.
//
// <markdown> resolves tree-sitter scope names from its SyntaxStyle. The default
// `SyntaxStyle.create()` is un-themed, so headings, the bold "Example N:" /
// "Constraints:" labels LeetCode emits, inline code and links all render flat.
// `buildMarkdownSyntaxStyle()` maps those scopes onto the active theme tokens
// (read live from the `colors` proxy), and callers memoize it on `themeVersion`
// so it rebuilds when the user switches themes.

import { SyntaxStyle } from "@opentui/core";
import { colors } from "@/ui/theme";

export function buildMarkdownSyntaxStyle(): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "markup.heading": { fg: colors.fgAccent, bold: true },
    // LeetCode wraps section labels ("Example 1:", "Constraints:") in <strong>.
    "markup.strong": { fg: colors.fgAccent, bold: true },
    "markup.italic": { fg: colors.subtle, italic: true },
    // Inline code and fenced blocks (variable names, sample I/O).
    "markup.raw": { fg: colors.info },
    "markup.raw.block": { fg: colors.info },
    "markup.link": { fg: colors.accent, underline: true },
    "markup.link.label": { fg: colors.fgAccent },
    "markup.link.url": { fg: colors.accent, underline: true },
    "markup.list": { fg: colors.mutedAccent },
    "markup.quote": { fg: colors.fgDim },
    "markup.strikethrough": { fg: colors.fgDim, dim: true },
    punctuation: { fg: colors.fgDim },
  });
}
