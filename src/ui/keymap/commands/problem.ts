// ProblemView commands: enter/exit, focus traversal + panel scroll, solution + related
// cursor moves, the solution picker, notes, and help. All grouped "modal" so they stay
// hidden from the browse command palette; the ProblemView help popup surfaces them via its
// own scope filter.

import { useAppStore } from "../../store";
import { makeCommand, type CommandEntry } from "../command";
import { getRenderer, scrollFocusedProblemPanel } from "../runtime";
import {
  handleCloseNotes,
  handleEditNotes,
  handleEnterProblemFromCursor,
  handleEnterRelated,
  handleExitProblemView,
  handleOpenNotes,
  handleOpenProblemWorkspace,
  handleOpenSolutionPicker,
  handlePickerCancel,
  handlePickerConfirm,
  handlePickerMove,
  handlePickerOpenEditor,
  handleProblemOpenEditor,
  handleProblemRun,
  handleProblemSubmit,
  handleProblemTestLocal,
} from "../../../views/problem/handlers";
import { handleViewDailyChallenge } from "../../../views/browse/handlers";

export const problemCommands: CommandEntry[] = [
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
      const r = getRenderer();
      if (r) handleProblemOpenEditor("e", r);
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
    name: "problem.openWorkspace",
    title: "Open problem workspace (whole folder) in editor",
    category: "Solve",
    group: "modal",
    short: "Wkspc",
    run: () => {
      const r = getRenderer();
      if (r) handleOpenProblemWorkspace("w", r);
    },
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
      const r = getRenderer();
      if (r) handleEditNotes("e", r);
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
      const r = getRenderer();
      if (r) handlePickerConfirm("return", r);
    },
  }),
  makeCommand({
    name: "picker.openEditor",
    title: "Picker: select + open in editor",
    category: "Solve",
    group: "modal",
    run: () => {
      const r = getRenderer();
      if (r) handlePickerOpenEditor("o", r);
    },
  }),
  makeCommand({
    name: "picker.cancel",
    title: "Picker: cancel",
    category: "Solve",
    group: "modal",
    run: () => handlePickerCancel(),
  }),
];
