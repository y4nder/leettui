// type: ui
// Owns the sync progress indicator's transient state.

import type { StateCreator } from "zustand";
import type { AppStore } from "@/ui/store/index";

export interface SyncSlice {
  syncProgress: { current: number; total: number } | null;

  setSyncProgress: (current: number, total: number) => void;
  clearSyncProgress: () => void;
}

export const createSyncSlice: StateCreator<AppStore, [], [], SyncSlice> = (set) => ({
  syncProgress: null,

  setSyncProgress: (current, total) => set({ syncProgress: { current, total } }),
  clearSyncProgress: () => set({ syncProgress: null }),
});
