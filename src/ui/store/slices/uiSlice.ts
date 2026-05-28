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
  | "problem";

export interface SolutionPickerState {
  snippets: CodeSnippet[];
  // langSlug -> filename for solutions that already exist on disk
  existingByLangSlug: Record<string, string>;
  index: number;
}

export interface ProblemViewState {
  question: DbQuestion;
  description: string;
  solutions: string[];
  focusedSolutionIndex: number;
  result: ResultView | null;
  solutionPicker: SolutionPickerState | null;
}

export interface UiSlice {
  mode: AppMode;
  popupTitle: string;
  popupContent: string;
  selectTitle: string;
  selectItems: string[];
  selectResolve: ((index: number | null) => void) | null;
  resultView: ResultView | null;
  problem: ProblemViewState | null;

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

  enterProblemView: (init: {
    question: DbQuestion;
    description: string;
    solutions: string[];
  }) => void;
  exitProblemView: () => void;
  setProblemSolutions: (solutions: string[], focusFilename?: string) => void;
  setProblemResult: (view: ResultView | null) => void;
  openSolutionPicker: (snippets: CodeSnippet[], existingByLangSlug: Record<string, string>, initialLangSlug?: string) => void;
  movePicker: (delta: number) => void;
  closeSolutionPicker: () => void;
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  mode: "browse",
  popupTitle: "",
  popupContent: "",
  selectTitle: "",
  selectItems: [],
  selectResolve: null,
  resultView: null,
  problem: null,

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
      },
    }),

  exitProblemView: () => set({ mode: "browse", problem: null }),

  setProblemSolutions: (solutions, focusFilename) =>
    set((state) => {
      if (!state.problem) return {};
      let focusedSolutionIndex = state.problem.focusedSolutionIndex;
      if (focusFilename) {
        const idx = solutions.indexOf(focusFilename);
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

  openSolutionPicker: (snippets, existingByLangSlug, initialLangSlug) =>
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
          solutionPicker: { snippets, existingByLangSlug, index },
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
});
