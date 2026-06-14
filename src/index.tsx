import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";

import { initDebug } from "./debug";
import { loadConfig, getDbPath, getThemeName } from "./config";
import { setTheme } from "./ui/theme";
import { attachPaletteListener } from "./ui/palette";

// Debug overlay is dev-only. Bun statically inlines NODE_ENV as "production" in the
// compiled binary, so this branch is dead-code-eliminated from the production build.
const isProduction = process.env.NODE_ENV === "production";
const debugFlag =
  !isProduction && (process.env.LEETTUI_DEBUG === "1" || process.argv.includes("--debug"));
initDebug(debugFlag);
import { initClient } from "./api/client";
import { ensureAuthenticated } from "./core/auth";
import { openDatabase } from "./db";
import { syncIfEmpty } from "./core/sync";
import { App } from "./app";
import { installKeymap } from "./ui/keymap";

const config = loadConfig();

setTheme(getThemeName());

// Acquire valid tokens before anything talks to LeetCode — the flow runs when the
// `auth` subcommand is passed, tokens are missing, or the saved session has expired.
const tokens = await ensureAuthenticated(config, { force: process.argv.includes("auth") });
if (!tokens) {
  console.error("Authentication is required to use leettui. Exiting.");
  process.exit(1);
}

initClient(tokens.csrftoken, tokens.lc_session);

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

attachPaletteListener(renderer);

const keymap = createOpenTuiKeymap(renderer);
installKeymap(keymap, renderer);

createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <App renderer={renderer} />
  </KeymapProvider>,
);
