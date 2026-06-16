// Command catalog and per-scope binding specs built on top of @opentui/keymap.
//
// Architecture:
// - One global command-only layer holds every command + its metadata. It is
//   registered once at boot via `installKeymap`.
// - Per-scope binding-only layers (browseGlobalBindings, topicPanelBindings, ...) are
//   registered via `useBindings` from within React components that only mount
//   while their mode is active. No mode field-gating; conditional rendering
//   handles activation.
// - Search-mode 1-char text input falls through via a `key:after` intercept
//   installed in `installKeymap`.

import type { CliRenderer, KeyEvent, Renderable, ScrollBoxRenderable } from "@opentui/core";
import type { Binding, Command, KeyLike, Keymap } from "@opentui/keymap";
import { registerDefaultKeys, registerMetadataFields } from "@opentui/keymap/addons";

import { useAppStore } from "./store";
import type { BrowsePanel, ProblemPanel } from "./store";
import { setTheme, cycleTheme, listThemeNames } from "./theme";
import { isDebugEnabled, dumpToString, logKey } from "../debug";
import {
  handleViewDailyChallenge,
  handleOpenEditor,
  handleRunSolution,
  handleSubmitSolution,
  handleSyncDb,
  handleRandomQuestion,
  handleYankUrl,
  handleReauth,
} from "../views/browse/handlers";
import {
  handleEnterProblemFromCursor,
  handleEnterRelated,
  handleExitProblemView,
  handleProblemOpenEditor,
  handleProblemRun,
  handleProblemSubmit,
  handleProblemTestLocal,
  handleOpenSolutionPicker,
  handlePickerMove,
  handlePickerCancel,
  handlePickerConfirm,
  handlePickerOpenEditor,
  handleOpenNotes,
  handleEditNotes,
  handleCloseNotes,
} from "../views/problem/handlers";

export type AppKeymap = Keymap<Renderable, KeyEvent>;

export type ActionCategory = "Navigation" | "Solve" | "View" | "Search" | "System";

let _renderer: CliRenderer | null = null;
let _keymap: AppKeymap | null = null;

export function getKeymap(): AppKeymap {
  if (!_keymap) throw new Error("Keymap not initialized; call installKeymap() at boot");
  return _keymap;
}

// The currently-open popup's scrollbox (daily-challenge description, notes). Modals are
// exclusive, so a single handle suffices; popups register theirs via a callback ref and
// the popup.scroll* commands drive it. (Replaces the dead _popupScroll counter, which
// incremented a ref nothing read — now wired to a real scrollbox.)
let _activePopupScroller: ScrollBoxRenderable | null = null;

export function registerPopupScroller(box: ScrollBoxRenderable | null): void {
  _activePopupScroller = box;
}

function scrollActivePopup(delta: number): void {
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

function scrollFocusedProblemPanel(delta: number): void {
  const p = useAppStore.getState().problem;
  if (!p) return;
  _problemScrollers[p.focusedPanel]?.scrollBy({ x: 0, y: delta }, "step");
}

interface CommandSpec {
  name: string;
  title: string;
  category: ActionCategory;
  group?: "modal" | "debug";
  // Terse footer label (e.g. "Run"). The full `title` is too long for the
  // one-line status bar, so only commands that opt in via `short` show there.
  short?: string;
  run: () => void;
}

// command name → terse footer label. Populated as commands are constructed.
const SHORT_BY_NAME = new Map<string, string>();

function makeCommand(spec: CommandSpec): Command<Renderable, KeyEvent> {
  if (spec.short) SHORT_BY_NAME.set(spec.name, spec.short);
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
    short: "Navigate",
    run: () => useAppStore.getState().moveQuestion(1),
  }),
  makeCommand({
    name: "question.prev",
    title: "Previous question",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveQuestion(-1),
  }),
  makeCommand({
    name: "topic.next",
    title: "Next topic",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveTopic(1),
  }),
  makeCommand({
    name: "topic.prev",
    title: "Previous topic",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveTopic(-1),
  }),
  makeCommand({
    name: "question.random",
    title: "Jump to random question",
    category: "Navigation",
    run: () => handleRandomQuestion(),
  }),
  makeCommand({
    name: "question.first",
    title: "Jump to first question",
    category: "Navigation",
    run: () => useAppStore.getState().setQuestionIndex(0),
  }),
  makeCommand({
    name: "question.last",
    title: "Jump to last question",
    category: "Navigation",
    run: () => useAppStore.getState().setQuestionIndex(Number.MAX_SAFE_INTEGER),
  }),
  makeCommand({
    name: "filter.cycleDifficulty",
    title: "Cycle difficulty filter (Easy → Medium → Hard → All)",
    category: "View",
    run: () => useAppStore.getState().cycleDifficulty(),
  }),

  makeCommand({
    name: "focus.cycle",
    title: "Focus next panel",
    category: "Navigation",
    short: "Focus",
    run: () => useAppStore.getState().cycleFocusedPanel(1),
  }),
  makeCommand({
    name: "focus.cyclePrev",
    title: "Focus previous panel",
    category: "Navigation",
    run: () => useAppStore.getState().cycleFocusedPanel(-1),
  }),
  makeCommand({
    name: "focus.topics",
    title: "Focus topics panel",
    category: "Navigation",
    run: () => useAppStore.getState().setFocusedPanel("topics"),
  }),
  makeCommand({
    name: "focus.questions",
    title: "Focus questions panel",
    category: "Navigation",
    run: () => useAppStore.getState().setFocusedPanel("questions"),
  }),

  makeCommand({
    name: "problem.enter",
    title: "Open problem view",
    category: "View",
    short: "View",
    run: () => handleEnterProblemFromCursor("return"),
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
    name: "problem.testLocal",
    title: "Run focused solution against local tests",
    category: "Solve",
    group: "modal",
    run: () => handleProblemTestLocal("t"),
  }),
  makeCommand({
    name: "problem.notes",
    title: "Open notes",
    category: "View",
    group: "modal",
    run: () => handleOpenNotes(),
  }),
  makeCommand({
    name: "notes.edit",
    title: "Notes: edit in $EDITOR",
    category: "View",
    group: "modal",
    run: () => {
      if (_renderer) handleEditNotes("e", _renderer);
    },
  }),
  makeCommand({
    name: "notes.close",
    title: "Notes: close",
    category: "View",
    group: "modal",
    run: () => handleCloseNotes(),
  }),
  makeCommand({
    name: "problem.escape",
    title: "Close problem view",
    category: "View",
    group: "modal",
    run: () => {
      // Defer to an open sub-modal's own cancel binding (picker / notes / help).
      // (Help also gates ProblemGlobalBindings off while open, so escape can't even
      // reach here then — this guard is belt-and-suspenders.)
      const p = useAppStore.getState().problem;
      if (p?.solutionPicker || p?.notes || p?.help) return;
      handleExitProblemView();
    },
  }),
  makeCommand({
    name: "problem.help",
    title: "Show keybindings help",
    category: "System",
    group: "modal",
    run: () => {
      // Don't stack help over an open picker/notes — those keep their own layers while
      // the global `?` stays mounted beneath them.
      const p = useAppStore.getState().problem;
      if (p?.solutionPicker || p?.notes) return;
      useAppStore.getState().openProblemHelp();
    },
  }),
  makeCommand({
    name: "problem.helpClose",
    title: "Close help",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().closeProblemHelp(),
  }),
  // ProblemView focus traversal + panel scroll (Stage 12). Grouped "modal" like the
  // other problem-view commands: hidden from the browse command palette. The
  // ProblemView help popup (a later item) surfaces them via its own scope filter.
  makeCommand({
    name: "problem.focusCycle",
    title: "Focus next panel",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().cycleProblemFocusedPanel(1),
  }),
  makeCommand({
    name: "problem.focusCyclePrev",
    title: "Focus previous panel",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().cycleProblemFocusedPanel(-1),
  }),
  makeCommand({
    name: "problem.focusDescription",
    title: "Focus description panel",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().setProblemFocusedPanel("description"),
  }),
  makeCommand({
    name: "problem.focusSolutions",
    title: "Focus solutions panel",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().setProblemFocusedPanel("solutions"),
  }),
  makeCommand({
    name: "problem.focusResult",
    title: "Focus result panel",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().setProblemFocusedPanel("result"),
  }),
  makeCommand({
    name: "problem.focusRelated",
    title: "Focus related questions panel",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().setProblemFocusedPanel("related"),
  }),
  makeCommand({
    name: "problem.focusLeft",
    title: "Focus panel left",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().moveProblemFocus("left"),
  }),
  makeCommand({
    name: "problem.focusRight",
    title: "Focus panel right",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().moveProblemFocus("right"),
  }),
  makeCommand({
    name: "problem.focusUp",
    title: "Focus panel up",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().moveProblemFocus("up"),
  }),
  makeCommand({
    name: "problem.focusDown",
    title: "Focus panel down",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().moveProblemFocus("down"),
  }),
  makeCommand({
    name: "problem.scrollDown",
    title: "Scroll panel down",
    category: "Navigation",
    group: "modal",
    run: () => scrollFocusedProblemPanel(1),
  }),
  makeCommand({
    name: "problem.scrollUp",
    title: "Scroll panel up",
    category: "Navigation",
    group: "modal",
    run: () => scrollFocusedProblemPanel(-1),
  }),
  makeCommand({
    name: "problem.solutionNext",
    title: "Next solution",
    category: "Solve",
    group: "modal",
    run: () => useAppStore.getState().moveFocusedSolution(1),
  }),
  makeCommand({
    name: "problem.solutionPrev",
    title: "Previous solution",
    category: "Solve",
    group: "modal",
    run: () => useAppStore.getState().moveFocusedSolution(-1),
  }),
  makeCommand({
    name: "problem.relatedNext",
    title: "Next related question",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().moveFocusedRelated(1),
  }),
  makeCommand({
    name: "problem.relatedPrev",
    title: "Previous related question",
    category: "Navigation",
    group: "modal",
    run: () => useAppStore.getState().moveFocusedRelated(-1),
  }),
  makeCommand({
    name: "problem.relatedEnter",
    title: "Open related question",
    category: "View",
    group: "modal",
    run: () => handleEnterRelated("return"),
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
    short: "Edit",
    run: () => {
      if (_renderer) handleOpenEditor("e", _renderer);
    },
  }),
  makeCommand({
    name: "problem.run",
    title: "Run solution against examples",
    category: "Solve",
    short: "Run",
    run: () => handleRunSolution("R"),
  }),
  makeCommand({
    name: "problem.submit",
    title: "Submit solution",
    category: "Solve",
    short: "Submit",
    run: () => handleSubmitSolution("s"),
  }),

  makeCommand({
    name: "question.yankUrl",
    title: "Yank problem URL to clipboard",
    category: "View",
    short: "Yank",
    run: () => handleYankUrl("y"),
  }),

  makeCommand({
    name: "search.start",
    title: "Search / filter questions",
    category: "Search",
    short: "Search",
    run: () => useAppStore.getState().startSearch(),
  }),

  makeCommand({
    name: "help.open",
    title: "Show help screen",
    category: "System",
    short: "Help",
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
    name: "auth.reauth",
    title: "Re-authenticate (refresh LeetCode session)",
    category: "System",
    run: () => {
      if (_renderer) handleReauth(_renderer);
    },
  }),
  makeCommand({
    name: "solutions.changeDir",
    title: "Change solutions directory",
    category: "System",
    run: () => useAppStore.getState().showRelocate(),
  }),
  makeCommand({
    name: "palette.open",
    title: "Open command palette",
    category: "System",
    short: "Cmds",
    run: () => useAppStore.getState().showPalette(),
  }),
  makeCommand({
    name: "update.dismiss",
    title: "Dismiss update notification",
    category: "System",
    // No-op when no banner is showing; hides it for the rest of the session
    // (not persisted — it reappears on the next launch if still out of date).
    run: () => useAppStore.getState().setUpdateAvailable(null),
  }),
  makeCommand({
    name: "egg.splash",
    title: "✦ Reveal the leettui logo",
    category: "View",
    run: () => useAppStore.getState().showEasterEgg(),
  }),
  makeCommand({
    name: "app.quit",
    title: "Quit",
    category: "System",
    short: "Quit",
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
    run: () => scrollActivePopup(1),
  }),
  makeCommand({
    name: "popup.scrollUp",
    title: "Scroll popup up",
    category: "View",
    group: "modal",
    run: () => scrollActivePopup(-1),
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
      const active = s.focusedPanel === "topics" ? s.topicNeedle : s.searchNeedle;
      s.updateSearch(active.slice(0, -1));
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

// Panel-independent browse bindings. Always mounted in browse mode regardless of
// which panel is focused — only genuinely cross-panel commands live here (focus,
// search, system overlays, view-wide filters/jumps, and the update-banner dismiss).
// `r` (random) and `x` (dismiss) stay global deliberately: random is a view-wide jump
// and dismiss targets the banner chrome, not a panel. Question-targeted actions
// (e/R/s/y) moved to questionPanelBindings.
export const browseGlobalBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  // Tab/Shift+Tab cycle; Ctrl+h/Ctrl+l traverse left/right (same commands —
  // PANEL_ORDER is the spatial left→right order, so Ctrl+l = next, Ctrl+h = prev).
  "focus.cycle": ["tab", "ctrl+l"],
  "focus.cyclePrev": ["shift+tab", "ctrl+h"],
  "focus.topics": "1",
  "focus.questions": "2",
  "question.random": "r",
  "filter.cycleDifficulty": "shift+d",
  "problem.daily": "d",
  "search.start": "/",
  "help.open": "?",
  "debug.open": "`",
  "db.sync": "*",
  "palette.open": "ctrl+p",
  "update.dismiss": "x",
  "app.quit": "q",
});

// Mounted only while the topics panel is focused. j/k move the topic cursor (which
// live-filters the question list); Enter hands focus to the questions panel.
export const topicPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "topic.next": ["j", "down"],
  "topic.prev": ["k", "up"],
  "focus.questions": "return",
});

// Mounted only while the questions panel is focused. j/k move the question cursor,
// gg/G jump to ends, Enter opens the problem view, and the question-targeted solve
// actions (open editor / run / submit / yank URL) act on the selected question.
export const questionPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "question.next": ["j", "down"],
  "question.prev": ["k", "up"],
  "question.first": "gg",
  "question.last": "shift+g",
  "problem.enter": "return",
  "problem.openEditor": "e",
  "problem.run": "shift+r",
  "problem.submit": "s",
  "question.yankUrl": "y",
});

export const popupBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "popup.close": ["escape", "return"],
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp": ["k", "up"],
});

export const resultBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "result.close": ["escape", "return"],
});

export const helpBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "help.close": ["escape", "return"],
});

export const debugBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "debug.close": ["escape", "return"],
  "debug.yank": "y",
});

export const searchBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "search.end": ["escape", "return"],
  "search.backspace": "backspace",
});

// Always mounted in problem mode regardless of focused panel. Solve actions stay here:
// they target the focused *solution* (focusedSolutionIndex), which is independent of the
// focused *panel*. Also focus traversal (Tab/Shift+Tab linear + Ctrl+h/j/k/l spatial,
// [1]/[2]/[3]), notes, the update-banner dismiss, and escape. Only panel-relative keys
// (j/k) live in panel layers.
export const problemGlobalBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.openPicker": "f",
  "problem.editorOpen": "e",
  "problem.runFocused": "shift+r",
  "problem.testLocal": "t",
  "problem.submitFocused": "s",
  "problem.notes": "n",
  // Tab/Shift+Tab cycle linearly (wrap); Ctrl+h/j/k/l move spatially across the 2D
  // layout (left/down/up/right, no wrap); [1]/[2]/[3] jump. NOTE: some terminals deliver
  // Ctrl+j as LF (= Enter) and Ctrl+h as Backspace — on those, those two may not register
  // as focus moves; Tab + the remaining Ctrl keys still reach every panel.
  "problem.focusCycle": "tab",
  "problem.focusCyclePrev": "shift+tab",
  "problem.focusLeft": "ctrl+h",
  "problem.focusRight": "ctrl+l",
  "problem.focusDown": "ctrl+j",
  "problem.focusUp": "ctrl+k",
  "problem.focusDescription": "1",
  "problem.focusSolutions": "2",
  "problem.focusResult": "3",
  "problem.focusRelated": "4",
  "problem.help": "?",
  "update.dismiss": "x",
  "problem.escape": ["escape", "q"],
});

// Mounted only while a scroll panel (Description or Result) is focused. The scroll
// commands self-route to the focused panel's scrollbox, so both panels share one layer.
export const scrollPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.scrollDown": ["j", "down"],
  "problem.scrollUp": ["k", "up"],
});

// Mounted only while the Solutions panel is focused. j/k cycle the active solution
// (what e/R/s/t target), Enter opens it in $EDITOR — reusing problem.editorOpen so
// Enter and `e` stay identical (incl. the "press f" info-message on an empty list).
// This is the layer-swap linchpin: j/k means "cycle" here vs "scroll" in scrollPanelBindings,
// but the two layers are mutually exclusive (gated on focusedPanel), so they never collide.
export const solutionsPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.solutionNext": ["j", "down"],
  "problem.solutionPrev": ["k", "up"],
  "problem.editorOpen": "return",
});

// Mounted only while the Related Questions panel is focused (Stage 12 item 4). j/k move
// the cursor over similar questions; Enter navigates-replace to the focused one (when
// navigable). Another layer-swap instance: j/k means "cycle related" here, distinct from
// "scroll" / "cycle solution" in the sibling layers, all mutually exclusive on focusedPanel.
export const relatedPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.relatedNext": ["j", "down"],
  "problem.relatedPrev": ["k", "up"],
  "problem.relatedEnter": "return",
});

// Mounted by the ProblemView HelpPopup while open (Stage 12 item 5). Esc/Enter/q all
// close back to the problem view. Help also gates the global + panel layers off while
// open (see ProblemView), so this is the only active problem layer — a true modal.
export const problemHelpBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "problem.helpClose": ["escape", "return", "q"],
});

// Mounted by NotesPopup while open. `e` shadows problem.editorOpen and
// escape/q shadow problem.escape — both resolve to this (newer) layer.
export const notesBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "notes.edit": "e",
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp": ["k", "up"],
  "notes.close": ["escape", "q"],
});

export const pickerBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "picker.next": ["j", "down"],
  "picker.prev": ["k", "up"],
  "picker.confirm": "return",
  "picker.openEditor": "o",
  "picker.cancel": ["escape", "q"],
});

// --- Scope introspection (shared by the status-bar footer and help popup) ---
// Built from the static binding specs above joined to the command catalog, so both
// surfaces read one source of truth and never drift from the live keymap (and stay
// correct even though the panel layers are unregistered while a modal like help is
// open). Keys/titles come from here, not from runtime `getCommandEntries()`.

const COMMAND_BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

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
    const active = s.focusedPanel === "topics" ? s.topicNeedle : s.searchNeedle;
    logKey(name, "", s.mode, `updateSearch(+${name})`);
    s.updateSearch(active + name);
  });
}
