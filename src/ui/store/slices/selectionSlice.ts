// type: ui
// Owns the cursors into the topic and question lists. Mutating the topic index
// asks the domain slice to load the new topic's questions; this slice never
// touches the DB directly.

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";

export interface SelectionSlice {
  selectedTopicIndex: number;
  selectedQuestionIndex: number;

  moveQuestion: (delta: number) => void;
  moveTopic: (delta: number) => void;
  setTopicIndex: (index: number) => void;
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export const createSelectionSlice: StateCreator<AppStore, [], [], SelectionSlice> = (set, get) => ({
  selectedTopicIndex: 0,
  selectedQuestionIndex: 0,

  moveQuestion: (delta) => {
    const { selectedQuestionIndex, filteredQuestions } = get();
    set({ selectedQuestionIndex: clamp(selectedQuestionIndex + delta, filteredQuestions.length) });
  },

  moveTopic: (delta) => {
    const { selectedTopicIndex, topics, loadTopic } = get();
    const newIndex = clamp(selectedTopicIndex + delta, topics.length);
    const topic = topics[newIndex];
    if (!topic) return;
    loadTopic(topic);
    set({ selectedTopicIndex: newIndex, selectedQuestionIndex: 0 });
  },

  setTopicIndex: (index) => {
    const { topics, loadTopic } = get();
    const newIndex = clamp(index, topics.length);
    const topic = topics[newIndex];
    if (!topic) return;
    loadTopic(topic);
    set({ selectedTopicIndex: newIndex, selectedQuestionIndex: 0 });
  },
});
