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
import { getPendingUpdate } from "./core/update";
import { updateNotice } from "./core/updatePresent";
import { VERSION } from "./core/version";

loadConfig();
setTheme(getThemeName());

// Subcommands that don't need the TUI. Handle them on the plain terminal and exit
// before the renderer starts.
if (process.argv.includes("--version") || process.argv.includes("version")) {
  console.log(VERSION);
  process.exit(0);
}

if (process.argv.includes("update")) {
  const { runUpdate } = await import("./core/update");
  await runUpdate({ force: process.argv.includes("--force") });
  process.exit(0);
}

// Headless CLI verbs (Stage 8): `test`/`run`/`submit`/`new` run the engine
// UI-free and exit before the renderer starts, so they work from inside an
// editor's `:!`. `new <language>` takes a positional argument (the others infer
// everything from cwd), threaded through via `verbArg`.
{
  const { matchCliVerb, verbArg, runCli } = await import("./cli");
  const verb = matchCliVerb(process.argv);
  if (verb) {
    process.exit(await runCli(verb, process.cwd(), verbArg(process.argv, verb)));
  }
}

// The renderer now starts first: authentication and the initial sync run as animated
// steps inside <BootFlow>, not on the plain terminal. The `auth` subcommand forces
// re-authentication even when a valid saved session exists.
const force = process.argv.includes("auth");

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  screenMode: "alternate-screen",
  // OpenTUI's native threaded writer (the default on every platform except Linux,
  // which it forces off internally) doesn't reliably flush the *final* frame on
  // Windows once the continuous render loop stops. The animated onboarding screens
  // (splash/spinner/input-cursor) keep that loop running, but the static browse view
  // has no live renderable — so its single on-demand frame is left in the writer and
  // the screen stays black until a keypress forces another frame. Take Windows off
  // the threaded writer too (macOS is unaffected and keeps the default).
  ...(process.platform === "win32" ? { useThread: false } : {}),
});

// On quit (q, Ctrl+C, or any clean exit), remind the user if a newer release was
// found this session. Runs after the renderer has restored the main screen, so
// the notice lands in normal scrollback rather than the alternate buffer.
process.on("exit", () => {
  const tag = getPendingUpdate();
  if (tag) process.stdout.write(updateNotice(tag, VERSION));
});

attachPaletteListener(renderer);

const keymap = createOpenTuiKeymap(renderer);
installKeymap(keymap, renderer);

createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <BootFlow renderer={renderer} force={force} />
  </KeymapProvider>,
);
