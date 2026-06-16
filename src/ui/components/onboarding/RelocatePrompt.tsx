import { useState } from "react";
import { useKeyboard } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { relocateSolutions, type RelocateResult, type RelocationPlan } from "../../../core/relocate";

interface RelocatePromptProps {
  plan: RelocationPlan;
  /** Called once the user has resolved the prompt (moved or skipped). */
  onResolved: () => void;
}

// Boot-time, never-silent migration offer (Stage 10 item 2). Shown when the
// resolved solutions dir differs from the tracked last-known one and the old dir
// still holds problem folders — e.g. the user hand-edited `[paths].solutions`.
// y/Enter moves the tree via item 1's engine; n/Esc leaves it in place. After a
// move we show the actual {moved, skipped} (the offered N is a pre-skip upper
// bound) and wait for a keypress before handing back to boot.
export function RelocatePrompt({ plan, onResolved }: RelocatePromptProps) {
  const [result, setResult] = useState<RelocateResult | null>(null);

  useKeyboard((key) => {
    if (result) {
      onResolved(); // any key dismisses the result summary
      return;
    }
    if (key.name === "y" || key.name === "return") {
      setResult(relocateSolutions(plan.fromDir, plan.toDir));
    } else if (key.name === "n" || key.name === "escape") {
      onResolved();
    }
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={colors.bg}
    >
      <Logo subtitle="" />
      <box height={1} />
      {result ? (
        <>
          {/* `moved` counts every top-level entry (problem folders plus any
              shared files like `.git`/README), so it's deliberately "items",
              not "problem folders" — the offered N above counts folders only.
              `skipped` conflates "already at the target" and "couldn't move",
              so the message states the observable outcome, not a cause. */}
          <text fg={colors.success}>
            {`Moved ${result.moved} item${result.moved === 1 ? "" : "s"} to the new location.`}
          </text>
          {result.skipped > 0 ? (
            <text fg={colors.warn}>
              {`${result.skipped} left at the previous location (already present there, or unreadable).`}
            </text>
          ) : null}
          <text fg={colors.fgDim}>Press any key to continue.</text>
        </>
      ) : (
        <>
          <text fg={colors.subtle}>
            {`Your solutions directory changed. ${plan.count} problem folder${
              plan.count === 1 ? "" : "s"
            } sit in the previous location:`}
          </text>
          <box height={1} />
          <text fg={colors.fgDim}>{`from  ${plan.fromDir}`}</text>
          <text fg={colors.accent}>{`to    ${plan.toDir}`}</text>
          <box height={1} />
          <box flexDirection="row">
            <text fg={colors.subtle}>Move them now?  </text>
            <text fg={colors.success}>y</text>
            <text fg={colors.subtle}>es</text>
            <text fg={colors.fgDim}> / </text>
            <text fg={colors.error}>n</text>
            <text fg={colors.subtle}>o (keep where they are)</text>
          </box>
        </>
      )}
    </box>
  );
}
