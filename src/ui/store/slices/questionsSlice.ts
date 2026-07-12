// type: domain
// Owns problem data sourced from the DB: topics, all questions for the current
// topic, and the filtered projection used by the UI. UI slices may call these
// actions; this slice never imports UI state.

import type { StateCreator } from "zustand";
import type { DbQuestion, StatusCounts } from "@/db/questions";
import { getQuestionsByTopic, getStatusCounts } from "@/db/questions";
import { getAllTopicsWithAll } from "@/db/topics";
import { getSubmissionCountsByQuestion } from "@/db/submissions";
import { filterQuestions, filterTopics } from "@/core/search";
import { listSolutionQuestionIds } from "@/core/solutions";
import { scheduleTopicLoad, cancelTopicLoad } from "@/ui/store/topicLoad";
import type { DifficultyFilter } from "@/ui/store/slices/filtersSlice";
import type { AppStore } from "@/ui/store/index";

export interface QuestionsSlice {
  // `allTopics` is the full DB list; `topics` is the displayed projection
  // (filtered by the topics-panel search) — mirrors allQuestions/filteredQuestions.
  allTopics: string[];
  topics: string[];
  allQuestions: DbQuestion[];
  filteredQuestions: DbQuestion[];
  stats: StatusCounts;
  solutionFileIds: Set<number>;
  // Browse attempt-count badge (BROWSE-01): questionId -> total submission
  // count across every verdict. A missing key means zero attempts (D-11).
  attemptCounts: Map<number, number>;

  init: () => void;
  refreshQuestions: (questions: DbQuestion[]) => void;
  refreshSolutionFiles: () => void;
  refreshAttemptCounts: () => void;
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
  attemptCounts: new Map(),

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
      attemptCounts: getSubmissionCountsByQuestion(),
    });
  },

  refreshQuestions: (questions) => {
    set({
      allQuestions: questions,
      filteredQuestions: project(questions, get().searchNeedle, get().difficultyFilter),
      stats: getStatusCounts(),
      solutionFileIds: listSolutionQuestionIds(),
      attemptCounts: getSubmissionCountsByQuestion(),
    });
  },

  refreshSolutionFiles: () => {
    set({
      solutionFileIds: listSolutionQuestionIds(),
      attemptCounts: getSubmissionCountsByQuestion(),
    });
  },

  refreshAttemptCounts: () => {
    set({ attemptCounts: getSubmissionCountsByQuestion() });
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
  // displayed list (synchronously, so the list tracks each keystroke) and
  // debounce-loads the top match's questions for feedback (see topicLoad.ts) so
  // typing fast doesn't re-query per keystroke. The synchronous branches cancel
  // any pending load — their question list is already resolved.
  // (Cursor resets are owned by searchSlice, per the ui/domain split.)
  applyTopicSearch: (needle) => {
    if (!needle.trim()) {
      cancelTopicLoad();
      set({ topics: get().allTopics });
      return;
    }
    const topics = filterTopics(get().allTopics, needle);
    set({ topics });
    if (topics[0]) {
      scheduleTopicLoad(get);
    } else {
      cancelTopicLoad();
      set({ allQuestions: [], filteredQuestions: [] });
    }
  },

  applyFilters: () => {
    set({
      filteredQuestions: project(get().allQuestions, get().searchNeedle, get().difficultyFilter),
    });
  },
});
