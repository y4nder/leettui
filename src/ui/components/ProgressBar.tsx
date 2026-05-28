import { colors } from "../theme";

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <box width="100%" height={1} backgroundColor={colors.statusBar}>
      <text fg={colors.fgAccent}>
        {" "}
        Syncing... {current}/{total} ({pct}%)
      </text>
    </box>
  );
}
