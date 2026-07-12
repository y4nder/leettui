// type: ui
// Owns the active mode and the ephemeral content of every popup. No domain data.
// NOTE: `mode` is co-owned with problemSlice — problemSlice's enter/exitProblemView
// write it, while the browse modal closers here also touch it.

import type { StateCreator } from "zustand";
import type { AppStore } from "@/ui/store/index";
import type { ResultView } from "@/views/browse/resultView";
import type { ChangelogPayload } from "@/core/update";
import type { RecentQuestion } from "@/db/recents";
import type { DbQuestion } from "@/db/questions";

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
  | "gitInit"
  | "gitRemote"
  | "gitSync"
  | "config"
  | "backfillNudge"
  | "easterEgg"
  | "dashboard"; // Phase 3

// Which remote→local direction the GitSyncPrompt runs: clone a fresh/empty dir, or
// fast-forward pull an already-tracked one. Decided by handleOpenGitSync's dir probe.
export type GitSyncMode = "clone" | "pull";

export interface UiSlice {
  mode: AppMode;
  focusedPanel: BrowsePanel;
  themeVersion: number;
  popupTitle: string;
  popupContent: string;
  // The locally-synced question backing the open popup (daily challenge), or null
  // when it isn't in the DB. Lets the popup's Enter open it in the problem view.
  popupQuestion: DbQuestion | null;
  selectTitle: string;
  selectItems: string[];
  selectResolve: ((index: number | null) => void) | null;
  resultView: ResultView | null;
  // The newer release tag to advertise in the top banner, or null when none.
  updateAvailable: string | null;
  // The open "What's new" payload (recent releases newest-first + which tag is
  // emphasized — installed at boot, latest via the palette), or null when closed.
  changelog: ChangelogPayload | null;
  // Recently-viewed questions snapshot backing the `h` history modal (Stage 20).
  // Captured at open time (like the select/changelog payloads), empty when closed.
  // Each carries its `viewedAt` instant so the modal can show when it was opened.
  recents: RecentQuestion[];
  // Which direction the GitSyncPrompt runs (clone vs fast-forward pull), or null when
  // closed. Set by handleOpenGitSync's dir probe before opening the wizard (Stage 24).
  gitSyncMode: GitSyncMode | null;
  // The mode to restore when the dashboard is closed. Initialized to "browse";
  // showDashboard stashes the pre-open mode here so hideDashboard can return to it.
  // showDashboard writes ONLY mode + dashboardReturnMode — never touches problem state (D-11).
  dashboardReturnMode: AppMode;
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
  showChangelog: (payload: ChangelogPayload) => void;
  hideChangelog: () => void;
  showRecent: (items: RecentQuestion[]) => void;
  hideRecent: () => void;
  setMode: (mode: AppMode) => void;
  setFocusedPanel: (panel: BrowsePanel) => void;
  // dir 1 = next panel, -1 = previous (wraps). Generalizes past two panels.
  cycleFocusedPanel: (dir: 1 | -1) => void;
  showPopup: (title: string, content: string, question?: DbQuestion | null) => void;
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
  showGitInit: () => void;
  hideGitInit: () => void;
  showGitRemote: () => void;
  hideGitRemote: () => void;
  showGitSync: (mode: GitSyncMode) => void;
  hideGitSync: () => void;
  showConfig: () => void;
  hideConfig: () => void;
  showBackfillNudge: () => void;
  hideBackfillNudge: () => void;
  showEasterEgg: () => void;
  hideEasterEgg: () => void;
  // Progress dashboard (Phase 3). showDashboard stashes the pre-open mode so
  // hideDashboard can return to it — browse→browse, problem→problem (D-11).
  showDashboard: (returnMode: AppMode) => void;
  hideDashboard: () => void;
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  mode: "browse",
  focusedPanel: "questions",
  themeVersion: 0,
  popupTitle: "",
  popupContent: "",
  popupQuestion: null,
  selectTitle: "",
  selectItems: [],
  selectResolve: null,
  resultView: null,
  updateAvailable: null,
  changelog: null,
  recents: [],
  gitSyncMode: null,
  dashboardReturnMode: "browse",
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
  showChangelog: (payload) => set({ mode: "changelog", changelog: payload }),
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

  showPopup: (title, content, question = null) =>
    set({ mode: "popup", popupTitle: title, popupContent: content, popupQuestion: question }),
  hidePopup: () => set({ mode: "browse", popupTitle: "", popupContent: "", popupQuestion: null }),

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

  // Git version control (Stage 22). Both are bare mode toggles like showRelocate —
  // the GitInitPrompt / GitRemotePrompt own their own confirm/input sub-state and
  // run with no key-bearing layer mounted (every key falls through to useKeyboard).
  showGitInit: () => set({ mode: "gitInit" }),
  hideGitInit: () => set({ mode: "browse" }),
  showGitRemote: () => set({ mode: "gitRemote" }),
  hideGitRemote: () => set({ mode: "browse" }),

  // Sync FROM a remote (Stage 24). Carries the probed direction so GitSyncPrompt can
  // start at the right phase (clone → input a repo, pull → straight to confirm).
  showGitSync: (mode) => set({ mode: "gitSync", gitSyncMode: mode }),
  hideGitSync: () => set({ mode: "browse", gitSyncMode: null }),

  // In-TUI settings editor. A bare mode toggle like showRelocate — SettingsEditor
  // owns its own list cursor + inline-edit sub-state, and no key-bearing layer
  // mounts in "config" mode, so every key falls through to its useKeyboard/<input>.
  showConfig: () => set({ mode: "config" }),
  hideConfig: () => set({ mode: "browse" }),

  // One-time first-run backfill nudge (D-01/D-02/D-03). A bare mode toggle like
  // showGitInit/showGitRemote — BackfillNudge owns its own confirm/dismiss keys
  // via a plain useKeyboard layer (no key-bearing binding layer mounted).
  showBackfillNudge: () => set({ mode: "backfillNudge" }),
  hideBackfillNudge: () => set({ mode: "browse" }),

  // Easter egg: a full-screen ASCII art reveal that lingers until any key is pressed.
  showEasterEgg: () => set({ mode: "easterEgg" }),
  hideEasterEgg: () => set({ mode: "browse" }),

  // Progress dashboard (Phase 3). showDashboard writes ONLY mode + dashboardReturnMode —
  // never touches problem state (D-11: problem context is preserved while in dashboard,
  // returning is a plain mode flip via dashboardReturnMode).
  showDashboard: (returnMode) => set({ mode: "dashboard", dashboardReturnMode: returnMode }),
  hideDashboard: () => set((s) => ({ mode: s.dashboardReturnMode })),
});
