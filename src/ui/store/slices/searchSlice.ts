import type { StateCreator } from "zustand";
import { filterQuestions } from "../../../core/search";
import type { AppStore } from "../index";

export interface SearchSlice {
  searchNeedle: string;

  startSearch: () => void;
  updateSearch: (needle: string) => void;
  endSearch: () => void;
}

export const createSearchSlice: StateCreator<AppStore, [], [], SearchSlice> = (set, get) => ({
  searchNeedle: "",

  startSearch: () => {
    set({ mode: "search", searchNeedle: "" });
  },

  updateSearch: (needle) => {
    const { allQuestions } = get();
    set({
      searchNeedle: needle,
      filteredQuestions: filterQuestions(allQuestions, needle),
      selectedQuestionIndex: 0,
    });
  },

  endSearch: () => {
    const { searchNeedle, allQuestions } = get();
    set({
      mode: "browse",
      filteredQuestions: searchNeedle ? filterQuestions(allQuestions, searchNeedle) : allQuestions,
    });
  },
});
