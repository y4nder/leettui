// Command catalog and per-scope binding specs built on top of @opentui/keymap.
//
// This barrel re-exports the entire public surface of the keymap module so external import
// sites (`from "../keymap"`, `from "../../ui/keymap"`, the test's `./keymap`) resolve
// unchanged after the split from a single keymap.ts into this directory.
//
// Architecture:
// - One global command-only layer holds every command + its metadata. It is
//   registered once at boot via `installKeymap` (runtime.ts).
// - Per-scope binding-only layers (browseGlobalBindings, topicPanelBindings, ...) are
//   registered via `useBindings` from within React components that only mount
//   while their mode is active. No mode field-gating; conditional rendering
//   handles activation.
// - Search-mode 1-char text input falls through via a `key:after` intercept
//   installed in `installKeymap`.
//
// Module map: runtime (singletons + boot wiring), command (CommandSpec/makeCommand),
// commands/* (the catalog), bindings (per-scope specs), scopes (introspection + footer
// segments), format (key formatting leaf).

export type { ActionCategory } from "./command";

export {
  type AppKeymap,
  getKeymap,
  installKeymap,
  registerPopupScroller,
  registerProblemScroller,
} from "./runtime";

export {
  browseGlobalBindings,
  changelogBindings,
  debugBindings,
  deletePromptBindings,
  helpBindings,
  notesBindings,
  pickerBindings,
  popupBindings,
  problemGlobalBindings,
  problemHelpBindings,
  questionPanelBindings,
  relatedPanelBindings,
  resultBindings,
  scrollPanelBindings,
  searchBindings,
  solutionsPanelBindings,
  topicPanelBindings,
} from "./bindings";

export {
  type ScopeBinding,
  describeScope,
  footerSegments,
  isProblemScopeEntryVisible,
  isScopeEntryVisible,
} from "./scopes";

export {
  fitFooter,
  formatKeys,
  formatKeyToken,
  panelBindings,
  problemPanelBindings,
} from "./format";
