// type: ui
// Owns the active mode and the ephemeral content of every popup. No domain data.

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";
import type { ResultView } from "../../../views/browse/resultView";
import type { DbQuestion } from "../../../db/questions";
import type { CodeSnippet } from "../../../api/types";

export type AppMode =
  | "browse"
  | "search"
  | "popup"
  | "select"
  | "result"
  | "help"
  | "debug"
  | "palette"
  | "problem"
  | "relocate"
  | "easterEgg";

export interface SolutionPickerState {
  snippets: CodeSnippet[];
  // langSlugs that already have a solution file on disk
  existing: Set<string>;
  index: number;
}

export interface ProblemViewState {
  question: DbQuestion;
  description: string;
  // langSlugs of solutions that exist on disk (the solution's identity)
  solutions: string[];
  focusedSolutionIndex: number;
  result: ResultView | null;
  solutionPicker: SolutionPickerState | null;
  // Shared, language-agnostic notes popup. Non-null while open; `content` is
  // the rendered markdown (empty string when notes.md doesn't exist yet).
  notes: { content: string } | null;
}

export interface UiSlice {
  mode: AppMode;
  themeVersion: number;
  popupTitle: string;
  popupContent: string;
  selectTitle: string;
  selectItems: string[];
  selectResolve: ((index: number | null) => void) | null;
  resultView: ResultView | null;
  problem: ProblemViewState | null;
  // The newer release tag to advertise in the top banner, or null when none.
  updateAvailable: string | null;

  bumpThemeVersion: () => void;
  setUpdateAvailable: (tag: string | null) => void;
  setMode: (mode: AppMode) => void;
  showPopup: (title: string, content: string) => void;
  hidePopup: () => void;
  showSelect: (title: string, items: string[], resolve: (index: number | null) => void) => void;
  hideSelect: () => void;
  showResult: (view: ResultView) => void;
  hideResult: () => void;
  showHelp: () => void;
  hideHelp: () => void;
  showDebug: () => void;
  hideDebug: () => void;
  showPalette: () => void;
  hidePalette: () => void;
  showRelocate: () => void;
  hideRelocate: () => void;
  showEasterEgg: () => void;
  hideEasterEgg: () => void;

  enterProblemView: (init: {
    question: DbQuestion;
    description: string;
    solutions: string[];
  }) => void;
  exitProblemView: () => void;
  setProblemSolutions: (solutions: string[], focusLangSlug?: string) => void;
  setProblemResult: (view: ResultView | null) => void;
  openSolutionPicker: (snippets: CodeSnippet[], existing: Set<string>, initialLangSlug?: string) => void;
  movePicker: (delta: number) => void;
  closeSolutionPicker: () => void;
  openNotes: (content: string) => void;
  setNotesContent: (content: string) => void;
  closeNotes: () => void;
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  mode: "browse",
  themeVersion: 0,
  popupTitle: "",
  popupContent: "",
  selectTitle: "",
  selectItems: [],
  selectResolve: null,
  resultView: null,
  problem: null,
  updateAvailable: null,

  bumpThemeVersion: () => set((s) => ({ themeVersion: s.themeVersion + 1 })),
  setUpdateAvailable: (tag) => set({ updateAvailable: tag }),
  setMode: (mode) => set({ mode }),

  showPopup: (title, content) => set({ mode: "popup", popupTitle: title, popupContent: content }),
  hidePopup: () => set({ mode: "browse", popupTitle: "", popupContent: "" }),

  showSelect: (title, items, resolve) =>
    set({ mode: "select", selectTitle: title, selectItems: items, selectResolve: resolve }),
  hideSelect: () =>
    set({ mode: "browse", selectTitle: "", selectItems: [], selectResolve: null }),

  showResult: (view) => set({ mode: "result", resultView: view }),
  hideResult: () => set({ mode: "browse", resultView: null }),

  showHelp: () => set({ mode: "help" }),
  hideHelp: () => set({ mode: "browse" }),

  showDebug: () => set({ mode: "debug" }),
  hideDebug: () => set({ mode: "browse" }),

  showPalette: () => set({ mode: "palette" }),
  hidePalette: () => set({ mode: "browse" }),

  // In-TUI "change solutions directory" prompt (Stage 10 item 4). A bare mode
  // toggle — the ChangeLocationPrompt owns its own input/confirm/done sub-state.
  showRelocate: () => set({ mode: "relocate" }),
  hideRelocate: () => set({ mode: "browse" }),

  // Easter egg: a full-screen ASCII art reveal that lingers until any key is pressed.
  showEasterEgg: () => set({ mode: "easterEgg" }),
  hideEasterEgg: () => set({ mode: "browse" }),

  enterProblemView: ({ question, description, solutions }) =>
    set({
      mode: "problem",
      problem: {
        question,
        description,
        solutions,
        focusedSolutionIndex: 0,
        result: null,
        solutionPicker: null,
        notes: null,
      },
    }),

  exitProblemView: () => set({ mode: "browse", problem: null }),

  setProblemSolutions: (solutions, focusLangSlug) =>
    set((state) => {
      if (!state.problem) return {};
      let focusedSolutionIndex = state.problem.focusedSolutionIndex;
      if (focusLangSlug) {
        const idx = solutions.indexOf(focusLangSlug);
        if (idx >= 0) focusedSolutionIndex = idx;
      }
      if (focusedSolutionIndex >= solutions.length) {
        focusedSolutionIndex = Math.max(0, solutions.length - 1);
      }
      return { problem: { ...state.problem, solutions, focusedSolutionIndex } };
    }),

  setProblemResult: (view) =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, result: view } };
    }),

  openSolutionPicker: (snippets, existing, initialLangSlug) =>
    set((state) => {
      if (!state.problem) return {};
      let index = 0;
      if (initialLangSlug) {
        const found = snippets.findIndex((s) => s.langSlug === initialLangSlug);
        if (found >= 0) index = found;
      }
      return {
        problem: {
          ...state.problem,
          solutionPicker: { snippets, existing, index },
        },
      };
    }),

  movePicker: (delta) =>
    set((state) => {
      const picker = state.problem?.solutionPicker;
      if (!state.problem || !picker) return {};
      const next = Math.max(0, Math.min(picker.snippets.length - 1, picker.index + delta));
      return { problem: { ...state.problem, solutionPicker: { ...picker, index: next } } };
    }),

  closeSolutionPicker: () =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, solutionPicker: null } };
    }),

  openNotes: (content) =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, notes: { content } } };
    }),

  setNotesContent: (content) =>
    set((state) => {
      if (!state.problem?.notes) return {};
      return { problem: { ...state.problem, notes: { content } } };
    }),

  closeNotes: () =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, notes: null } };
    }),
});
