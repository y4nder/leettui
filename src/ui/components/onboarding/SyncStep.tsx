import { useTerminalDimensions } from "@opentui/react";
// Side-effect import: registers the `<spinner>` intrinsic via @opentui/react's
// `extend`. It peer-targets @opentui/core ^0.3.4 (we're on 0.2.16) but every
// internal it uses exists in 0.2.16 — verified rendering + animating.
import "opentui-spinner/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { useAppStore } from "../../store";
import { useTick } from "../Spinner";
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
      {/* Inner column does the stacking; the outer box only centers it. A nested
          row-`<box>` (the bar) collapses and overlaps its siblings when it's a
          direct child of a `justifyContent: center` container, so keep the
          centering and the stacking on separate boxes. */}
      <box flexDirection="column" alignItems="center">
        <Logo subtitle="" />
        <box height={1} />

        <box flexDirection="row" width={barWidth} justifyContent="space-between">
          <box flexDirection="row" alignItems="center">
            <spinner name="star" color={colors.accent} />
            <text fg={colors.subtle} marginLeft={1}>
              {progress ? "Syncing problems" : "Setting things up"}
            </text>
          </box>
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
    </box>
  );
}
