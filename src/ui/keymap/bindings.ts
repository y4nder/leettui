// Per-scope binding-only specs (browseGlobalBindings, topicPanelBindings, …) plus the
// `bindingsFor` expander. Each Binding[] is mounted via `useBindings` from the React
// component that owns its scope; conditional rendering handles activation. The bindings only
// name commands (by string) — the catalog itself lives in commands/.

import type { KeyEvent, Renderable } from "@opentui/core";
import type { Binding, KeyLike } from "@opentui/keymap";

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
  // Plain `h` is free in browse (only ctrl+h traverses panels); it opens the
  // recently-viewed history modal (Stage 20).
  "recent.open": "h",
  "filter.cycleDifficulty": "shift+d",
  "problem.daily": "d",
  "search.start": "/",
  "help.open": "?",
  "debug.open": "`",
  "db.sync": "*",
  "palette.open": "ctrl+p",
  // Ctrl+g opens the git UI (lazygit) in the solutions dir — the version-control
  // escape hatch (Stage 22). Plain `g`/`G` are taken (gg/G jumps); ctrl+g is the
  // idiomatic lazygit-launch binding.
  "git.openUi": "ctrl+g",
  "update.dismiss": "x",
  "app.quit": "q",
});

// Mounted only while the topics panel is focused. j/k move the topic cursor (which
// live-filters the question list), gg/G jump to ends, Ctrl+d/Ctrl+u jump a half page;
// Enter hands focus to the questions panel.
export const topicPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "topic.next": ["j", "down"],
  "topic.prev": ["k", "up"],
  "topic.first": "gg",
  "topic.last": "shift+g",
  "topic.halfDown": "ctrl+d",
  "topic.halfUp": "ctrl+u",
  "focus.questions": "return",
});

// Mounted only while the questions panel is focused. j/k move the question cursor,
// gg/G jump to ends, Ctrl+d/Ctrl+u jump a half page, Enter opens the problem view, and
// the question-targeted solve actions (open editor / run / submit / yank URL) act on
// the selected question.
export const questionPanelBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "question.next": ["j", "down"],
  "question.prev": ["k", "up"],
  "question.first": "gg",
  "question.last": "shift+g",
  "question.halfDown": "ctrl+d",
  "question.halfUp": "ctrl+u",
  "problem.enter": "return",
  "problem.openEditor": "e",
  "browse.openWorkspace": "w",
  "problem.run": "shift+r",
  "problem.submit": "s",
  "question.yankUrl": "y",
});

// Daily-challenge popup. Enter opens the problem in the full problem view (mirrors
// the questions-panel Enter convention); Esc closes. j/k scroll the description.
export const popupBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "popup.enterProblem": "return",
  "popup.close": "escape",
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp": ["k", "up"],
});

export const resultBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "result.close": ["escape", "return"],
});

// Mounted by ChangelogPopup while open (Stage 18). j/k scroll the release notes
// (reusing the shared popup scroller), `o` opens the full release page on GitHub,
// Esc/q close back to browse.
export const changelogBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "popup.scrollDown": ["j", "down"],
  "popup.scrollUp": ["k", "up"],
  "changelog.openGithub": "o",
  "changelog.close": ["escape", "q"],
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
  "problem.openWorkspace": "w",
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
  // `d` deletes the focused solution (Stage 16). Panel-scoped (only the Solutions
  // panel mounts this layer) + a confirm modal — two deliberate steps for an
  // irreversible filesystem delete, so it can't mis-fire from another panel.
  "problem.deleteSolution": "d",
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

// Mounted by DeleteSolutionPrompt while open (Stage 16). A true modal like
// problemHelpBindings: ProblemView gates the global + panel layers off while
// deleteConfirm is set, so these y/Enter (delete) · n/Esc (cancel) keys are the
// only live ones — the destructive delete can't fire behind the prompt.
export const deletePromptBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "solution.deleteConfirm": ["y", "return"],
  "solution.deleteCancel": ["n", "escape", "q"],
});

export const pickerBindings: Binding<Renderable, KeyEvent>[] = bindingsFor({
  "picker.next": ["j", "down"],
  "picker.prev": ["k", "up"],
  "picker.confirm": "return",
  "picker.openEditor": "o",
  "picker.cancel": ["escape", "q"],
});
