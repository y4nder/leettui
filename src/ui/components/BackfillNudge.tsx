import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { colors } from "../theme";
import { useAppStore } from "../store";
import { handleStartBackfill } from "../../views/browse/handlers";

// One-time first-run nudge (D-01/D-02/D-03) offering to import LeetCode submission
// history. A LIGHT, dismissible popup — NOT a blocking gate — mounted only while
// mode === "backfillNudge". BootFlow flips this at most once: setBackfillNudgeShown()
// runs unconditionally at boot regardless of whether the nudge actually shows, so it
// can never re-appear on a later launch. Runs in a bare mode with no key-bearing
// binding layer mounted (mirrors GitInitPrompt/ChangeLocationPrompt), so useKeyboard
// sees every key directly: r/Enter runs the backfill now (delegating to the same
// handler the submissions.backfill palette command uses), Esc/l/q dismiss for now.
export function BackfillNudge() {
  const { width } = useTerminalDimensions();

  useKeyboard((key) => {
    if (key.name === "r" || key.name === "return") {
      useAppStore.getState().hideBackfillNudge();
      void handleStartBackfill();
    } else if (key.name === "l" || key.name === "escape" || key.name === "q") {
      useAppStore.getState().hideBackfillNudge();
    }
  });

  const boxWidth = Math.min(76, Math.max(40, width - 8));

  return (
    <box
      position="absolute"
      left="50%"
      top="35%"
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
      <text fg={colors.fgAccent}>Import your LeetCode submission history?</text>
      <box height={1} />
      <text fg={colors.subtle}>
        leettui can back-fill your past submissions (status, language, runtime, memory) into its
        local store. It runs in the background — you can keep navigating — and is cancelable anytime
        from the command palette.
      </text>
      <box height={1} />
      <box flexDirection="row">
        <text fg={colors.success}>r/Enter</text>
        <text fg={colors.subtle}>: run now </text>
        <text fg={colors.error}>l/Esc</text>
        <text fg={colors.subtle}>: later</text>
      </box>
    </box>
  );
}
