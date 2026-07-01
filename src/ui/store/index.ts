import { create } from "zustand";
import { createQuestionsSlice } from "./slices/questionsSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createSearchSlice } from "./slices/searchSlice";
import { createFiltersSlice } from "./slices/filtersSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createProblemSlice } from "./slices/problemSlice";
import { createSyncSlice } from "./slices/syncSlice";
import { createSubmissionsSlice } from "./slices/submissionsSlice";
import type { QuestionsSlice } from "./slices/questionsSlice";
import type { SelectionSlice } from "./slices/selectionSlice";
import type { SearchSlice } from "./slices/searchSlice";
import type { FiltersSlice } from "./slices/filtersSlice";
import type { UiSlice } from "./slices/uiSlice";
import type { ProblemSlice } from "./slices/problemSlice";
import type { SyncSlice } from "./slices/syncSlice";
import type { SubmissionsSlice } from "./slices/submissionsSlice";

export type AppStore = QuestionsSlice &
  SelectionSlice &
  SearchSlice &
  FiltersSlice &
  UiSlice &
  ProblemSlice &
  SyncSlice &
  SubmissionsSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createQuestionsSlice(...a),
  ...createSelectionSlice(...a),
  ...createSearchSlice(...a),
  ...createFiltersSlice(...a),
  ...createUiSlice(...a),
  ...createProblemSlice(...a),
  ...createSyncSlice(...a),
  ...createSubmissionsSlice(...a),
}));

export type { AppMode, BrowsePanel } from "./slices/uiSlice";
export { PANEL_ORDER } from "./slices/uiSlice";
export type { ProblemPanel, RelatedQuestion } from "./slices/problemSlice";
export { PROBLEM_PANEL_ORDER } from "./slices/problemSlice";
