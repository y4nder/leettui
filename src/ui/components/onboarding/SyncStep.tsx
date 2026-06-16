import { useTerminalDimensions } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { useAppStore } from "../../store";
import { SPINNER_FRAMES, useTick } from "../Spinner";
import { smoothBar, sweepBar } from "../../progress";

// Shown while the DB is opened and (on first run) the problem set is synced. Reads
// the same `syncProgress` slice that drives the rest of the app. Before a total is
// known it animates an indeterminate sweep under the spinner; once counts arrive
// it switches to a smooth determinate bar with a percentage and problem tally.
export function SyncStep() {
  const progress = useAppStore((s) => s.syncProgress);
  const { width } = useTerminalDimensions();
  const tick = useTick();

  const barWidth = Math.min(44, Math.max(20, width - 12));
  const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const determinate = total > 0;
  const ratio = determinate ? current / total : 0;
  const pct = Math.round(ratio * 100);
  const bar = determinate ? smoothBar(ratio, barWidth) : null;
  const sweep = determinate ? null : sweepBar(barWidth, tick);

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

      <box flexDirection="row" width={barWidth} justifyContent="space-between">
        <text fg={colors.subtle}>
          {spinner} {progress ? "Syncing problems" : "Setting things up"}
        </text>
        {determinate ? <text fg={colors.accent}>{pct}%</text> : null}
      </box>

      <box flexDirection="row" width={barWidth}>
        {bar ? <text fg={colors.accent}>{bar.filled}</text> : null}
        {bar ? <text fg={colors.subtle}>{bar.empty}</text> : null}
        {sweep ? <text fg={colors.subtle}>{sweep.pre}</text> : null}
        {sweep ? <text fg={colors.accent}>{sweep.block}</text> : null}
        {sweep ? <text fg={colors.subtle}>{sweep.post}</text> : null}
      </box>

      {determinate ? (
        <text fg={colors.fgDim}>
          {current.toLocaleString()} / {total.toLocaleString()} problems
        </text>
      ) : null}
    </box>
  );
}
