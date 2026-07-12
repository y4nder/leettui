// Command infrastructure: the CommandSpec shape, the makeCommand factory, and the
// ActionCategory display-metadata type. The SHORT_BY_NAME map does NOT live here — it is
// colocated with COMMAND_BY_NAME in commands/index.ts so it is built as the catalog is
// assembled (avoids a mutated-export import-order hazard). makeCommand therefore *returns*
// the short value alongside the Command for commands/index.ts to collect.

import type { KeyEvent, Renderable } from "@opentui/core";
import type { Command } from "@opentui/keymap";

import { useAppStore } from "@/ui/store";
import { logKey } from "@/debug";

export type ActionCategory = "Navigation" | "Solve" | "View" | "Search" | "System";

export interface CommandSpec {
  name: string;
  title: string;
  category: ActionCategory;
  group?: "modal" | "debug";
  // Terse footer label (e.g. "Run"). The full `title` is too long for the
  // one-line status bar, so only commands that opt in via `short` show there.
  short?: string;
  run: () => void;
}

// A built command paired with its (optional) terse footer label. commands/*.ts modules
// emit arrays of these; commands/index.ts collects COMMANDS + SHORT_BY_NAME from them.
export interface CommandEntry {
  cmd: Command<Renderable, KeyEvent>;
  short: string | undefined;
}

// Build a Command from a spec, returning the (optional) terse footer label so the catalog
// assembler can populate SHORT_BY_NAME as it builds COMMANDS.
export function makeCommand(spec: CommandSpec): CommandEntry {
  const cmd: Command<Renderable, KeyEvent> = {
    name: spec.name,
    title: spec.title,
    category: spec.category,
    run: () => {
      try {
        spec.run();
      } catch (err) {
        logKey(spec.name, "", useAppStore.getState().mode, `error: ${(err as Error).message}`);
      }
    },
  };
  if (spec.group) cmd.group = spec.group;
  return { cmd, short: spec.short };
}
