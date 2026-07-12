import { colors } from "@/ui/theme";
import { TextSpinner, useTick } from "@/ui/components/Spinner";
import { smoothBar, sweepBar } from "@/ui/progress";

interface ProgressBarProps {
  current: number;
  total: number;
}

// One-line re-sync indicator pinned to the bottom of Browse/Problem while a
// manual re-sync runs. A spinner + a bespoke smooth bar (sweep until a total is
// known), matching the full-screen `SyncStep` so both sync surfaces read alike.
export function ProgressBar({ current, total }: ProgressBarProps) {
  const tick = useTick();
  const determinate = total > 0;
  const ratio = determinate ? current / total : 0;
  const pct = Math.round(ratio * 100);
  const barWidth = 24;
  const bar = determinate ? smoothBar(ratio, barWidth) : null;
  const sweep = determinate ? null : sweepBar(barWidth, tick);

  return (
    <box
      width="100%"
      height={1}
      backgroundColor={colors.statusBar}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
    >
      <TextSpinner color={colors.accent} />
      <text fg={colors.fg} marginLeft={1}>
        Syncing problems{" "}
      </text>
      {bar ? <text fg={colors.accent}>{bar.filled}</text> : null}
      {bar ? <text fg={colors.subtle}>{bar.empty}</text> : null}
      {sweep ? <text fg={colors.subtle}>{sweep.pre}</text> : null}
      {sweep ? <text fg={colors.accent}>{sweep.block}</text> : null}
      {sweep ? <text fg={colors.subtle}>{sweep.post}</text> : null}
      <text fg={colors.fgDim}>
        {determinate ? `  ${pct}%  ${current.toLocaleString()}/${total.toLocaleString()}` : ""}
      </text>
    </box>
  );
}
