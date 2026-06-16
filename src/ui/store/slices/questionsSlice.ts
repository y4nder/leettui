// type: domain
// Owns problem data sourced from the DB: topics, all questions for the current
// topic, and the filtered projection used by the UI. UI slices may call these
// actions; this slice never imports UI state.

import type { StateCreator } from "zustand";
import type { DbQuestion, StatusCounts } from "../../../db/questions";
import { getQuestionsByTopic, getStatusCounts } from "../../../db/questions";
import { getAllTopicsWithAll } from "../../../db/topics";
import { filterQuestions, filterTopics } from "../../../core/search";
import { listSolutionQuestionIds } from "../../../core/solutions";
import type { DifficultyFilter } from "./filtersSlice";
import type { AppStore } from "../index";

export interface QuestionsSlice {
  // `allTopics` is the full DB list; `topics` is the displayed projection
  // (filtered by the topics-panel search) — mirrors allQuestions/filteredQuestions.
  allTopics: string[];
  topics: string[];
  allQuestions: DbQuestion[];
  filteredQuestions: DbQuestion[];
  stats: StatusCounts;
  solutionFileIds: Set<number>;

  init: () => void;
  refreshQuestions: (questions: DbQuestion[]) => void;
  refreshSolutionFiles: () => void;
  loadTopic: (topic: string) => void;
  applySearch: (needle: string) => void;
  applyTopicSearch: (needle: string) => void;
  applyFilters: () => void;
}

// Projects the topic's questions down to what the UI shows: difficulty filter
// first (cheap predicate), then the fuzzy search needle.
function project(all: DbQuestion[], needle: string, difficulty: DifficultyFilter): DbQuestion[] {
  let qs = all;
  if (difficulty !== "all") qs = qs.filter((q) => q.difficulty === difficulty);
  if (needle) qs = filterQuestions(qs, needle);
  return qs;
}

export const createQuestionsSlice: StateCreator<AppStore, [], [], QuestionsSlice> = (set, get) => ({
  allTopics: [],
  topics: [],
  allQuestions: [],
  filteredQuestions: [],
  stats: { solved: 0, attempted: 0, total: 0 },
  solutionFileIds: new Set(),

  init: () => {
    const topics = getAllTopicsWithAll();
    const questions = getQuestionsByTopic("all");
    set({
      allTopics: topics,
      topics,
      allQuestions: questions,
      filteredQuestions: project(questions, get().searchNeedle, get().difficultyFilter),
      stats: getStatusCounts(),
      solutionFileIds: listSolutionQuestionIds(),
    });
  },

  refreshQuestions: (questions) => {
    set({
      allQuestions: questions,
      filteredQuestions: project(questions, get().searchNeedle, get().difficultyFilter),
      stats: getStatusCounts(),
      solutionFileIds: listSolutionQuestionIds(),
    });
  },

  refreshSolutionFiles: () => {
    set({ solutionFileIds: listSolutionQuestionIds() });
  },

  loadTopic: (topic) => {
    const questions = getQuestionsByTopic(topic);
    set({
      allQuestions: questions,
      filteredQuestions: project(questions, get().searchNeedle, get().difficultyFilter),
    });
  },

  applySearch: (needle) => {
    set({
      filteredQuestions: project(get().allQuestions, needle, get().difficultyFilter),
    });
  },

  // Topics-panel search. Empty needle restores the full list and leaves the
  // current topic's questions untouched (no reload). A real needle filters the
  // displayed list and live-loads the top match's questions for feedback.
  // (Cursor resets are owned by searchSlice, per the ui/domain split.)
  // NOTE: live-load re-queries per keystroke — see the "rapid topic navigation"
  // perf item in docs/scratchpad/ideas.md; a debounce there covers this path too.
  applyTopicSearch: (needle) => {
    if (!needle.trim()) {
      set({ topics: get().allTopics });
      return;
    }
    const topics = filterTopics(get().allTopics, needle);
    set({ topics });
    const top = topics[0];
    if (top) {
      get().loadTopic(top);
    } else {
      set({ allQuestions: [], filteredQuestions: [] });
    }
  },

  applyFilters: () => {
    set({
      filteredQuestions: project(get().allQuestions, get().searchNeedle, get().difficultyFilter),
    });
  },
});
