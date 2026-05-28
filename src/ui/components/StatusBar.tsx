import { colors } from "../theme";
import type { AppMode } from "../store";
import type { StatusCounts } from "../../db/questions";

interface StatusBarProps {
  mode: AppMode;
  searchNeedle: string;
  stats: StatusCounts;
  debugEnabled?: boolean;
}

export function StatusBar({ mode, searchNeedle, stats, debugEnabled }: StatusBarProps) {
  if (mode === "search") {
    return (
      <box
        flexDirection="row"
        width="100%"
        height={1}
        backgroundColor={colors.statusBar}
      >
        <text fg={colors.fgAccent}> /</text>
        <text fg={colors.fg}>{searchNeedle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
    );
  }

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      backgroundColor={colors.statusBar}
      justifyContent="space-between"
    >
      <text fg={colors.statusBarFg}>
        {" "}
        j/k:Navigate t/T:Topic Enter:View e:Edit R:Run s:Submit /:Search
      </text>
      <box flexDirection="row">
        <text fg={colors.accepted}>✓ {stats.solved}</text>
        <text fg={colors.fgDim}>  </text>
        <text fg={colors.attempted}>~ {stats.attempted}</text>
        <text fg={colors.fgDim}>  / {stats.total}</text>
        {debugEnabled && <text fg={colors.hard}> [DEBUG] </text>}
        <text fg={colors.fgDim}> ?:Help q:Quit </text>
      </box>
    </box>
  );
}
