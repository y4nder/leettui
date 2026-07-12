import { create } from "zustand";
import { createQuestionsSlice } from "@/ui/store/slices/questionsSlice";
import { createSelectionSlice } from "@/ui/store/slices/selectionSlice";
import { createSearchSlice } from "@/ui/store/slices/searchSlice";
import { createFiltersSlice } from "@/ui/store/slices/filtersSlice";
import { createUiSlice } from "@/ui/store/slices/uiSlice";
import { createProblemSlice } from "@/ui/store/slices/problemSlice";
import { createSyncSlice } from "@/ui/store/slices/syncSlice";
import { createSubmissionsSlice } from "@/ui/store/slices/submissionsSlice";
import { createDashboardSlice } from "@/ui/store/slices/dashboardSlice";
import type { QuestionsSlice } from "@/ui/store/slices/questionsSlice";
import type { SelectionSlice } from "@/ui/store/slices/selectionSlice";
import type { SearchSlice } from "@/ui/store/slices/searchSlice";
import type { FiltersSlice } from "@/ui/store/slices/filtersSlice";
import type { UiSlice } from "@/ui/store/slices/uiSlice";
import type { ProblemSlice } from "@/ui/store/slices/problemSlice";
import type { SyncSlice } from "@/ui/store/slices/syncSlice";
import type { SubmissionsSlice } from "@/ui/store/slices/submissionsSlice";
import type { DashboardSlice } from "@/ui/store/slices/dashboardSlice";

export type AppStore = QuestionsSlice &
  SelectionSlice &
  SearchSlice &
  FiltersSlice &
  UiSlice &
  ProblemSlice &
  SyncSlice &
  SubmissionsSlice &
  DashboardSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createQuestionsSlice(...a),
  ...createSelectionSlice(...a),
  ...createSearchSlice(...a),
  ...createFiltersSlice(...a),
  ...createUiSlice(...a),
  ...createProblemSlice(...a),
  ...createSyncSlice(...a),
  ...createSubmissionsSlice(...a),
  ...createDashboardSlice(...a),
}));

export type { AppMode, BrowsePanel } from "@/ui/store/slices/uiSlice";
export { PANEL_ORDER } from "@/ui/store/slices/uiSlice";
export type { ProblemPanel, RelatedQuestion } from "@/ui/store/slices/problemSlice";
export { PROBLEM_PANEL_ORDER } from "@/ui/store/slices/problemSlice";
