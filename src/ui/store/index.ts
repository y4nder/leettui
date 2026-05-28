import { create } from "zustand";
import { createNavigationSlice } from "./slices/navigationSlice";
import { createSearchSlice } from "./slices/searchSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createSyncSlice } from "./slices/syncSlice";
import type { NavigationSlice } from "./slices/navigationSlice";
import type { SearchSlice } from "./slices/searchSlice";
import type { UiSlice } from "./slices/uiSlice";
import type { SyncSlice } from "./slices/syncSlice";

export type AppStore = NavigationSlice & SearchSlice & UiSlice & SyncSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createNavigationSlice(...a),
  ...createSearchSlice(...a),
  ...createUiSlice(...a),
  ...createSyncSlice(...a),
}));

export type { AppMode } from "./slices/uiSlice";
