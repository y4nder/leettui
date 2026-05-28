import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";

import { initDebug } from "./debug";
import { loadConfig, getDbPath, getThemeName } from "./config";
import { setTheme } from "./ui/theme";

const debugFlag = process.env.LEETTUI_DEBUG === "1" || process.argv.includes("--debug");
initDebug(debugFlag);
import { initClient } from "./api/client";
import { openDatabase } from "./db";
import { syncIfEmpty } from "./core/sync";
import { App } from "./app";
import { installKeymap } from "./ui/keymap";

const config = loadConfig();

setTheme(getThemeName());

initClient(config.csrftoken, config.lc_session);

const dbPath = getDbPath();
openDatabase(dbPath);

console.log("Syncing questions...");
await syncIfEmpty((current, total) => {
  process.stdout.write(`\rFetching questions: ${current}/${total}`);
});
console.log("\nStarting TUI...");

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  screenMode: "alternate-screen",
});

const keymap = createOpenTuiKeymap(renderer);
installKeymap(keymap, renderer);

createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <App renderer={renderer} />
  </KeymapProvider>,
);
