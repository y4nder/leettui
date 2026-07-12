// System + theme commands and the global modal-openers (search / help / debug / palette).
// `theme.open` launches the searchable theme picker popup (ThemePickerPopup); the theme
// cyclers stay as un-bound palette-runnable entries. The order here mirrors the original
// flat COMMANDS array: search.start first, then the system actions, then the theme entries.

import { useAppStore } from "@/ui/store";
import { makeCommand, type CommandEntry } from "@/ui/keymap/command";
import { getRenderer } from "@/ui/keymap/runtime";
import { cycleTheme } from "@/ui/theme";
import { isDebugEnabled } from "@/debug";
import type { AppMode } from "@/ui/store/slices/uiSlice";
import {
  handleCancelBackfill,
  handleOpenGitSync,
  handleOpenGitUi,
  handleOpenSolutionsWorkspace,
  handleReauth,
  handleStartBackfill,
  handleSyncDb,
  handleViewChangelog,
} from "@/views/browse/handlers";

export const systemCommands: CommandEntry[] = [
  makeCommand({
    name: "search.start",
    title: "Search / filter questions",
    category: "Search",
    short: "Search",
    run: () => useAppStore.getState().startSearch(),
  }),

  makeCommand({
    name: "help.open",
    title: "Show help screen",
    category: "System",
    short: "Help",
    run: () => useAppStore.getState().showHelp(),
  }),
  makeCommand({
    name: "debug.open",
    title: "Show debug overlay",
    category: "System",
    group: "debug",
    run: () => {
      if (isDebugEnabled()) useAppStore.getState().showDebug();
    },
  }),
  makeCommand({
    name: "db.sync",
    title: "Sync problem database",
    category: "System",
    run: () => handleSyncDb("*"),
  }),
  makeCommand({
    name: "auth.reauth",
    title: "Re-authenticate (refresh LeetCode session)",
    category: "System",
    run: () => {
      const r = getRenderer();
      if (r) handleReauth(r);
    },
  }),
  makeCommand({
    name: "solutions.changeDir",
    title: "Change solutions directory",
    category: "System",
    run: () => useAppStore.getState().showRelocate(),
  }),
  makeCommand({
    name: "config.open",
    title: "Settings — edit configuration",
    category: "System",
    short: "Settings",
    run: () => useAppStore.getState().showConfig(),
  }),
  makeCommand({
    name: "solutions.openWorkspace",
    title: "Open solutions dir in editor",
    category: "System",
    run: () => {
      const r = getRenderer();
      if (r) handleOpenSolutionsWorkspace("W", r);
    },
  }),
  makeCommand({
    name: "git.openUi",
    title: "Open git UI (lazygit) in solutions dir",
    category: "System",
    short: "Git",
    run: () => {
      const r = getRenderer();
      if (r) handleOpenGitUi(r);
    },
  }),
  makeCommand({
    name: "git.remoteSetup",
    title: "Back up solutions to GitHub (gh)",
    category: "System",
    run: () => useAppStore.getState().showGitRemote(),
  }),
  makeCommand({
    name: "git.remoteSync",
    title: "Sync solutions from GitHub (gh)",
    category: "System",
    run: () => handleOpenGitSync(),
  }),
  makeCommand({
    name: "submissions.backfill",
    title: "Import submission history from LeetCode",
    category: "System",
    run: () => handleStartBackfill(),
  }),
  makeCommand({
    name: "submissions.cancelBackfill",
    title: "Cancel submission import",
    category: "System",
    // No-op when no backfill is running (mirrors update.dismiss, lines above).
    run: () => handleCancelBackfill(),
  }),
  makeCommand({
    name: "palette.open",
    title: "Open command palette",
    category: "System",
    short: "Cmds",
    run: () => useAppStore.getState().showPalette(),
  }),
  makeCommand({
    name: "update.dismiss",
    title: "Dismiss update notification",
    category: "System",
    // No-op when no banner is showing; hides it for the rest of the session
    // (not persisted — it reappears on the next launch if still out of date).
    run: () => useAppStore.getState().setUpdateAvailable(null),
  }),
  makeCommand({
    name: "changelog.open",
    title: "What's new — view changelog",
    category: "System",
    short: "What's new",
    // Un-gated: fetches the latest release on demand so the changelog is viewable
    // on dev / from-source builds too (the boot auto-popup stays IS_RELEASE-gated).
    run: () => handleViewChangelog(),
  }),
  makeCommand({
    name: "egg.splash",
    title: "✦ Reveal the leettui logo",
    category: "View",
    run: () => useAppStore.getState().showEasterEgg(),
  }),
  makeCommand({
    name: "dashboard.open",
    title: "Open progress dashboard",
    category: "View",
    short: "Dashboard",
    // Loads stats synchronously then flips to dashboard mode, stashing the
    // current mode as the return target (D-11: Esc/q returns to origin mode).
    run: () => {
      const s = useAppStore.getState();
      s.loadDashboardStats();
      s.showDashboard(s.mode as AppMode);
    },
  }),
  makeCommand({
    name: "app.quit",
    title: "Quit",
    category: "System",
    short: "Quit",
    run: () => getRenderer()?.destroy(),
  }),

  makeCommand({
    name: "theme.open",
    title: "Theme… — pick a color theme",
    category: "System",
    short: "Theme",
    run: () => useAppStore.getState().showThemePicker(),
  }),
  makeCommand({
    name: "theme.cycle.next",
    title: "Theme: cycle next",
    category: "System",
    run: () => cycleTheme(1),
  }),
  makeCommand({
    name: "theme.cycle.prev",
    title: "Theme: cycle previous",
    category: "System",
    run: () => cycleTheme(-1),
  }),
];
