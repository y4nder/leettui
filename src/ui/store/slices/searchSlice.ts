// type: ui
// Owns the search needle and the mode toggle around search input. Asks the
// domain slice to recompute filteredQuestions; never reads the DB itself.

import type { StateCreator } from "zustand";
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
    get().applySearch("");
  },

  updateSearch: (needle) => {
    set({ searchNeedle: needle, selectedQuestionIndex: 0 });
    get().applySearch(needle);
  },

  endSearch: () => {
    const { searchNeedle, applySearch } = get();
    set({ mode: "browse" });
    applySearch(searchNeedle);
  },
});
