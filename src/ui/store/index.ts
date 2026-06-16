import { create } from "zustand";
import { createQuestionsSlice } from "./slices/questionsSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createSearchSlice } from "./slices/searchSlice";
import { createFiltersSlice } from "./slices/filtersSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createSyncSlice } from "./slices/syncSlice";
import type { QuestionsSlice } from "./slices/questionsSlice";
import type { SelectionSlice } from "./slices/selectionSlice";
import type { SearchSlice } from "./slices/searchSlice";
import type { FiltersSlice } from "./slices/filtersSlice";
import type { UiSlice } from "./slices/uiSlice";
import type { SyncSlice } from "./slices/syncSlice";

export type AppStore = QuestionsSlice &
  SelectionSlice &
  SearchSlice &
  FiltersSlice &
  UiSlice &
  SyncSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createQuestionsSlice(...a),
  ...createSelectionSlice(...a),
  ...createSearchSlice(...a),
  ...createFiltersSlice(...a),
  ...createUiSlice(...a),
  ...createSyncSlice(...a),
}));

export type { AppMode, BrowsePanel } from "./slices/uiSlice";
export { PANEL_ORDER } from "./slices/uiSlice";
