import { colors, difficultyColor } from "../theme";
import type { AppMode, BrowsePanel } from "../store";
import type { DifficultyFilter } from "../store/slices/filtersSlice";
import type { StatusCounts } from "../../db/questions";
import { footerSegments } from "../keymap";

interface StatusBarProps {
  mode: AppMode;
  // Browse-view focus; drives the panel-aware hint line. Omitted by ProblemView,
  // which has its own HintsFooter — then no hint line is shown.
  focusedPanel?: BrowsePanel;
  searchNeedle: string;
  stats: StatusCounts;
  difficultyFilter: DifficultyFilter;
  debugEnabled?: boolean;
}

export function StatusBar({
  mode,
  focusedPanel,
  searchNeedle,
  stats,
  difficultyFilter,
  debugEnabled,
}: StatusBarProps) {
  if (mode === "search") {
    return (
      <box flexDirection="row" width="100%" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}> /</text>
        <text fg={colors.fg}>{searchNeedle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
    );
  }

  // Focus-aware hint line: focused panel's keys first, then global. Built from the
  // keymap so it never drifts from the actual bindings. Omitted when no panel is
  // focused (ProblemView, which carries its own HintsFooter).
  const hints = focusedPanel
    ? footerSegments(focusedPanel, !!debugEnabled)
        .map((s) => `${s.keys}:${s.label}`)
        .join("  ")
    : "";

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      backgroundColor={colors.statusBar}
      justifyContent="space-between"
    >
      <text fg={colors.statusBarFg}> {hints}</text>
      <box flexDirection="row">
        {difficultyFilter !== "all" && (
          <text fg={difficultyColor(difficultyFilter)}> [{difficultyFilter}] </text>
        )}
        <text fg={colors.accepted}>✓ {stats.solved}</text>
        <text fg={colors.fgDim}> </text>
        <text fg={colors.attempted}>~ {stats.attempted}</text>
        <text fg={colors.fgDim}> / {stats.total} </text>
        {debugEnabled && <text fg={colors.hard}> [DEBUG] </text>}
      </box>
    </box>
  );
}
