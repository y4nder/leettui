// type: domain
// Owns problem data sourced from the DB: topics, all questions for the current
// topic, and the filtered projection used by the UI. UI slices may call these
// actions; this slice never imports UI state.

import type { StateCreator } from "zustand";
import type { DbQuestion, StatusCounts } from "../../../db/questions";
import { getQuestionsByTopic, getStatusCounts } from "../../../db/questions";
import { getAllTopicsWithAll } from "../../../db/topics";
import { filterQuestions } from "../../../core/search";
import type { AppStore } from "../index";

export interface QuestionsSlice {
  topics: string[];
  allQuestions: DbQuestion[];
  filteredQuestions: DbQuestion[];
  stats: StatusCounts;

  init: () => void;
  refreshQuestions: (questions: DbQuestion[]) => void;
  loadTopic: (topic: string) => void;
  applySearch: (needle: string) => void;
}

export const createQuestionsSlice: StateCreator<AppStore, [], [], QuestionsSlice> = (set, get) => ({
  topics: [],
  allQuestions: [],
  filteredQuestions: [],
  stats: { solved: 0, attempted: 0, total: 0 },

  init: () => {
    const topics = getAllTopicsWithAll();
    const questions = getQuestionsByTopic("all");
    set({
      topics,
      allQuestions: questions,
      filteredQuestions: questions,
      stats: getStatusCounts(),
    });
  },

  refreshQuestions: (questions) => {
    const needle = get().searchNeedle;
    set({
      allQuestions: questions,
      filteredQuestions: needle ? filterQuestions(questions, needle) : questions,
      stats: getStatusCounts(),
    });
  },

  loadTopic: (topic) => {
    const questions = getQuestionsByTopic(topic);
    const needle = get().searchNeedle;
    set({
      allQuestions: questions,
      filteredQuestions: needle ? filterQuestions(questions, needle) : questions,
    });
  },

  applySearch: (needle) => {
    const { allQuestions } = get();
    set({
      filteredQuestions: needle ? filterQuestions(allQuestions, needle) : allQuestions,
    });
  },
});
