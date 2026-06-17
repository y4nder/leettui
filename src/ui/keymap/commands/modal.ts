// Popup / result modal commands. All group:"modal" (hidden from the command palette). The
// global modal-openers (palette/help/debug/search start) live in system.ts; this file is the
// popup/result *closers* and scroll + the search edit keys only.

import { useAppStore } from "../../store";
import { makeCommand, type CommandEntry } from "../command";
import { scrollActivePopup } from "../runtime";
import { dumpToString } from "../../../debug";
import { openInBrowser } from "../../../core/auth";
import { releaseUrl } from "../../../core/update";

export const modalCommands: CommandEntry[] = [
  // Modal-only commands. Hidden from the palette via group: "modal".
  makeCommand({
    name: "popup.scrollDown",
    title: "Scroll popup down",
    category: "View",
    group: "modal",
    run: () => scrollActivePopup(1),
  }),
  makeCommand({
    name: "popup.scrollUp",
    title: "Scroll popup up",
    category: "View",
    group: "modal",
    run: () => scrollActivePopup(-1),
  }),
  makeCommand({
    name: "popup.close",
    title: "Close popup",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hidePopup(),
  }),
  makeCommand({
    name: "result.close",
    title: "Close result",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideResult(),
  }),
  makeCommand({
    name: "help.close",
    title: "Close help",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideHelp(),
  }),
  makeCommand({
    name: "debug.close",
    title: "Close debug",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideDebug(),
  }),
  makeCommand({
    name: "debug.yank",
    title: "Yank debug log to file",
    category: "System",
    group: "debug",
    run: () => {
      const s = useAppStore.getState();
      const log = dumpToString();
      Bun.write("/tmp/leettui-debug.log", log).then(() => {
        s.hideDebug();
        s.showResult({ kind: "info", title: "Log written to /tmp/leettui-debug.log" });
      });
    },
  }),
  makeCommand({
    name: "palette.close",
    title: "Close command palette",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hidePalette(),
  }),
  makeCommand({
    name: "changelog.close",
    title: "Close changelog",
    category: "View",
    group: "modal",
    run: () => useAppStore.getState().hideChangelog(),
  }),
  makeCommand({
    name: "changelog.openGithub",
    title: "Open release on GitHub",
    category: "View",
    group: "modal",
    // Fire-and-forget (openInBrowser is try/caught + unref'd); no-op if somehow
    // open with no payload.
    run: () => {
      const cl = useAppStore.getState().changelog;
      if (cl) openInBrowser(releaseUrl(cl.tag));
    },
  }),
  makeCommand({
    name: "search.backspace",
    title: "Search: delete char",
    category: "Search",
    group: "modal",
    run: () => {
      const s = useAppStore.getState();
      const active = s.focusedPanel === "topics" ? s.topicNeedle : s.searchNeedle;
      s.updateSearch(active.slice(0, -1));
    },
  }),
  makeCommand({
    name: "search.end",
    title: "Exit search",
    category: "Search",
    group: "modal",
    run: () => useAppStore.getState().endSearch(),
  }),
];
