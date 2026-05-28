import type { StateCreator } from "zustand";
import type { AppStore } from "../index";

export type AppMode = "browse" | "search" | "popup" | "select" | "result" | "help";

export interface UiSlice {
  mode: AppMode;
  popupTitle: string;
  popupContent: string;
  selectTitle: string;
  selectItems: string[];
  selectResolve: ((index: number | null) => void) | null;
  resultLines: string[];

  setMode: (mode: AppMode) => void;
  showPopup: (title: string, content: string) => void;
  hidePopup: () => void;
  showSelect: (title: string, items: string[], resolve: (index: number | null) => void) => void;
  hideSelect: () => void;
  showResult: (lines: string[]) => void;
  hideResult: () => void;
  showHelp: () => void;
  hideHelp: () => void;
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  mode: "browse",
  popupTitle: "",
  popupContent: "",
  selectTitle: "",
  selectItems: [],
  selectResolve: null,
  resultLines: [],

  setMode: (mode) => set({ mode }),

  showPopup: (title, content) => set({ mode: "popup", popupTitle: title, popupContent: content }),
  hidePopup: () => set({ mode: "browse", popupTitle: "", popupContent: "" }),

  showSelect: (title, items, resolve) =>
    set({ mode: "select", selectTitle: title, selectItems: items, selectResolve: resolve }),
  hideSelect: () =>
    set({ mode: "browse", selectTitle: "", selectItems: [], selectResolve: null }),

  showResult: (lines) => set({ mode: "result", resultLines: lines }),
  hideResult: () => set({ mode: "browse", resultLines: [] }),

  showHelp: () => set({ mode: "help" }),
  hideHelp: () => set({ mode: "browse" }),
});
