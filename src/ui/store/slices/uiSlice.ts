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

export interface ProblemLangPicker {
  snippets: CodeSnippet[];
  index: number;
}

export interface ProblemViewState {
  question: DbQuestion;
  description: string;
  solutions: string[];
  focusedSolutionIndex: number;
  result: ResultView | null;
  langPicker: ProblemLangPicker | null;
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
  moveFocusedSolution: (delta: number) => void;
  setProblemResult: (view: ResultView | null) => void;
  openLangPicker: (snippets: CodeSnippet[]) => void;
  moveLangPicker: (delta: number) => void;
  closeLangPicker: () => void;
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
        langPicker: null,
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

  moveFocusedSolution: (delta) =>
    set((state) => {
      if (!state.problem) return {};
      const p = state.problem;
      if (p.langPicker) {
        const next = Math.max(
          0,
          Math.min(p.langPicker.snippets.length - 1, p.langPicker.index + delta)
        );
        return { problem: { ...p, langPicker: { ...p.langPicker, index: next } } };
      }
      if (p.solutions.length === 0) return {};
      const next = Math.max(
        0,
        Math.min(p.solutions.length - 1, p.focusedSolutionIndex + delta)
      );
      return { problem: { ...p, focusedSolutionIndex: next } };
    }),

  setProblemResult: (view) =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, result: view } };
    }),

  openLangPicker: (snippets) =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, langPicker: { snippets, index: 0 } } };
    }),

  moveLangPicker: (delta) =>
    set((state) => {
      if (!state.problem?.langPicker) return {};
      const lp = state.problem.langPicker;
      const next = Math.max(0, Math.min(lp.snippets.length - 1, lp.index + delta));
      return { problem: { ...state.problem, langPicker: { ...lp, index: next } } };
    }),

  closeLangPicker: () =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, langPicker: null } };
    }),
});
