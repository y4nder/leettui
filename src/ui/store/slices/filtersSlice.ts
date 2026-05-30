// type: ui
// Owns the difficulty filter applied on top of the active topic + search. Like
// the search needle, the value lives here while the domain slice reads it via
// get() when projecting filteredQuestions; this slice never touches the DB.

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";

export type DifficultyFilter = "all" | "Easy" | "Medium" | "Hard";

const CYCLE: DifficultyFilter[] = ["all", "Easy", "Medium", "Hard"];

export interface FiltersSlice {
  difficultyFilter: DifficultyFilter;
  cycleDifficulty: () => void;
}

export const createFiltersSlice: StateCreator<AppStore, [], [], FiltersSlice> = (set, get) => ({
  difficultyFilter: "all",

  cycleDifficulty: () => {
    const cur = get().difficultyFilter;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]!;
    set({ difficultyFilter: next, selectedQuestionIndex: 0 });
    get().applyFilters();
  },
});
