// type: domain
// Owns the progress dashboard aggregate stats — loaded on dashboard open,
// cleared on close (or kept resident for re-open; see clearDashboardStats).
// Domain-pure: no cursor/focus state. The stats are computed synchronously
// from getFirstAcSummary() (a bounded indexed DB read) via computeDashboardStats().

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";
import { getFirstAcSummary } from "../../../db/submissions";
import { computeDashboardStats, type DashboardStats } from "../../analytics";

export interface DashboardSlice {
  dashboardStats: DashboardStats | null;
  loadDashboardStats: () => void;
  clearDashboardStats: () => void;
}

export const createDashboardSlice: StateCreator<AppStore, [], [], DashboardSlice> = (set) => ({
  dashboardStats: null,

  loadDashboardStats: () => {
    const rows = getFirstAcSummary();
    set({ dashboardStats: computeDashboardStats(rows) });
  },

  clearDashboardStats: () => {
    set({ dashboardStats: null });
  },
});
