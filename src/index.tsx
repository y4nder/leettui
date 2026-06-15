// Must run before anything touches @opentui/core's tree-sitter client, so it is
// the very first import: embeds the highlight worker into the compiled binary.
import "./core/treeSitterWorker";

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";

import { initDebug } from "./debug";
import { loadConfig, getThemeName } from "./config";
import { setTheme } from "./ui/theme";
import { attachPaletteListener } from "./ui/palette";

// Debug overlay is dev-only. Bun statically inlines NODE_ENV as "production" in the
// compiled binary, so this branch is dead-code-eliminated from the production build.
const isProduction = process.env.NODE_ENV === "production";
const debugFlag =
  !isProduction && (process.env.LEETTUI_DEBUG === "1" || process.argv.includes("--debug"));
initDebug(debugFlag);
import { BootFlow } from "./ui/components/onboarding/BootFlow";
import { installKeymap } from "./ui/keymap";

loadConfig();
setTheme(getThemeName());

// Subcommands that don't need the TUI. Handle them on the plain terminal and exit
// before the renderer starts.
if (process.argv.includes("--version") || process.argv.includes("version")) {
  const { VERSION } = await import("./core/version");
  console.log(VERSION);
  process.exit(0);
}

if (process.argv.includes("update")) {
  const { runUpdate } = await import("./core/update");
  await runUpdate({ force: process.argv.includes("--force") });
  process.exit(0);
}

// Headless CLI verbs (Stage 8): `test`/`run`/`submit` run the engine UI-free and
// exit before the renderer starts, so they work from inside an editor's `:!`.
{
  const { matchCliVerb, runCli } = await import("./cli");
  const verb = matchCliVerb(process.argv);
  if (verb) {
    process.exit(await runCli(verb));
  }
}

// The renderer now starts first: authentication and the initial sync run as animated
// steps inside <BootFlow>, not on the plain terminal. The `auth` subcommand forces
// re-authentication even when a valid saved session exists.
const force = process.argv.includes("auth");

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  screenMode: "alternate-screen",
});

attachPaletteListener(renderer);

const keymap = createOpenTuiKeymap(renderer);
installKeymap(keymap, renderer);

createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <BootFlow renderer={renderer} force={force} />
  </KeymapProvider>,
);
