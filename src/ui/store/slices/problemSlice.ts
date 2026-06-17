// type: ui
// Owns the entire ProblemView domain: focus, solutions, related, picker, notes, help.
// NOTE: `mode` is co-owned with uiSlice — enter/exitProblemView write it here, while
// uiSlice's browse modal closers also touch it. Legal in Zustand (`set` is typed over
// the whole AppStore).

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";
import type { ResultView } from "../../../views/browse/resultView";
import type { DbQuestion } from "../../../db/questions";
import type { CodeSnippet } from "../../../api/types";

// Which ProblemView panel currently holds focus (lazygit-style, Stage 12). Only
// meaningful while mode === "problem". Description (left) is full-height; Solutions,
// Result, and Related are stacked top-to-bottom on the right.
export type ProblemPanel = "description" | "solutions" | "result" | "related";

// Focus-cycle order for ProblemView, matching the layout (description full-height
// left; Solutions then Result then Related stacked right). Tab walks forward,
// Shift+Tab back (both wrap); [1]/[2]/[3]/[4] map to positions.
export const PROBLEM_PANEL_ORDER: ProblemPanel[] = [
  "description",
  "solutions",
  "result",
  "related",
];

// Spatial focus directions for ProblemView's 2D layout (description full-height left;
// Solutions over Result over Related on the right), driven by Ctrl+h/j/k/l.
export type FocusDirection = "left" | "right" | "up" | "down";

// Per-panel directional neighbors. An absent direction is an edge — focus stays put
// (no wrap; Tab/Shift+Tab remain the wrap-around linear cycle). Description spans the
// full left height, so "left" from any right-column panel lands there.
const PROBLEM_PANEL_NEIGHBORS: Record<
  ProblemPanel,
  Partial<Record<FocusDirection, ProblemPanel>>
> = {
  description: { right: "solutions" },
  solutions: { left: "description", down: "result" },
  result: { left: "description", up: "solutions", down: "related" },
  related: { left: "description", up: "result" },
};

export interface SolutionPickerState {
  snippets: CodeSnippet[];
  // langSlugs that already have a solution file on disk
  existing: Set<string>;
  index: number;
}

// One entry in the Related Questions panel (Stage 12 item 4). `dbQuestion` is the
// local row resolved at fetch time (null when not synced locally); navigable iff
// `!paidOnly && dbQuestion`. Premium entries stay listed (with a lock) but can't be
// opened — we can't read their content.
export interface RelatedQuestion {
  title: string;
  titleSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
  dbQuestion: DbQuestion | null;
}

export interface ProblemViewState {
  question: DbQuestion;
  description: string;
  // Topic slugs for the header metadata line (fetched once on enter; offline DB read).
  topicTags: string[];
  // langSlugs of solutions that exist on disk (the solution's identity)
  solutions: string[];
  focusedSolutionIndex: number;
  // Similar questions fetched on enter (live GraphQL). The focused entry is what
  // Enter navigates-replace to (when navigable).
  related: RelatedQuestion[];
  focusedRelatedIndex: number;
  // Which panel holds focus (lazygit-style, Stage 12) — drives panel-relative
  // bindings, the accent border, and the j/k target (scroll for description/result,
  // active-solution cycle for solutions). Defaults to "description".
  focusedPanel: ProblemPanel;
  result: ResultView | null;
  solutionPicker: SolutionPickerState | null;
  // Shared, language-agnostic notes popup. Non-null while open; `content` is
  // the rendered markdown (empty string when notes.md doesn't exist yet).
  notes: { content: string } | null;
  // The focus-aware keybindings help popup (Stage 12 item 5). A problem sub-modal:
  // true while open; closes back to the problem view (not browse), like notes/picker.
  help: boolean;
}

export interface ProblemSlice {
  problem: ProblemViewState | null;

  enterProblemView: (init: {
    question: DbQuestion;
    description: string;
    solutions: string[];
    topicTags: string[];
    related: RelatedQuestion[];
  }) => void;
  exitProblemView: () => void;
  setProblemSolutions: (solutions: string[], focusLangSlug?: string) => void;
  // Move the active solution within the existing list (clamped, no-op when empty).
  // Driven by j/k while the Solutions panel is focused; the active solution is what
  // e/R/s/t target, so cycling re-points those actions.
  moveFocusedSolution: (delta: number) => void;
  // Move the cursor within the Related Questions list (clamped, no-op when empty).
  // Driven by j/k while the Related panel is focused. The cursor moves freely over
  // non-navigable entries; Enter is what gates on navigability.
  moveFocusedRelated: (delta: number) => void;
  setProblemResult: (view: ResultView | null) => void;
  setProblemFocusedPanel: (panel: ProblemPanel) => void;
  // dir 1 = next panel, -1 = previous (wraps). Generalizes past two panels.
  cycleProblemFocusedPanel: (dir: 1 | -1) => void;
  // Move focus across the 2D layout (Ctrl+h/j/k/l); no-op at an edge. Tab/Shift+Tab
  // still cycle linearly via cycleProblemFocusedPanel.
  moveProblemFocus: (dir: FocusDirection) => void;
  openSolutionPicker: (
    snippets: CodeSnippet[],
    existing: Set<string>,
    initialLangSlug?: string,
  ) => void;
  movePicker: (delta: number) => void;
  closeSolutionPicker: () => void;
  openNotes: (content: string) => void;
  setNotesContent: (content: string) => void;
  closeNotes: () => void;
  openProblemHelp: () => void;
  closeProblemHelp: () => void;
}

export const createProblemSlice: StateCreator<AppStore, [], [], ProblemSlice> = (set) => ({
  problem: null,

  enterProblemView: ({ question, description, solutions, topicTags, related }) =>
    set({
      mode: "problem",
      problem: {
        question,
        description,
        topicTags,
        solutions,
        focusedSolutionIndex: 0,
        related,
        focusedRelatedIndex: 0,
        focusedPanel: "description",
        result: null,
        solutionPicker: null,
        notes: null,
        help: false,
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

  moveFocusedSolution: (delta) =>
    set((state) => {
      if (!state.problem) return {};
      const n = state.problem.solutions.length;
      if (n === 0) return {};
      const next = Math.max(0, Math.min(n - 1, state.problem.focusedSolutionIndex + delta));
      return { problem: { ...state.problem, focusedSolutionIndex: next } };
    }),

  moveFocusedRelated: (delta) =>
    set((state) => {
      if (!state.problem) return {};
      const n = state.problem.related.length;
      if (n === 0) return {};
      const next = Math.max(0, Math.min(n - 1, state.problem.focusedRelatedIndex + delta));
      return { problem: { ...state.problem, focusedRelatedIndex: next } };
    }),

  setProblemResult: (view) =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, result: view } };
    }),

  setProblemFocusedPanel: (panel) =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, focusedPanel: panel } };
    }),

  cycleProblemFocusedPanel: (dir) =>
    set((state) => {
      if (!state.problem) return {};
      const n = PROBLEM_PANEL_ORDER.length;
      const i = PROBLEM_PANEL_ORDER.indexOf(state.problem.focusedPanel);
      const next = PROBLEM_PANEL_ORDER[(i + dir + n) % n] ?? state.problem.focusedPanel;
      return { problem: { ...state.problem, focusedPanel: next } };
    }),

  moveProblemFocus: (dir) =>
    set((state) => {
      if (!state.problem) return {};
      const next = PROBLEM_PANEL_NEIGHBORS[state.problem.focusedPanel][dir];
      if (!next) return {};
      return { problem: { ...state.problem, focusedPanel: next } };
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

  openProblemHelp: () =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, help: true } };
    }),

  closeProblemHelp: () =>
    set((state) => {
      if (!state.problem) return {};
      return { problem: { ...state.problem, help: false } };
    }),
});
