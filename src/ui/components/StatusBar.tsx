import { useTerminalDimensions } from "@opentui/react";
import { colors, difficultyColor } from "../theme";
import type { AppMode, BrowsePanel } from "../store";
import type { DifficultyFilter } from "../store/slices/filtersSlice";
import type { StatusCounts } from "../../db/questions";
import { footerSegments, fitFooter } from "../keymap";

// Columns reserved on the right for the stats / difficulty / debug block, so the
// hint line truncates before colliding with it.
const RIGHT_RESERVE = 26;

interface StatusBarProps {
  mode: AppMode;
  // Browse-view focus; drives the panel-aware hint line. Omitted by ProblemView,
  // which has its own HintsFooter — then no hint line is shown.
  focusedPanel?: BrowsePanel;
  searchNeedle: string;
  topicNeedle?: string;
  stats: StatusCounts;
  difficultyFilter: DifficultyFilter;
  debugEnabled?: boolean;
}

export function StatusBar({
  mode,
  focusedPanel,
  searchNeedle,
  topicNeedle,
  stats,
  difficultyFilter,
  debugEnabled,
}: StatusBarProps) {
  // Hook must run unconditionally, before the search-mode early return.
  const { width } = useTerminalDimensions();

  if (mode === "search") {
    // Search is panel-scoped: a "topic" prefix disambiguates the topics-panel
    // search from the question search (both triggered by `/`).
    const isTopic = focusedPanel === "topics";
    const needle = isTopic ? (topicNeedle ?? "") : searchNeedle;
    return (
      <box flexDirection="row" width="100%" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}> {isTopic ? "topic /" : "/"}</text>
        <text fg={colors.fg}>{needle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
    );
  }

  // Focus-aware hint line: focused panel's keys first, then global. Built from the
  // keymap so it never drifts from the actual bindings, and truncated to the
  // available width so it never collides with the stats block. Omitted when no
  // panel is focused (ProblemView, which carries its own HintsFooter).
  const hints = focusedPanel
    ? fitFooter(footerSegments(focusedPanel, !!debugEnabled), Math.max(8, width - RIGHT_RESERVE))
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
