// type: ui
// Owns the cursors into the topic and question lists. Mutating the topic index
// asks the domain slice to load the new topic's questions; this slice never
// touches the DB directly. Cursor changes are mirrored to disk (debounced) so
// the last-viewed position survives restarts.

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";
import { loadSession, saveSession } from "../../../core/session";

export interface SelectionSlice {
  selectedTopicIndex: number;
  selectedQuestionIndex: number;

  moveQuestion: (delta: number) => void;
  setQuestionIndex: (index: number) => void;
  moveTopic: (delta: number) => void;
  setTopicIndex: (index: number) => void;
  restoreSession: () => void;
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

// Snapshots the current topic slug + focused question id to disk so the next
// launch can reopen here. Question id (not index) is persisted because indices
// shift as the filtered list changes.
function persistPosition(get: () => AppStore): void {
  const s = get();
  saveSession({
    topicSlug: s.topics[s.selectedTopicIndex],
    questionId: s.filteredQuestions[s.selectedQuestionIndex]?.id,
  });
}

export const createSelectionSlice: StateCreator<AppStore, [], [], SelectionSlice> = (set, get) => ({
  selectedTopicIndex: 0,
  selectedQuestionIndex: 0,

  moveQuestion: (delta) => {
    const { selectedQuestionIndex, filteredQuestions } = get();
    set({ selectedQuestionIndex: clamp(selectedQuestionIndex + delta, filteredQuestions.length) });
    persistPosition(get);
  },

  setQuestionIndex: (index) => {
    set({ selectedQuestionIndex: clamp(index, get().filteredQuestions.length) });
    persistPosition(get);
  },

  moveTopic: (delta) => {
    const { selectedTopicIndex, topics, loadTopic } = get();
    const newIndex = clamp(selectedTopicIndex + delta, topics.length);
    const topic = topics[newIndex];
    if (!topic) return;
    loadTopic(topic);
    set({ selectedTopicIndex: newIndex, selectedQuestionIndex: 0 });
    persistPosition(get);
  },

  setTopicIndex: (index) => {
    const { topics, loadTopic } = get();
    const newIndex = clamp(index, topics.length);
    const topic = topics[newIndex];
    if (!topic) return;
    loadTopic(topic);
    set({ selectedTopicIndex: newIndex, selectedQuestionIndex: 0 });
    persistPosition(get);
  },

  // Restores the last-viewed topic + question after init() has loaded data.
  restoreSession: () => {
    const session = loadSession();
    if (session.topicSlug) {
      // Look up in allTopics (the full list); at boot it equals the displayed
      // `topics`, but this stays correct if a filter is ever live on restore.
      const idx = get().allTopics.indexOf(session.topicSlug);
      if (idx > 0) {
        get().loadTopic(get().allTopics[idx]!);
        set({ selectedTopicIndex: idx });
      }
    }
    if (session.questionId != null) {
      const qIndex = get().filteredQuestions.findIndex((q) => q.id === session.questionId);
      if (qIndex >= 0) set({ selectedQuestionIndex: qIndex });
    }
  },
});
