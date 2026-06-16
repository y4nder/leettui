import type { ReactNode } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { colors, difficultyColor } from "../theme";
import type { AppMode, BrowsePanel, ProblemPanel } from "../store";
import type { DifficultyFilter } from "../store/slices/filtersSlice";
import type { StatusCounts } from "../../db/questions";
import { footerSegments, fitFooter } from "../keymap";

// Columns reserved on the right for the stats / difficulty / debug block, so the
// hint line truncates before colliding with it.
const RIGHT_RESERVE = 26;

// ProblemView footer (Stage 12): a `[Keymaps] [Pane]`-prefixed hint line, full-width at
// the bottom like browse. The hint string is hand-maintained — the problem-view commands
// are all group:"modal", so the auto-generated footerSegments path would hide them — so
// keep it in sync when problem keybindings change.
const PROBLEM_PANEL_LABEL: Record<ProblemPanel, string> = {
  description: "Description",
  solutions: "Solutions",
  result: "Result",
  related: "Related",
};
const PROBLEM_HINTS =
  "Tab:Focus j/k:Nav f:Solutions e:Edit R:Run t:Test s:Submit n:Notes ?:Help Esc/q:Back";

interface StatusBarProps {
  mode: AppMode;
  // Browse-view focus; drives the panel-aware hint line.
  focusedPanel?: BrowsePanel;
  // ProblemView focus; when set, the footer shows `[Keymaps] [Pane]` + the problem hint
  // line instead of the browse hints. The two focus props are mutually exclusive.
  problemPanel?: ProblemPanel;
  searchNeedle: string;
  topicNeedle?: string;
  stats: StatusCounts;
  difficultyFilter: DifficultyFilter;
  debugEnabled?: boolean;
}

export function StatusBar({
  mode,
  focusedPanel,
  problemPanel,
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

  // Footer hint line, truncated to the available width so it never collides with the
  // stats block. ProblemView passes `problemPanel` → a `[Keymaps] [Pane]`-prefixed hint
  // line; browse passes `focusedPanel` → its focus-aware, keymap-derived hints (which
  // never drift from the actual bindings). Exactly one is set.
  let left: ReactNode;
  if (problemPanel) {
    const label = PROBLEM_PANEL_LABEL[problemPanel];
    const budget = Math.max(8, width - RIGHT_RESERVE - ` [Keymaps] [${label}] `.length);
    const hints =
      PROBLEM_HINTS.length > budget ? `${PROBLEM_HINTS.slice(0, budget - 1)}…` : PROBLEM_HINTS;
    left = (
      <box flexDirection="row">
        <text fg={colors.fgDim}> [Keymaps]</text>
        <text fg={colors.accent}> [{label}]</text>
        <text fg={colors.statusBarFg}> {hints}</text>
      </box>
    );
  } else {
    const hints = focusedPanel
      ? fitFooter(footerSegments(focusedPanel, !!debugEnabled), Math.max(8, width - RIGHT_RESERVE))
      : "";
    left = <text fg={colors.statusBarFg}> {hints}</text>;
  }

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      backgroundColor={colors.statusBar}
      justifyContent="space-between"
    >
      {left}
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
