// Scope introspection shared by the status-bar footer and the help popup. Built from the
// static binding specs joined to the command catalog, so both surfaces read one source of
// truth and never drift from the live keymap (and stay correct even though the panel layers
// are unregistered while a modal like help is open). Keys/titles come from here, not from
// runtime `getCommandEntries()`.
//
// footerSegments lives here (not in format.ts) because it calls describeScope — keeping
// format.ts a downstream leaf and the dependency one-way (scopes.ts → format.ts).

import type { KeyEvent, Renderable } from "@opentui/core";
import type { Binding } from "@opentui/keymap";

import type { BrowsePanel } from "../store";
import { COMMAND_BY_NAME, SHORT_BY_NAME } from "./commands";
import { browseGlobalBindings } from "./bindings";
import { formatKeyToken, panelBindings } from "./format";

export interface ScopeBinding {
  cmd: string;
  keys: string[]; // raw key tokens bound to this command, in declaration order
  title: string;
  short?: string;
  group?: string;
}

// Group a binding spec by command (one command may carry several key aliases).
export function describeScope(bindings: Binding<Renderable, KeyEvent>[]): ScopeBinding[] {
  const order: string[] = [];
  const keysByCmd = new Map<string, string[]>();
  for (const b of bindings) {
    const cmd = String(b.cmd);
    const existing = keysByCmd.get(cmd);
    if (existing) {
      existing.push(String(b.key));
    } else {
      keysByCmd.set(cmd, [String(b.key)]);
      order.push(cmd);
    }
  }
  return order.map((cmd) => {
    const command = COMMAND_BY_NAME.get(cmd);
    return {
      cmd,
      keys: keysByCmd.get(cmd) ?? [],
      title: (command?.title as string | undefined) ?? cmd,
      short: SHORT_BY_NAME.get(cmd),
      group: command?.group as string | undefined,
    };
  });
}

// Modal commands never surface here; debug commands only when LEETTUI_DEBUG is on.
export function isScopeEntryVisible(b: ScopeBinding, debugEnabled: boolean): boolean {
  if (b.group === "modal") return false;
  if (b.group === "debug" && !debugEnabled) return false;
  return true;
}

// ProblemView help variant (Stage 12 item 5): the problem-view commands are all
// group:"modal" (hidden from the browse palette/help), but the problem help popup is
// exactly where they should surface — so keep modal, only gate debug on the debug flag.
export function isProblemScopeEntryVisible(b: ScopeBinding, debugEnabled: boolean): boolean {
  return !(b.group === "debug" && !debugEnabled);
}

// Terse, focus-aware footer hints: the focused panel's local keys first, then the
// always-available global keys. Only commands with a `short` label appear; commands
// that share a `short` (e.g. next/prev → "Navigate") merge into one `key/key` segment.
export function footerSegments(
  panel: BrowsePanel,
  debugEnabled: boolean,
): { keys: string; label: string }[] {
  const segs: { keys: string; label: string }[] = [];
  const byShort = new Map<string, number>();
  for (const scope of [describeScope(panelBindings(panel)), describeScope(browseGlobalBindings)]) {
    for (const b of scope) {
      if (!b.short || !isScopeEntryVisible(b, debugEnabled)) continue;
      const key = formatKeyToken(b.keys[0] ?? "");
      const at = byShort.get(b.short);
      if (at != null) {
        segs[at]!.keys += `/${key}`;
      } else {
        byShort.set(b.short, segs.length);
        segs.push({ keys: key, label: b.short });
      }
    }
  }
  return segs;
}
