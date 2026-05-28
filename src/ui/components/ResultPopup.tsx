import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import { resultBindings } from "../keymap";
import type { ResultView } from "../../views/browse/resultView";
import { ResultBody } from "./ResultBody";

interface ResultPopupProps {
  view: ResultView;
}

export function ResultPopup({ view }: ResultPopupProps) {
  useBindings(() => ({ bindings: resultBindings }), []);

  return (
    <box
      position="absolute"
      left="15%"
      top="15%"
      width="70%"
      height="70%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> Result </text>

      <scrollbox flexGrow={1}>
        <ResultBody view={view} />
      </scrollbox>

      <text fg={colors.fgDim}> Esc/Enter:Close </text>
    </box>
  );
}
