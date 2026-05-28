import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { initDebug } from "./debug";
import { loadConfig, getDbPath } from "./config";

const debugFlag = process.env.LEETTUI_DEBUG === "1" || process.argv.includes("--debug");
initDebug(debugFlag);
import { initClient } from "./api/client";
import { openDatabase } from "./db";
import { syncIfEmpty } from "./core/sync";
import { App } from "./app";

const config = loadConfig();

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

createRoot(renderer).render(<App renderer={renderer} />);
