import { describe, expect, test } from "bun:test";
import type { DbQuestion } from "../../../db/questions";
import { useAppStore } from "../index";
import type { ProblemViewState } from "./problemSlice";

// Exercises the full-screen results sub-modal (open/close + the exclusivity guard)
// against the real store, DB-free: everything here mutates the in-memory `problem`
// state only.

const QUESTION = {
  id: 1,
  title: "Two Sum",
  title_slug: "two-sum",
  difficulty: "Easy",
  paid_only: 0,
  status: null,
  ac_rate: 50,
  last_runtime: null,
  last_memory: null,
} as DbQuestion;

function problemState(overrides: Partial<ProblemViewState> = {}): ProblemViewState {
  return {
    question: QUESTION,
    description: "desc",
    topicTags: [],
    solutions: ["python3"],
    focusedSolutionIndex: 0,
    related: [],
    focusedRelatedIndex: 0,
    focusedHistoryIndex: 0,
    focusedPanel: "description",
    result: null,
    solutionPicker: null,
    notes: null,
    help: false,
    deleteConfirm: null,
    resultFullscreen: false,
    ...overrides,
  };
}

describe("resultFullscreen sub-modal", () => {
  test("open sets the flag; close clears it", () => {
    useAppStore.setState({ problem: problemState() });

    useAppStore.getState().openResultFullscreen();
    expect(useAppStore.getState().problem?.resultFullscreen).toBe(true);

    useAppStore.getState().closeResultFullscreen();
    expect(useAppStore.getState().problem?.resultFullscreen).toBe(false);
  });

  test("open is a no-op while the solution picker is up", () => {
    useAppStore.setState({
      problem: problemState({
        solutionPicker: { snippets: [], existing: new Set(), index: 0 },
      }),
    });

    useAppStore.getState().openResultFullscreen();
    expect(useAppStore.getState().problem?.resultFullscreen).toBe(false);
  });

  test("open is a no-op while notes are up", () => {
    useAppStore.setState({ problem: problemState({ notes: { content: "" } }) });

    useAppStore.getState().openResultFullscreen();
    expect(useAppStore.getState().problem?.resultFullscreen).toBe(false);
  });

  test("actions no-op when no problem is open", () => {
    useAppStore.setState({ problem: null });

    useAppStore.getState().openResultFullscreen();
    expect(useAppStore.getState().problem).toBeNull();

    useAppStore.getState().closeResultFullscreen();
    expect(useAppStore.getState().problem).toBeNull();
  });

  test("setProblemResult leaves the flag untouched", () => {
    useAppStore.setState({ problem: problemState({ resultFullscreen: true }) });

    useAppStore.getState().setProblemResult({ kind: "info", title: "hi" });
    const p = useAppStore.getState().problem;
    expect(p?.resultFullscreen).toBe(true);
    expect(p?.result?.title).toBe("hi");
  });

  test("enterProblemView initializes the flag false", () => {
    useAppStore.setState({ problem: null });
    useAppStore.getState().enterProblemView({
      question: QUESTION,
      description: "desc",
      solutions: [],
      topicTags: [],
      related: [],
    });
    expect(useAppStore.getState().problem?.resultFullscreen).toBe(false);
  });
});
