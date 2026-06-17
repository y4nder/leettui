// System + theme commands and the global modal-openers (search / help / debug / palette).
// Includes buildThemeSetCommands, which emits one theme.set.<name> entry per preset so each
// is its own searchable command-palette item. The order here mirrors the original flat
// COMMANDS array: search.start first, then the system actions, the theme cyclers, and the
// theme.set.* spread at its mid-list position.

import { useAppStore } from "../../store";
import { makeCommand, type CommandEntry } from "../command";
import { getRenderer } from "../runtime";
import { cycleTheme, listThemeNames, setTheme } from "../../theme";
import { isDebugEnabled } from "../../../debug";
import { handleReauth, handleSyncDb, handleViewChangelog } from "../../../views/browse/handlers";

function prettyThemeName(name: string): string {
  // kebab → Title Case: "tokyo-night" → "Tokyo Night", "system" → "System"
  return name
    .split(/[-_]/)
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

export function buildThemeSetCommands(): CommandEntry[] {
  return listThemeNames().map((name) =>
    makeCommand({
      name: `theme.set.${name}`,
      title: `Theme: ${prettyThemeName(name)}`,
      category: "System",
      run: () => setTheme(name, { persist: true }),
    }),
  );
}

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
    name: "app.quit",
    title: "Quit",
    category: "System",
    short: "Quit",
    run: () => getRenderer()?.destroy(),
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

  // theme.set.<name> commands are appended below (one per preset) so each
  // shows up as its own searchable entry in the command palette.
  ...buildThemeSetCommands(),
];
