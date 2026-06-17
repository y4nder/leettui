import { useBindings } from "@opentui/keymap/react";
import { useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";

import { colors } from "../theme";
import { deletePromptBindings } from "../keymap";

interface DeleteSolutionPromptProps {
  // The language folder about to be removed (frozen at open time in problemSlice).
  langSlug: string;
}

// Confirm modal for the irreversible delete-solution action (Stage 16). Mounted only
// while `problem.deleteConfirm` is set; ProblemView gates the global + panel layers off
// while it's open, so its own `deletePromptBindings` (y/Enter delete · n/Esc cancel) are
// the only live keys — the delete can't fire behind it. Names the language so the user
// confirms exactly which solution folder is going away.
export function DeleteSolutionPrompt({ langSlug }: DeleteSolutionPromptProps) {
  useBindings(() => ({ bindings: deletePromptBindings }), []);
  const { width } = useTerminalDimensions();
  const boxWidth = Math.min(70, Math.max(40, width - 8));

  return (
    <box
      position="absolute"
      left="50%"
      top="30%"
      width={boxWidth}
      marginLeft={-Math.floor(boxWidth / 2)}
      borderStyle="rounded"
      borderColor={colors.error}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <text fg={colors.error} attributes={TextAttributes.BOLD}>
        Delete solution
      </text>
      <box height={1} />
      <box flexDirection="row">
        <text fg={colors.subtle}>Remove the </text>
        <text fg={colors.fgAccent}>{langSlug}</text>
        <text fg={colors.subtle}> solution folder?</text>
      </box>
      <text fg={colors.fgDim}>Its solution file, harness, and build output go — permanently.</text>
      <text fg={colors.fgDim}>Shared notes.md / problem.md / tests/ are kept.</text>
      <box height={1} />
      <box flexDirection="row">
        <text fg={colors.error}>y</text>
        <text fg={colors.subtle}>: delete </text>
        <text fg={colors.success}>n</text>
        <text fg={colors.subtle}>: cancel</text>
      </box>
    </box>
  );
}
