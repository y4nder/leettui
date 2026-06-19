import { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { createCliRenderer } from "@opentui/core";

import { colors } from "../theme";
import { useAppStore } from "../store";
import { getGitUiCommand, getSolutionsDir } from "../../config";
import { handleConfirmGitInit } from "../../views/browse/handlers";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

// In-app "initialize git here?" confirm (Stage 22), opened when Ctrl+g (or the
// palette git command) lands on a solutions dir that isn't a repo yet. y/Enter
// scaffolds the repo (git init + defensive .gitignore + first commit) and then
// opens the git UI — "proceed into the git UI", not back to browse — via
// `handleConfirmGitInit`; n/Esc cancels. Like ChangeLocationPrompt it runs in a
// bare mode with no key-bearing layer mounted, so useKeyboard sees every key.
export function GitInitPrompt({ renderer }: { renderer: Renderer }) {
  const { width } = useTerminalDimensions();
  const [busy, setBusy] = useState(false);
  const gitUi = getGitUiCommand();
  const dir = getSolutionsDir();

  useKeyboard((key) => {
    if (busy) return; // a launch is already in flight — ignore further keys
    if (key.name === "y" || key.name === "return") {
      setBusy(true);
      // The handler closes this modal then suspends the renderer to launch the
      // git UI; on failure it surfaces a result. We don't touch state after.
      void handleConfirmGitInit(renderer);
    } else if (key.name === "n" || key.name === "escape") {
      useAppStore.getState().hideGitInit();
    }
  });

  const boxWidth = Math.min(80, Math.max(40, width - 8));

  return (
    <box
      position="absolute"
      left="50%"
      top="30%"
      width={boxWidth}
      marginLeft={-Math.floor(boxWidth / 2)}
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <text fg={colors.fgAccent}>Version-control your solutions</text>
      <box height={1} />

      {busy ? (
        <text fg={colors.subtle}>{`Initializing git and opening ${gitUi}…`}</text>
      ) : (
        <>
          <text fg={colors.subtle}>This folder isn't a git repository yet:</text>
          <text fg={colors.fgDim}>{dir}</text>
          <box height={1} />
          <text fg={colors.subtle}>
            {`Initialize one (with a safe .gitignore + first commit) and open ${gitUi}?`}
          </text>
          <box height={1} />
          <box flexDirection="row">
            <text fg={colors.success}>y</text>
            <text fg={colors.subtle}>: initialize &amp; open </text>
            <text fg={colors.error}>n</text>
            <text fg={colors.subtle}>: cancel</text>
          </box>
        </>
      )}
    </box>
  );
}
