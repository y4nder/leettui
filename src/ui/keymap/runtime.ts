// Runtime singletons + boot wiring for the keymap.
//
// Owns the module-level mutable state the command catalog and boot path reach:
// - the _keymap / _renderer singletons (+ getKeymap() / getRenderer())
// - the imperative scroll registries (popup + per-problem-panel scrollboxes) and the
//   scroll* helpers the commands call
// - installKeymap() itself, which assigns the singletons in-place (no cross-module setter
//   needed) and wires the search-mode key:after text-input intercept.
//
// installKeymap lives here (not a separate install.ts) precisely so it can write the
// module-private _keymap/_renderer directly — see the refactor plan's advisor note.

import type { CliRenderer, KeyEvent, Renderable, ScrollBoxRenderable } from "@opentui/core";
import type { Command, Keymap } from "@opentui/keymap";
import { registerDefaultKeys, registerMetadataFields } from "@opentui/keymap/addons";

import { useAppStore } from "../store";
import type { ProblemPanel } from "../store";
import { logKey } from "../../debug";
import { COMMANDS } from "./commands";

export type AppKeymap = Keymap<Renderable, KeyEvent>;

let _renderer: CliRenderer | null = null;
let _keymap: AppKeymap | null = null;

export function getKeymap(): AppKeymap {
  if (!_keymap) throw new Error("Keymap not initialized; call installKeymap() at boot");
  return _keymap;
}

export function getRenderer(): CliRenderer | null {
  return _renderer;
}

// The currently-open popup's scrollbox (daily-challenge description, notes). Modals are
// exclusive, so a single handle suffices; popups register theirs via a callback ref and
// the popup.scroll* commands drive it. (Replaces the dead _popupScroll counter, which
// incremented a ref nothing read — now wired to a real scrollbox.)
let _activePopupScroller: ScrollBoxRenderable | null = null;

export function registerPopupScroller(box: ScrollBoxRenderable | null): void {
  _activePopupScroller = box;
}

export function scrollActivePopup(delta: number): void {
  _activePopupScroller?.scrollBy({ x: 0, y: delta }, "step");
}

// Module-level handles to the ProblemView scrollboxes, keyed by panel (same idea as the
// popup scroller above, but ProblemView panels coexist so focus selects which one scrolls).
// Populated via callback refs from ProblemView — imperative renderables can't live in the
// store, but the focused-panel *identity* does (problem.focusedPanel), so the scroll
// commands stay single-source: read the focused panel, then scrollBy its registered box.
const _problemScrollers: Partial<Record<ProblemPanel, ScrollBoxRenderable | null>> = {};

export function registerProblemScroller(
  panel: ProblemPanel,
  box: ScrollBoxRenderable | null,
): void {
  _problemScrollers[panel] = box;
}

export function scrollFocusedProblemPanel(delta: number): void {
  const p = useAppStore.getState().problem;
  if (!p) return;
  _problemScrollers[p.focusedPanel]?.scrollBy({ x: 0, y: delta }, "step");
}

export function installKeymap(keymap: AppKeymap, renderer: CliRenderer): void {
  _keymap = keymap;
  _renderer = renderer;

  registerDefaultKeys(keymap);
  registerMetadataFields(keymap);

  keymap.registerLayer({ commands: COMMANDS as Command<Renderable, KeyEvent>[] });

  // Search-mode text input fallthrough: any unbound 1-char printable key with
  // no modifiers gets appended to the search needle.
  keymap.intercept("key:after", (ctx) => {
    if (ctx.reason !== "no-match") return;
    if (ctx.eventType !== "press") return;
    const s = useAppStore.getState();
    if (s.mode !== "search") return;
    const name = ctx.event.name ?? "";
    // The space key arrives as name "space" (not " "); map it back to a literal space.
    const char = name === "space" ? " " : name;
    if (char.length !== 1) return;
    if (ctx.event.ctrl || ctx.event.meta) return;
    const active = s.focusedPanel === "topics" ? s.topicNeedle : s.searchNeedle;
    logKey(char, "", s.mode, `updateSearch(+${char})`);
    s.updateSearch(active + char);
  });
}
