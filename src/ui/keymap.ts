// Typed keymap table. Maps (mode, chord) -> ActionId, plus action metadata
// consumed by the command palette and (in the future) the help screen.
//
// Search mode is special: only escape/return/backspace are bound here; any
// other 1-char key with no modifiers falls through to the search text-input
// handler in BrowseView.

import type { AppMode } from "./store";

export type ActionId =
  | "moveQuestionDown"
  | "moveQuestionUp"
  | "moveTopicNext"
  | "moveTopicPrev"
  | "viewProblem"
  | "viewDailyChallenge"
  | "openEditor"
  | "runSolution"
  | "submitSolution"
  | "startSearch"
  | "showHelp"
  | "showDebug"
  | "syncDb"
  | "randomQuestion"
  | "showCommandPalette"
  | "quit"
  | "scrollPopupDown"
  | "scrollPopupUp"
  | "closePopup"
  | "closeResult"
  | "closeHelp"
  | "closeDebug"
  | "yankDebug"
  | "closePalette"
  | "searchBackspace"
  | "endSearch";

export type ActionCategory = "Navigation" | "Solve" | "View" | "Search" | "System";

export interface ActionMeta {
  id: ActionId;
  title: string;
  category: ActionCategory;
  display: string; // shown in palette / cheatsheet
}

export interface KeyChord {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export const ACTIONS: Record<ActionId, ActionMeta> = {
  moveQuestionDown:    { id: "moveQuestionDown",    title: "Next question",                   category: "Navigation", display: "j / ↓" },
  moveQuestionUp:      { id: "moveQuestionUp",      title: "Previous question",               category: "Navigation", display: "k / ↑" },
  moveTopicNext:       { id: "moveTopicNext",       title: "Next topic",                      category: "Navigation", display: "t" },
  moveTopicPrev:       { id: "moveTopicPrev",       title: "Previous topic",                  category: "Navigation", display: "T" },
  randomQuestion:      { id: "randomQuestion",      title: "Jump to random question",         category: "Navigation", display: "r" },
  viewProblem:         { id: "viewProblem",         title: "View problem description",        category: "View",       display: "Enter" },
  viewDailyChallenge:  { id: "viewDailyChallenge",  title: "Today's daily challenge",         category: "View",       display: "d" },
  openEditor:          { id: "openEditor",          title: "Open in editor",                  category: "Solve",      display: "e" },
  runSolution:         { id: "runSolution",         title: "Run solution against examples",   category: "Solve",      display: "R" },
  submitSolution:      { id: "submitSolution",      title: "Submit solution",                 category: "Solve",      display: "s" },
  startSearch:         { id: "startSearch",         title: "Search / filter questions",       category: "Search",     display: "/" },
  showHelp:            { id: "showHelp",            title: "Show help screen",                category: "System",     display: "h" },
  showDebug:           { id: "showDebug",           title: "Show debug overlay",              category: "System",     display: "`" },
  syncDb:              { id: "syncDb",              title: "Sync problem database",           category: "System",     display: "*" },
  showCommandPalette:  { id: "showCommandPalette",  title: "Open command palette",            category: "System",     display: "Ctrl+P" },
  quit:                { id: "quit",                title: "Quit",                            category: "System",     display: "q" },

  // Modal-only actions — not surfaced in the palette.
  scrollPopupDown:     { id: "scrollPopupDown",     title: "Scroll popup down",               category: "View",       display: "j / ↓" },
  scrollPopupUp:       { id: "scrollPopupUp",       title: "Scroll popup up",                 category: "View",       display: "k / ↑" },
  closePopup:          { id: "closePopup",          title: "Close popup",                     category: "View",       display: "Esc / Enter" },
  closeResult:         { id: "closeResult",         title: "Close result",                    category: "View",       display: "Esc / Enter" },
  closeHelp:           { id: "closeHelp",           title: "Close help",                      category: "View",       display: "Esc / Enter" },
  closeDebug:          { id: "closeDebug",          title: "Close debug",                     category: "View",       display: "Esc / Enter" },
  yankDebug:           { id: "yankDebug",           title: "Yank debug log to file",          category: "System",     display: "y" },
  closePalette:        { id: "closePalette",        title: "Close command palette",           category: "View",       display: "Esc" },
  searchBackspace:     { id: "searchBackspace",     title: "Search: delete char",             category: "Search",     display: "Backspace" },
  endSearch:           { id: "endSearch",           title: "Exit search",                     category: "Search",     display: "Esc / Enter" },
};

type Binding = { chord: string; id: ActionId };

function chordKey(c: KeyChord): string {
  const mods = [c.ctrl && "ctrl", c.shift && "shift", c.meta && "meta"].filter(Boolean).join("+");
  return mods ? `${mods}+${c.key}` : c.key;
}

const BINDINGS: Record<AppMode, Binding[]> = {
  browse: [
    { chord: "j",              id: "moveQuestionDown" },
    { chord: "down",           id: "moveQuestionDown" },
    { chord: "k",              id: "moveQuestionUp" },
    { chord: "up",             id: "moveQuestionUp" },
    { chord: "t",              id: "moveTopicNext" },
    { chord: "shift+t",        id: "moveTopicPrev" },
    { chord: "return",         id: "viewProblem" },
    { chord: "d",              id: "viewDailyChallenge" },
    { chord: "e",              id: "openEditor" },
    { chord: "shift+r",        id: "runSolution" },
    { chord: "s",              id: "submitSolution" },
    { chord: "/",              id: "startSearch" },
    { chord: "r",              id: "randomQuestion" },
    { chord: "h",              id: "showHelp" },
    { chord: "`",              id: "showDebug" },
    { chord: "*",              id: "syncDb" },
    { chord: "ctrl+p",         id: "showCommandPalette" },
    { chord: "q",              id: "quit" },
  ],
  popup: [
    { chord: "escape",         id: "closePopup" },
    { chord: "return",         id: "closePopup" },
    { chord: "j",              id: "scrollPopupDown" },
    { chord: "down",           id: "scrollPopupDown" },
    { chord: "k",              id: "scrollPopupUp" },
    { chord: "up",             id: "scrollPopupUp" },
  ],
  result: [
    { chord: "escape",         id: "closeResult" },
    { chord: "return",         id: "closeResult" },
  ],
  help: [
    { chord: "escape",         id: "closeHelp" },
    { chord: "return",         id: "closeHelp" },
  ],
  debug: [
    { chord: "escape",         id: "closeDebug" },
    { chord: "return",         id: "closeDebug" },
    { chord: "y",              id: "yankDebug" },
  ],
  search: [
    { chord: "escape",         id: "endSearch" },
    { chord: "return",         id: "endSearch" },
    { chord: "backspace",      id: "searchBackspace" },
  ],
  // SelectPopup and CommandPalette own their own useKeyboard hooks for
  // navigation, so dispatch is a no-op while those modes are active.
  select: [],
  palette: [],
};

const TABLE: Record<AppMode, Map<string, ActionId>> = {
  browse:  new Map(BINDINGS.browse.map((b) => [b.chord, b.id])),
  popup:   new Map(BINDINGS.popup.map((b) => [b.chord, b.id])),
  result:  new Map(BINDINGS.result.map((b) => [b.chord, b.id])),
  help:    new Map(BINDINGS.help.map((b) => [b.chord, b.id])),
  debug:   new Map(BINDINGS.debug.map((b) => [b.chord, b.id])),
  search:  new Map(BINDINGS.search.map((b) => [b.chord, b.id])),
  select:  new Map(),
  palette: new Map(),
};

export function resolveAction(mode: AppMode, chord: KeyChord): ActionId | null {
  return TABLE[mode].get(chordKey(chord)) ?? null;
}

// Actions surfaced in the command palette. Modal-only actions are excluded —
// the palette is only reachable from browse mode.
const PALETTE_EXCLUDED: ReadonlySet<ActionId> = new Set([
  "scrollPopupDown",
  "scrollPopupUp",
  "closePopup",
  "closeResult",
  "closeHelp",
  "closeDebug",
  "yankDebug",
  "closePalette",
  "searchBackspace",
  "endSearch",
  "showCommandPalette",
]);

export function browseActions(): ActionMeta[] {
  return Object.values(ACTIONS).filter((a) => !PALETTE_EXCLUDED.has(a.id));
}
