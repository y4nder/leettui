// type: ui
// Owns the active mode and the ephemeral content of every popup. No domain data.
// NOTE: `mode` is co-owned with problemSlice — problemSlice's enter/exitProblemView
// write it, while the browse modal closers here also touch it.

import type { StateCreator } from "zustand";
import type { AppStore } from "../index";
import type { ResultView } from "../../../views/browse/resultView";
import type { ReleaseInfo } from "../../../core/update";
import type { RecentQuestion } from "../../../db/recents";

// Which browse-view panel currently holds focus (lazygit-style). Only meaningful
// while mode === "browse"; panel-relative bindings (j/k, Enter) are mounted per panel.
export type BrowsePanel = "topics" | "questions";

// Focus-cycle order, left-to-right. Tab walks forward, Shift+Tab backward (both wrap).
// The numeric jump keys ([1]/[2]) map to this order's positions.
export const PANEL_ORDER: BrowsePanel[] = ["topics", "questions"];

export type AppMode =
  | "browse"
  | "search"
  | "popup"
  | "select"
  | "result"
  | "help"
  | "debug"
  | "palette"
  | "problem"
  | "relocate"
  | "changelog"
  | "recent"
  | "easterEgg";

export interface UiSlice {
  mode: AppMode;
  focusedPanel: BrowsePanel;
  themeVersion: number;
  popupTitle: string;
  popupContent: string;
  selectTitle: string;
  selectItems: string[];
  selectResolve: ((index: number | null) => void) | null;
  resultView: ResultView | null;
  // The newer release tag to advertise in the top banner, or null when none.
  updateAvailable: string | null;
  // The release whose "What's new" popup is open (tag + notes body), or null.
  changelog: ReleaseInfo | null;
  // Recently-viewed questions snapshot backing the `h` history modal (Stage 20).
  // Captured at open time (like the select/changelog payloads), empty when closed.
  // Each carries its `viewedAt` instant so the modal can show when it was opened.
  recents: RecentQuestion[];
  // Per-panel "please glide the next scroll" nonces, bumped by the half-page
  // commands. The list components feed their panel's nonce to useGlide; a bump
  // animates the offset change, an unchanged nonce snaps. Per-panel (not one
  // shared) so a topic jump — which resets the question cursor to 0 — snaps the
  // question list instead of gliding it alongside.
  topicScrollNonce: number;
  questionScrollNonce: number;

  bumpThemeVersion: () => void;
  requestSmoothScroll: (panel: BrowsePanel) => void;
  setUpdateAvailable: (tag: string | null) => void;
  showChangelog: (release: ReleaseInfo) => void;
  hideChangelog: () => void;
  showRecent: (items: RecentQuestion[]) => void;
  hideRecent: () => void;
  setMode: (mode: AppMode) => void;
  setFocusedPanel: (panel: BrowsePanel) => void;
  // dir 1 = next panel, -1 = previous (wraps). Generalizes past two panels.
  cycleFocusedPanel: (dir: 1 | -1) => void;
  showPopup: (title: string, content: string) => void;
  hidePopup: () => void;
  showSelect: (title: string, items: string[], resolve: (index: number | null) => void) => void;
  hideSelect: () => void;
  showResult: (view: ResultView) => void;
  hideResult: () => void;
  showHelp: () => void;
  hideHelp: () => void;
  showDebug: () => void;
  hideDebug: () => void;
  showPalette: () => void;
  hidePalette: () => void;
  showRelocate: () => void;
  hideRelocate: () => void;
  showEasterEgg: () => void;
  hideEasterEgg: () => void;
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  mode: "browse",
  focusedPanel: "questions",
  themeVersion: 0,
  popupTitle: "",
  popupContent: "",
  selectTitle: "",
  selectItems: [],
  selectResolve: null,
  resultView: null,
  updateAvailable: null,
  changelog: null,
  recents: [],
  topicScrollNonce: 0,
  questionScrollNonce: 0,

  bumpThemeVersion: () => set((s) => ({ themeVersion: s.themeVersion + 1 })),
  requestSmoothScroll: (panel) =>
    set((s) =>
      panel === "topics"
        ? { topicScrollNonce: s.topicScrollNonce + 1 }
        : { questionScrollNonce: s.questionScrollNonce + 1 },
    ),
  setUpdateAvailable: (tag) => set({ updateAvailable: tag }),

  // "What's new" popup (Stage 18). Auto-opened once per new version at boot and
  // on demand from the command palette; closing returns to browse.
  showChangelog: (release) => set({ mode: "changelog", changelog: release }),
  hideChangelog: () => set({ mode: "browse", changelog: null }),

  // Recently-viewed history modal (Stage 20). Opened with `h` from browse; the
  // snapshot is read from the DB by the opening handler and passed in, mirroring
  // showSelect/showChangelog. Closing clears it back to browse.
  showRecent: (items) => set({ mode: "recent", recents: items }),
  hideRecent: () => set({ mode: "browse", recents: [] }),
  setMode: (mode) => set({ mode }),
  setFocusedPanel: (panel) => set({ focusedPanel: panel }),
  cycleFocusedPanel: (dir) =>
    set((s) => {
      const n = PANEL_ORDER.length;
      const i = PANEL_ORDER.indexOf(s.focusedPanel);
      const next = PANEL_ORDER[(i + dir + n) % n] ?? s.focusedPanel;
      return { focusedPanel: next };
    }),

  showPopup: (title, content) => set({ mode: "popup", popupTitle: title, popupContent: content }),
  hidePopup: () => set({ mode: "browse", popupTitle: "", popupContent: "" }),

  showSelect: (title, items, resolve) =>
    set({ mode: "select", selectTitle: title, selectItems: items, selectResolve: resolve }),
  hideSelect: () => set({ mode: "browse", selectTitle: "", selectItems: [], selectResolve: null }),

  showResult: (view) => set({ mode: "result", resultView: view }),
  hideResult: () => set({ mode: "browse", resultView: null }),

  showHelp: () => set({ mode: "help" }),
  hideHelp: () => set({ mode: "browse" }),

  showDebug: () => set({ mode: "debug" }),
  hideDebug: () => set({ mode: "browse" }),

  showPalette: () => set({ mode: "palette" }),
  hidePalette: () => set({ mode: "browse" }),

  // In-TUI "change solutions directory" prompt (Stage 10 item 4). A bare mode
  // toggle — the ChangeLocationPrompt owns its own input/confirm/done sub-state.
  showRelocate: () => set({ mode: "relocate" }),
  hideRelocate: () => set({ mode: "browse" }),

  // Easter egg: a full-screen ASCII art reveal that lingers until any key is pressed.
  showEasterEgg: () => set({ mode: "easterEgg" }),
  hideEasterEgg: () => set({ mode: "browse" }),
});
