import { useTerminalDimensions } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { useAppStore } from "../../store";

// Shown while the DB is opened and (on first run) the problem set is synced. Reads
// the same `syncProgress` slice that drives the rest of the app; before the first
// progress tick it shows a neutral "setting things up" line.
export function SyncStep() {
  const progress = useAppStore((s) => s.syncProgress);
  const { width } = useTerminalDimensions();

  const barWidth = Math.min(44, Math.max(20, width - 12));
  const pct = progress && progress.total > 0 ? progress.current / progress.total : 0;
  const filled = Math.round(pct * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(Math.max(0, barWidth - filled));

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
      <text fg={colors.subtle}>
        {progress
          ? `Syncing problems…  ${progress.current}/${progress.total}`
          : "Setting things up…"}
      </text>
      {progress ? <text fg={colors.accent}>{bar}</text> : null}
    </box>
  );
}
