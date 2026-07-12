// Assembles the flat COMMANDS array from the per-domain command modules and owns the two
// lookup maps built from it: COMMAND_BY_NAME and SHORT_BY_NAME.
//
// ⚠ Order is observable: installKeymap registers COMMANDS as one layer and the command
// palette lists in array order. The concatenation below reproduces the original flat
// keymap.ts order exactly — browse navigation/focus, then the whole ProblemView block,
// then the browse question-targeted solve commands, then the system + theme commands
// (theme.open launches the picker; the theme cyclers follow), then the popup/result modals.
//
// SHORT_BY_NAME is colocated here (not in command.ts) on purpose: it is populated as the
// catalog is assembled, so any reader importing it gets a fully-built map — sidestepping the
// import-order hazard a mutated export in command.ts would create.

import type { KeyEvent, Renderable } from "@opentui/core";
import type { Command } from "@opentui/keymap";

import type { CommandEntry } from "@/ui/keymap/command";
import { browseNavCommands, browseSolveCommands } from "@/ui/keymap/commands/browse";
import { problemCommands } from "@/ui/keymap/commands/problem";
import { systemCommands } from "@/ui/keymap/commands/system";
import { modalCommands } from "@/ui/keymap/commands/modal";

const ENTRIES: CommandEntry[] = [
  ...browseNavCommands,
  ...problemCommands,
  ...browseSolveCommands,
  ...systemCommands,
  ...modalCommands,
];

export const COMMANDS: Command<Renderable, KeyEvent>[] = ENTRIES.map((e) => e.cmd);

export const COMMAND_BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

// command name → terse footer label, for the entries that opt into a `short`.
export const SHORT_BY_NAME = new Map<string, string>(
  ENTRIES.flatMap((e) => (e.short ? [[e.cmd.name, e.short] as [string, string]] : [])),
);
