// Key formatting + footer geometry. The string→string formatters (KEY_DISPLAY,
// formatKeyToken, formatKeys, fitFooter) are dependency-free; panelBindings /
// problemPanelBindings select a static Binding[] for a panel scope (used by the help
// popup's Local Keys), reading the binding constants from bindings.ts. This module imports
// from bindings.ts only — never from scopes.ts — so footerSegments (which calls describeScope)
// lives in scopes.ts and the dependency stays one-way (scopes.ts → format.ts).

import type { KeyEvent, Renderable } from "@opentui/core";
import type { Binding } from "@opentui/keymap";

import type { BrowsePanel, ProblemPanel } from "../store";
import {
  questionPanelBindings,
  relatedPanelBindings,
  scrollPanelBindings,
  solutionsPanelBindings,
  topicPanelBindings,
} from "./bindings";

const KEY_DISPLAY: Record<string, string> = {
  tab: "Tab",
  "shift+tab": "S-Tab",
  return: "Enter",
  escape: "Esc",
  up: "↑",
  down: "↓",
  backspace: "⌫",
};

export function formatKeyToken(raw: string): string {
  const mapped = KEY_DISPLAY[raw];
  if (mapped) return mapped;
  const shiftLetter = /^shift\+([a-z])$/.exec(raw);
  if (shiftLetter) return shiftLetter[1]!.toUpperCase();
  const ctrl = /^ctrl\+(.+)$/.exec(raw);
  if (ctrl) return `^${ctrl[1]!.toUpperCase()}`;
  return raw;
}

export function formatKeys(keys: string[]): string {
  return keys.map(formatKeyToken).join("/");
}

// The static binding spec for a panel scope, used by the help popup's Local Keys.
export function panelBindings(panel: BrowsePanel): Binding<Renderable, KeyEvent>[] {
  return panel === "topics" ? topicPanelBindings : questionPanelBindings;
}

// The static binding spec for a ProblemView panel's local keys (help popup Local Keys).
// Description and Result share the scroll layer; Solutions and Related have their own.
export function problemPanelBindings(panel: ProblemPanel): Binding<Renderable, KeyEvent>[] {
  switch (panel) {
    case "solutions":
      return solutionsPanelBindings;
    case "related":
      return relatedPanelBindings;
    default:
      return scrollPanelBindings;
  }
}

// Join footer segments into a single line that fits `maxWidth`, dropping overflow
// at a segment boundary with a trailing "…" (never clips mid-segment). Local keys
// come first in `segments`, so a narrow terminal keeps them and sheds globals.
export function fitFooter(segments: { keys: string; label: string }[], maxWidth: number): string {
  const SEP = "  ";
  const ELLIPSIS = " …";
  const parts: string[] = [];
  let len = 0;
  for (const seg of segments) {
    const text = `${seg.keys}:${seg.label}`;
    const add = (parts.length > 0 ? SEP.length : 0) + text.length;
    if (len + add > maxWidth) {
      if (parts.length === 0) return text.slice(0, Math.max(0, maxWidth));
      return parts.join(SEP) + ELLIPSIS;
    }
    parts.push(text);
    len += add;
  }
  return parts.join(SEP);
}
