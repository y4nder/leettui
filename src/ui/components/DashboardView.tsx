import type { createCliRenderer } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors, difficultyColor } from "../theme";
import { useAppStore } from "../store";
import { dashboardBindings, registerPopupScroller } from "../keymap";
import { hasAnySubmissions } from "../../db/submissions";

// Full-screen progress dashboard (Phase 3 / DASH-01). Opened with `p` from browse
// or problem view; returns to the origin mode on Esc/q (dashboardReturnMode — D-11).
// Reads from dashboardSlice.dashboardStats (loaded synchronously before this mounts).
// An empty submission store shows a backfill CTA (D-13); otherwise renders the
// summary block: streak → total+breakdown → 7d/30d/consistency (D-06 order).
// Heatmap and sparkline slots are left for plan 03-03 (see placeholder comment below).
export function DashboardView({
  renderer: _renderer,
}: {
  renderer: Awaited<ReturnType<typeof createCliRenderer>>;
}) {
  useBindings(() => ({ bindings: dashboardBindings }), []);

  const dashboardStats = useAppStore((s) => s.dashboardStats);
  // Subscribe to themeVersion so a live theme switch repaints (mirrors Browse/ProblemView).
  useAppStore((s) => s.themeVersion);

  const isEmpty = !hasAnySubmissions();

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={colors.bg}
      flexDirection="column"
    >
      {/* Header — flexShrink={0} is MANDATORY (Pitfall 5): without it the header
          collapses to zero height when the scrollbox body grows tall. */}
      <text fg={colors.fgAccent} flexShrink={0}>
        {" Progress Dashboard "}
      </text>

      <scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
        {isEmpty || dashboardStats === null ? (
          // D-13: empty-state CTA instead of a wall of zeros
          <text fg={colors.fgDim}>{"No submission history yet — run backfill from Ctrl+P"}</text>
        ) : (
          <box flexDirection="column">
            {/* (1) Streak line — leading (D-06 order) */}
            <text fg={colors.fgAccent}>
              {`🔥 ${dashboardStats.currentStreak}-day streak (best ${dashboardStats.longestStreak})`}
            </text>

            {/* (2) Total solved + colored E/M/H breakdown (QuestionList per-segment pattern) */}
            <box flexDirection="row">
              <text fg={colors.fg}>{`${dashboardStats.totalSolved} solved   `}</text>
              <text fg={difficultyColor("Easy")}>{`E ${dashboardStats.byDifficulty.Easy}`}</text>
              <text fg={colors.fgDim}>{" · "}</text>
              <text
                fg={difficultyColor("Medium")}
              >{`M ${dashboardStats.byDifficulty.Medium}`}</text>
              <text fg={colors.fgDim}>{" · "}</text>
              <text fg={difficultyColor("Hard")}>{`H ${dashboardStats.byDifficulty.Hard}`}</text>
            </box>

            {/* (3) Recent counts + consistency */}
            <text fg={colors.fg}>
              {`7d: ${dashboardStats.last7}   30d: ${dashboardStats.last30}   consistency: ${Math.round(dashboardStats.consistency * 100)}%`}
            </text>

            {/* TODO(03-03): heatmap grid (buildHeatmapGrid) and sparkline (buildWeeklyBuckets)
                will be rendered here, below the summary block, in the D-05 order. */}
          </box>
        )}
      </scrollbox>

      {/* Footer — flexShrink={0} is MANDATORY (Pitfall 5): same reason as header. */}
      <text fg={colors.fgDim} flexShrink={0}>
        {" j/k:Scroll  ^D/^U:Jump  p/Esc/q:Close "}
      </text>
    </box>
  );
}
