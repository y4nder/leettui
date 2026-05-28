import { useReducer, useCallback } from "react";
import type { DbQuestion } from "../../db/questions";
import { getQuestionsByTopic } from "../../db/questions";
import { getAllTopicsWithAll } from "../../db/topics";
import { filterQuestions } from "../../core/search";

export type AppMode = "browse" | "search" | "popup" | "select" | "result";

export interface AppState {
  mode: AppMode;
  topics: string[];
  selectedTopicIndex: number;
  allQuestions: DbQuestion[];
  filteredQuestions: DbQuestion[];
  selectedQuestionIndex: number;
  searchNeedle: string;
  popupTitle: string;
  popupContent: string;
  selectTitle: string;
  selectItems: string[];
  selectResolve: ((index: number | null) => void) | null;
  resultLines: string[];
  syncProgress: { current: number; total: number } | null;
}

type Action =
  | { type: "INIT"; topics: string[]; questions: DbQuestion[] }
  | { type: "SET_MODE"; mode: AppMode }
  | { type: "SET_TOPIC"; index: number; questions: DbQuestion[] }
  | { type: "MOVE_QUESTION"; delta: number }
  | { type: "MOVE_TOPIC"; delta: number; questions: DbQuestion[] }
  | { type: "START_SEARCH" }
  | { type: "UPDATE_SEARCH"; needle: string }
  | { type: "END_SEARCH" }
  | { type: "SHOW_POPUP"; title: string; content: string }
  | { type: "HIDE_POPUP" }
  | { type: "SHOW_SELECT"; title: string; items: string[]; resolve: (i: number | null) => void }
  | { type: "HIDE_SELECT" }
  | { type: "SHOW_RESULT"; lines: string[] }
  | { type: "HIDE_RESULT" }
  | { type: "SYNC_PROGRESS"; current: number; total: number }
  | { type: "SYNC_DONE" }
  | { type: "REFRESH_QUESTIONS"; questions: DbQuestion[] };

const initialState: AppState = {
  mode: "browse",
  topics: [],
  selectedTopicIndex: 0,
  allQuestions: [],
  filteredQuestions: [],
  selectedQuestionIndex: 0,
  searchNeedle: "",
  popupTitle: "",
  popupContent: "",
  selectTitle: "",
  selectItems: [],
  selectResolve: null,
  resultLines: [],
  syncProgress: null,
};

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        topics: action.topics,
        allQuestions: action.questions,
        filteredQuestions: action.questions,
        selectedQuestionIndex: 0,
      };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_TOPIC":
      return {
        ...state,
        selectedTopicIndex: action.index,
        allQuestions: action.questions,
        filteredQuestions: state.searchNeedle
          ? filterQuestions(action.questions, state.searchNeedle)
          : action.questions,
        selectedQuestionIndex: 0,
      };

    case "MOVE_QUESTION":
      return {
        ...state,
        selectedQuestionIndex: clampIndex(
          state.selectedQuestionIndex + action.delta,
          state.filteredQuestions.length
        ),
      };

    case "MOVE_TOPIC": {
      const newIndex = clampIndex(
        state.selectedTopicIndex + action.delta,
        state.topics.length
      );
      return {
        ...state,
        selectedTopicIndex: newIndex,
        allQuestions: action.questions,
        filteredQuestions: state.searchNeedle
          ? filterQuestions(action.questions, state.searchNeedle)
          : action.questions,
        selectedQuestionIndex: 0,
      };
    }

    case "START_SEARCH":
      return { ...state, mode: "search", searchNeedle: "" };

    case "UPDATE_SEARCH": {
      const filtered = filterQuestions(state.allQuestions, action.needle);
      return {
        ...state,
        searchNeedle: action.needle,
        filteredQuestions: filtered,
        selectedQuestionIndex: 0,
      };
    }

    case "END_SEARCH":
      return {
        ...state,
        mode: "browse",
        filteredQuestions: state.searchNeedle
          ? filterQuestions(state.allQuestions, state.searchNeedle)
          : state.allQuestions,
      };

    case "SHOW_POPUP":
      return {
        ...state,
        mode: "popup",
        popupTitle: action.title,
        popupContent: action.content,
      };

    case "HIDE_POPUP":
      return { ...state, mode: "browse", popupTitle: "", popupContent: "" };

    case "SHOW_SELECT":
      return {
        ...state,
        mode: "select",
        selectTitle: action.title,
        selectItems: action.items,
        selectResolve: action.resolve,
      };

    case "HIDE_SELECT":
      return {
        ...state,
        mode: "browse",
        selectTitle: "",
        selectItems: [],
        selectResolve: null,
      };

    case "SHOW_RESULT":
      return { ...state, mode: "result", resultLines: action.lines };

    case "HIDE_RESULT":
      return { ...state, mode: "browse", resultLines: [] };

    case "SYNC_PROGRESS":
      return {
        ...state,
        syncProgress: { current: action.current, total: action.total },
      };

    case "SYNC_DONE":
      return { ...state, syncProgress: null };

    case "REFRESH_QUESTIONS":
      return {
        ...state,
        allQuestions: action.questions,
        filteredQuestions: state.searchNeedle
          ? filterQuestions(action.questions, state.searchNeedle)
          : action.questions,
      };

    default:
      return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const init = useCallback(() => {
    const topics = getAllTopicsWithAll();
    const questions = getQuestionsByTopic("all");
    dispatch({ type: "INIT", topics, questions });
  }, []);

  const moveTopic = useCallback(
    (delta: number) => {
      const newIndex = clampIndex(
        state.selectedTopicIndex + delta,
        state.topics.length
      );
      const topic = state.topics[newIndex];
      if (!topic) return;
      const questions = getQuestionsByTopic(topic);
      dispatch({ type: "MOVE_TOPIC", delta, questions });
    },
    [state.selectedTopicIndex, state.topics]
  );

  const currentQuestion = state.filteredQuestions[state.selectedQuestionIndex] ?? null;
  const currentTopic = state.topics[state.selectedTopicIndex] ?? "all";

  return { state, dispatch, init, moveTopic, currentQuestion, currentTopic };
}
