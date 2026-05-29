// Command catalog and per-scope binding specs built on top of @opentui/keymap.
//
// Architecture:
// - One global command-only layer holds every command + its metadata. It is
//   registered once at boot via `installKeymap`.
// - Per-scope binding-only layers (browseBindings, popupBindings, ...) are
//   registered via `useBindings` from within React components that only mount
//   while their mode is active. No mode field-gating; conditional rendering
//   handles activation.
// - Search-mode 1-char text input falls through via a `key:after` intercept
//   installed in `installKeymap`.

import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core";
import type { Binding, Command, KeyLike, Keymap } from "@opentui/keymap";
import { registerDefaultKeys, registerMetadataFields } from "@opentui/keymap/addons";

import { useAppStore } from "./store";
import { setTheme, cycleTheme, listThemeNames } from "./theme";
import { isDebugEnabled, dumpToString, logKey } from "../debug";
import {
  handleViewDailyChallenge,
  handleOpenEditor,
  handleRunSolution,
  handleSubmitSolution,
  handleSyncDb,
  handleRandomQuestion,
} from "../views/browse/handlers";
import {
  handleEnterProblemView,
  handleExitProblemView,
  handleProblemOpenEditor,
  handleProblemRun,
  handleProblemSubmit,
  handleOpenSolutionPicker,
  handlePickerMove,
  handlePickerCancel,
  handlePickerConfirm,
  handlePickerOpenEditor,
} from "../views/problem/handlers";

export type AppKeymap = Keymap<Renderable, KeyEvent>;

export type ActionCategory = "Navigation" | "Solve" | "View" | "Search" | "System";

let _renderer: CliRenderer | null = null;
let _keymap: AppKeymap | null = null;
const _popupScroll = { current: 0 };

export function getKeymap(): AppKeymap {
  if (!_keymap) throw new Error("Keymap not initialized; call installKeymap() at boot");
  return _keymap;
}

export function popupScrollRef(): { current: number } {
  return _popupScroll;
}

interface CommandSpec {
  name: string;
  title: string;
  category: ActionCategory;
  group?: "modal" | "debug";
  run: () => void;
}

function makeCommand(spec: CommandSpec): Command<Renderable, KeyEvent> {
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
  return cmd;
}

function prettyThemeName(name: string): string {
  // kebab → Title Case: "tokyo-night" → "Tokyo Night", "system" → "System"
  return name
    .split(/[-_]/)
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function buildThemeSetCommands(): Command<Renderable, KeyEvent>[] {
  return listThemeNames().map((name) =>
    makeCommand({
      name: `theme.set.${name}`,
      title: `Theme: ${prettyThemeName(name)}`,
      category: "System",
      run: () => setTheme(name, { persist: true }),
    }),
  );
}

const COMMANDS: Command<Renderable, KeyEvent>[] = [
  makeCommand({
    name: "question.next",
    title: "Next question",
    category: "Navigation",
    run: () => useAppStore.getState().moveQuestion(1),
  }),
  makeCommand({
    name: "question.prev",
    title: "Previous question",
    category: "Navigation",
    run: () => useAppStore.getState().moveQuestion(-1),
  }),
  makeCommand({
    name: "topic.next",
    title: "Next topic",
    category: "Navigation",
    run: () => useAppStore.getState().moveTopic(1),
  }),
  makeCommand({
    name: "topic.prev",
    title: "Previous topic",
    category: "Navigation",
    run: () => useAppStore.getState().moveTopic(-1),
  }),
  makeCommand({
    name: "question.random",
    title: "Jump to random question",
    category: "Navigation",
    run: () => handleRandomQuestion(),
  }),

  makeCommand({
    name: "problem.enter",
    title: "Open problem view",
    category: "View",
    run: () => handleEnterProblemView("return"),
  }),
  makeCommand({
    name: "problem.daily",
    title: "Today's daily challenge",
    category: "View",
    run: () => handleViewDailyChallenge("d"),
  }),
  makeCommand({
    name: "problem.exit",
    title: "Close problem view",
    category: "View",
    group: "modal",
    run: () => handleExitProblemView(),
  }),
  makeCommand({
    name: "problem.openPicker",
    title: "Open solution picker",
    category: "Solve",
    group: "modal",
    run: () => handleOpenSolutionPicker("f"),
  }),
  makeCommand({
    name: "problem.editorOpen",
    title: "Open solution in editor",
    category: "Solve",
    group: "modal",
    run: () => {
      if (_renderer) handleProblemOpenEditor("e", _renderer);
    },
  }),
  makeCommand({
    name: "problem.runFocused",
    title: "Run focused solution",
    category: "Solve",
    group: "modal",
    run: () => handleProblemRun("shift+r"),
  }),
  makeCommand({
    name: "problem.submitFocused",
    title: "Submit focused solution",
    category: "Solve",
    group: "modal",
    run: () => handleProblemSubmit("s"),
  }),
  makeCommand({
    name: "problem.escape",
    title: "Close problem view",
    category: "View",
    group: "modal",
    run: () => {
      // Defer to the picker's own cancel binding when it's open.
      if (useAppStore.getState().problem?.solutionPicker) return;
      handleExitProblemView();
    },
  }),
  makeCommand({
    name: "picker.next",
    title: "Picker: next entry",
    category: "Navigation",
    group: "modal",
    run: () => handlePickerMove(1),
  }),
  makeCommand({
    name: "picker.prev",
    title: "Picker: previous entry",
    category: "Navigation",
    group: "modal",
    run: () => handlePickerMove(-1),
  }),
  makeCommand({
    name: "picker.confirm",
    title: "Picker: select (existing) or create + edit (new)",
    category: "Solve",
    group: "modal",
    run: () => {
      if (_renderer) handlePickerConfirm("return", _renderer);
    },
  }),
  makeCommand({
    name: "picker.openEditor",
    title: "Picker: select + open in editor",
    category: "Solve",
    group: "modal",
    run: () => {
      if (_renderer) handlePickerOpenEditor("o", _renderer);
    },
  }),
  makeCommand({
    name: "picker.cancel",
    title: "Picker: cancel",
    category: "Solve",
    group: "modal",
    run: () => handlePickerCancel(),
  }),

  makeCommand({
    name: "problem.openEditor",
    title: "Open in editor",
    category: "Solve",
    run: () => {
      if (_renderer) handleOpenEditor("e", _renderer);
    },
  }),
  makeCommand({
    name: "problem.run",
    title: "Run solution against examples",
    category: "Solve",
    run: () => handleRunSolution("R"),
  }),
  makeCommand({
    name: "problem.submit",
    title: "Submit solution",
    category: "Solve",
    run: () => handleSubmitSolution("s"),
  }),

  makeCommand({
    name: "search.start",
    title: "Search / filter questions",
    category: "Search",
    run: () => useAppStore.getState().startSearch(),
  }),

  makeCommand({
    name: "help.open",
    title: "Show help screen",
    category: "System",
    run: () => useAppStore.getState().showHelp(),
  }),
  makeCommand({
    name: "debug.open",
    title: "Show debug overlay",
    category: "System",
    group: "debug",
    run: () => {
      if (isDebugEnabled()) useAppStore.getState().showDebug();
    },
  }),
  makeCommand({
    name: "db.sync",
    title: "Sync problem database",
    category: "System",
    run: () => handleSyncDb("*"),
  }),
  makeCommand({
    name: "palette.open",
    title: "Open command palette",
    category: "System",
    run: () => useAppStore.getState().showPalette(),
  }),
  makeCommand({
    name: "app.quit",
    title: "Quit",
    category: "System",
    run: () => _renderer?.destroy(),
  }),

  makeCommand({
    name: "theme.cycle.next",
    title: "Theme: cycle next",
    category: "System",
    run: () => cycleTheme(1),
  }),
  makeCommand({
    name: "theme.cycle.prev",
    title: "Theme: cycle previous",
    category: "System",
    run: () => cycleTheme(-1),
  }),

  // theme.set.<name> commands are appended below (one per preset) so each
  // shows up as its own searchable entry in the command palette.
  ...buildThemeSetCommands(),

  // Modal-only commands. Hidden from the palette via group: "modal".
  makeCommand({
    name: "popup.scrollDown",
    title: "Scroll popup down",
    category: "View",
    group: "modal",
    run: () => {
      _popupScroll.current += 1;
    },
  }),
  makeCommand({
    name: "popup.scrollUp",
    title: "Scroll popup up",
    category: "View",
    group: "modal",
    run: () => {
      _popupScroll.current -= 1;
    },
  }),
  makeCommand({
    name: "popup.close",
    title: "Close popup",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hidePopup(),
  }),
  makeCommand({
    name: "result.close",
    title: "Close result",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideResult(),
  }),
  makeCommand({
    name: "help.close",
    title: "Close help",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideHelp(),
  }),
  makeCommand({
    name: "debug.close",
    title: "Close debug",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideDebug(),
  }),
  makeCommand({
    name: "debug.yank",
    title: "Yank debug log to file",
    category: "System",
    group: "debug",
    run: () => {
      const s = useAppStore.getState();
      const log = dumpToString();
      Bun.write("/tmp/leettui-debug.log", log).then(() => {
        s.hideDebug();
        s.showResult({ kind: "info", title: "Log written to /tmp/leettui-debug.log" });
      });
    },
  }),
  makeCommand({
    name: "palette.close",
    title: "Close command palette",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hidePalette(),
  }),
  makeCommand({
    name: "search.backspace",
    title: "Search: delete char",
    category: "Search",
    group: "modal",
    run: () => {
      const s = useAppStore.getState();
      s.updateSearch(s.searchNeedle.slice(0, -1));
    },
  }),
  makeCommand({
    name: "search.end",
    title: "Exit search",
    category: "Search",
    group: "modal",
    run: () => useAppStore.getState().endSearch(),
  }),
];

// Expand `{ command: keys-or-key }` into a Binding[] suitable for a Layer.
// `commandBindings` from @opentui/keymap/extras only accepts a single key per
// command; this helper supports an array of aliases per command.
function bindingsFor(spec: Record<string, KeyLike | KeyLike[]>): Binding<Renderable, KeyEvent>[] {
  const out: Binding<Renderable, KeyEvent>[] = [];
  for (const [cmd, key] of Object.entries(spec)) {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) out.push({ key: k, cmd });
  }
  return out;
}

export const browseBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "question.next":      ["j", "down"],
  "question.prev":      ["k", "up"],
  "topic.next":         "t",
  "topic.prev":         "shift+t",
  "question.random":    "r",
  "problem.enter":      "return",
  "problem.daily":      "d",
  "problem.openEditor": "e",
  "problem.run":        "shift+r",
  "problem.submit":     "s",
  "search.start":       "/",
  "help.open":          "h",
  "debug.open":         "`",
  "db.sync":            "*",
  "palette.open":       "ctrl+p",
  "app.quit":           "q",
});

export const popupBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "popup.close":      ["escape", "return"],
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp":   ["k", "up"],
});

export const resultBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "result.close": ["escape", "return"],
});

export const helpBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "help.close": ["escape", "return"],
});

export const debugBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "debug.close": ["escape", "return"],
  "debug.yank":  "y",
});

export const searchBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "search.end":       ["escape", "return"],
  "search.backspace": "backspace",
});

export const problemBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.openPicker":    "f",
  "problem.editorOpen":    "e",
  "problem.runFocused":    "shift+r",
  "problem.submitFocused": "s",
  "problem.escape":        ["escape", "q"],
});

export const pickerBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "picker.next":       ["j", "down"],
  "picker.prev":       ["k", "up"],
  "picker.confirm":    "return",
  "picker.openEditor": "o",
  "picker.cancel":     ["escape", "q"],
});

export function installKeymap(keymap: AppKeymap, renderer: CliRenderer): void {
  _keymap = keymap;
  _renderer = renderer;

  registerDefaultKeys(keymap);
  registerMetadataFields(keymap);

  keymap.registerLayer({ commands: COMMANDS });

  // Search-mode text input fallthrough: any unbound 1-char printable key with
  // no modifiers gets appended to the search needle.
  keymap.intercept("key:after", (ctx) => {
    if (ctx.reason !== "no-match") return;
    if (ctx.eventType !== "press") return;
    const s = useAppStore.getState();
    if (s.mode !== "search") return;
    const name = ctx.event.name ?? "";
    if (name.length !== 1) return;
    if (ctx.event.ctrl || ctx.event.meta) return;
    logKey(name, "", s.mode, `updateSearch(+${name})`);
    s.updateSearch(s.searchNeedle + name);
  });
}
