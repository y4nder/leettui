import type { StateCreator } from "zustand";
import type { DbQuestion } from "../../../db/questions";
import { getQuestionsByTopic } from "../../../db/questions";
import { getAllTopicsWithAll } from "../../../db/topics";
import { filterQuestions } from "../../../core/search";
import type { AppStore } from "../index";

export interface NavigationSlice {
  topics: string[];
  selectedTopicIndex: number;
  allQuestions: DbQuestion[];
  filteredQuestions: DbQuestion[];
  selectedQuestionIndex: number;

  init: () => void;
  moveQuestion: (delta: number) => void;
  moveTopic: (delta: number) => void;
  setTopic: (index: number) => void;
  refreshQuestions: (questions: DbQuestion[]) => void;
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export const createNavigationSlice: StateCreator<AppStore, [], [], NavigationSlice> = (set, get) => ({
  topics: [],
  selectedTopicIndex: 0,
  allQuestions: [],
  filteredQuestions: [],
  selectedQuestionIndex: 0,

  init: () => {
    const topics = getAllTopicsWithAll();
    const questions = getQuestionsByTopic("all");
    set({
      topics,
      allQuestions: questions,
      filteredQuestions: questions,
      selectedQuestionIndex: 0,
      selectedTopicIndex: 0,
    });
  },

  moveQuestion: (delta) => {
    const { selectedQuestionIndex, filteredQuestions } = get();
    set({ selectedQuestionIndex: clamp(selectedQuestionIndex + delta, filteredQuestions.length) });
  },

  moveTopic: (delta) => {
    const { selectedTopicIndex, topics } = get();
    const newIndex = clamp(selectedTopicIndex + delta, topics.length);
    const topic = topics[newIndex];
    if (!topic) return;
    const questions = getQuestionsByTopic(topic);
    const needle = get().searchNeedle;
    set({
      selectedTopicIndex: newIndex,
      allQuestions: questions,
      filteredQuestions: needle ? filterQuestions(questions, needle) : questions,
      selectedQuestionIndex: 0,
    });
  },

  setTopic: (index) => {
    const { topics } = get();
    const newIndex = clamp(index, topics.length);
    const topic = topics[newIndex];
    if (!topic) return;
    const questions = getQuestionsByTopic(topic);
    const needle = get().searchNeedle;
    set({
      selectedTopicIndex: newIndex,
      allQuestions: questions,
      filteredQuestions: needle ? filterQuestions(questions, needle) : questions,
      selectedQuestionIndex: 0,
    });
  },

  refreshQuestions: (questions) => {
    const needle = get().searchNeedle;
    set({
      allQuestions: questions,
      filteredQuestions: needle ? filterQuestions(questions, needle) : questions,
    });
  },
});
