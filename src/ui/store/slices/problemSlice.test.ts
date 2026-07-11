import { describe, expect, test } from "bun:test";
import type { DbQuestion } from "../../../db/questions";
import type { DbSubmission } from "../../../db/submissions";
import type { AppStore } from "../index";
import { useAppStore } from "../index";
import { createProblemSlice, type ProblemViewState } from "./problemSlice";

// Two DB-free suites over the problem slice:
// - The mouse set*Index invariant (mirrors selectionSlice.test.ts's clamp coverage):
//   a click index — however stale the render it came from — is pinned into
//   [0, length-1], and an empty/absent list is a strict no-op.
// - The full-screen results sub-modal (open/close + the exclusivity guard), run
//   against the real store: everything mutates the in-memory `problem` state only.

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

// Minimal Zustand harness: drives createProblemSlice with a plain merge-set over just
// the fields the slice reads, so the set*Index tests can seed problemSubmissions (a
// sibling-slice field the real store only fills from the DB).
function makeSlice(problem: ProblemViewState | null, submissionCount = 0) {
  const problemSubmissions = Array.from(
    { length: submissionCount },
    (_, i) => ({ submissionId: i }) as unknown as DbSubmission,
  );
  let state = { problem, problemSubmissions } as unknown as AppStore;
  const set = (partial: unknown) => {
    const patch = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(patch as object) };
  };
  const slice = createProblemSlice(set as never, (() => state) as never, undefined as never);
  return { slice, problem: () => state.problem };
}

describe("setFocusedSolutionIndex", () => {
  test("sets an in-range index", () => {
    const h = makeSlice(problemState({ solutions: ["python3", "rust", "java"] }));
    h.slice.setFocusedSolutionIndex(2);
    expect(h.problem()?.focusedSolutionIndex).toBe(2);
  });

  test("clamps out-of-range indices into bounds", () => {
    const h = makeSlice(problemState({ solutions: ["python3", "rust"] }));
    h.slice.setFocusedSolutionIndex(99);
    expect(h.problem()?.focusedSolutionIndex).toBe(1);
    h.slice.setFocusedSolutionIndex(-5);
    expect(h.problem()?.focusedSolutionIndex).toBe(0);
  });

  test("no-ops on an empty list and with no problem open", () => {
    const empty = makeSlice(problemState({ solutions: [], focusedSolutionIndex: 0 }));
    empty.slice.setFocusedSolutionIndex(3);
    expect(empty.problem()?.focusedSolutionIndex).toBe(0);

    const closed = makeSlice(null);
    closed.slice.setFocusedSolutionIndex(3);
    expect(closed.problem()).toBeNull();
  });
});

describe("setFocusedRelatedIndex", () => {
  const related = Array.from({ length: 4 }, (_, i) => ({
    title: `q${i}`,
    titleSlug: `q-${i}`,
    difficulty: "Easy" as const,
    paidOnly: false,
    dbQuestion: null,
  }));

  test("sets and clamps like its move sibling", () => {
    const h = makeSlice(problemState({ related }));
    h.slice.setFocusedRelatedIndex(3);
    expect(h.problem()?.focusedRelatedIndex).toBe(3);
    h.slice.setFocusedRelatedIndex(42);
    expect(h.problem()?.focusedRelatedIndex).toBe(3);
  });

  test("no-ops on an empty list", () => {
    const h = makeSlice(problemState());
    h.slice.setFocusedRelatedIndex(2);
    expect(h.problem()?.focusedRelatedIndex).toBe(0);
  });
});

describe("setFocusedHistoryIndex", () => {
  test("clamps against the sibling submissionsSlice row count", () => {
    const h = makeSlice(problemState(), 3);
    h.slice.setFocusedHistoryIndex(2);
    expect(h.problem()?.focusedHistoryIndex).toBe(2);
    h.slice.setFocusedHistoryIndex(10);
    expect(h.problem()?.focusedHistoryIndex).toBe(2);
  });

  test("no-ops with zero submissions", () => {
    const h = makeSlice(problemState(), 0);
    h.slice.setFocusedHistoryIndex(1);
    expect(h.problem()?.focusedHistoryIndex).toBe(0);
  });
});

describe("setPickerIndex", () => {
  const snippets = [
    { lang: "Python3", langSlug: "python3", code: "" },
    { lang: "Rust", langSlug: "rust", code: "" },
  ];

  test("sets and clamps within the snippet list", () => {
    const h = makeSlice(
      problemState({ solutionPicker: { snippets, existing: new Set(), index: 0 } }),
    );
    h.slice.setPickerIndex(1);
    expect(h.problem()?.solutionPicker?.index).toBe(1);
    h.slice.setPickerIndex(7);
    expect(h.problem()?.solutionPicker?.index).toBe(1);
  });

  test("no-ops when the picker is closed", () => {
    const h = makeSlice(problemState());
    h.slice.setPickerIndex(1);
    expect(h.problem()?.solutionPicker).toBeNull();
  });
});

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
