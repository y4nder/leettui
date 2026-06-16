// type: ui
// Owns the search needles and the mode toggle around search input. Search is
// panel-scoped: `/` on the questions panel filters questions (searchNeedle), `/`
// on the topics panel fuzzy-filters the topic list (topicNeedle). The active
// needle is keyed off `focusedPanel`, which is frozen during search mode (the
// focus keys live in browseGlobalBindings, which is unmounted while searching).
// Asks the domain slice to recompute the projections; never reads the DB itself.

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";

export interface SearchSlice {
  searchNeedle: string;
  topicNeedle: string;

  startSearch: () => void;
  updateSearch: (needle: string) => void;
  endSearch: () => void;
}

export const createSearchSlice: StateCreator<AppStore, [], [], SearchSlice> = (set, get) => {
  // Restore the full topic list while keeping the highlighted topic selected
  // (remap its slug into allTopics). Used when entering topic search and when the
  // needle is cleared, so a bare `/` neither jumps to "all" nor reloads.
  const restoreFullTopics = () => {
    const currentSlug = get().topics[get().selectedTopicIndex];
    get().applyTopicSearch(""); // topics = allTopics
    const all = get().allTopics;
    const idx = currentSlug ? all.indexOf(currentSlug) : -1;
    if (idx >= 0) {
      // Prior topic still valid: keep it selected; its questions are already loaded.
      set({ selectedTopicIndex: idx });
    } else {
      // No valid prior selection (e.g. cleared from a no-match filter): select and
      // load the top of the full list so the question pane isn't left stale/empty.
      set({ selectedTopicIndex: 0, selectedQuestionIndex: 0 });
      const top = all[0];
      if (top) get().loadTopic(top);
    }
  };

  return {
    searchNeedle: "",
    topicNeedle: "",

    startSearch: () => {
      set({ mode: "search" });
      if (get().focusedPanel === "topics") {
        set({ topicNeedle: "" });
        restoreFullTopics();
      } else {
        set({ searchNeedle: "" });
        get().applySearch("");
      }
    },

    updateSearch: (needle) => {
      if (get().focusedPanel === "topics") {
        if (!needle.trim()) {
          // Empty needle: full list, keep the highlighted topic, no reload.
          set({ topicNeedle: needle });
          restoreFullTopics();
          return;
        }
        // Real needle: filter + live-load the top match (resets both cursors).
        set({ topicNeedle: needle, selectedTopicIndex: 0, selectedQuestionIndex: 0 });
        get().applyTopicSearch(needle);
        return;
      }
      set({ searchNeedle: needle, selectedQuestionIndex: 0 });
      get().applySearch(needle);
    },

    endSearch: () => {
      // Both panels persist their filtered projection on exit (symmetric): the
      // question list stays filtered, and the topic list stays filtered so you can
      // j/k among the matches. Re-entering search (`/`) re-expands to the full list.
      set({ mode: "browse" });
    },
  };
};
