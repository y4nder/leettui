import type { createCliRenderer } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors, difficultyColor } from "../theme";
import type { ThemeColor } from "../themes";
import { useAppStore } from "../store";
import { dashboardBindings, registerPopupScroller } from "../keymap";
import { hasAnySubmissions } from "../../db/submissions";
import { buildSparkline } from "../analytics";

// Full-screen progress dashboard (Phase 3 / DASH-01). Opened with `p` from browse
// or problem view; returns to the origin mode on Esc/q (dashboardReturnMode — D-11).
// Reads from dashboardSlice.dashboardStats (loaded synchronously before this mounts).
// An empty submission store shows a backfill CTA (D-13); otherwise renders:
//   summary block (streak → total+breakdown → 7d/30d/consistency, D-06 order)
//   heatmap (52-week × 7-day activity grid, D-05/DASH-05)
//   sparkline (12-week trend bar string, D-05/DASH-06)
// Layout order is locked (D-05): summary → heatmap → trend, top-to-bottom.

// Single consistent filled glyph for all heatmap cells (D-12: same glyph, intensity by color).
const HEATMAP_CELL = "■";

// Map intensity level (0–4) to a theme color token (D-12: no hardcoded hex).
// Level 0 = empty day (dim track); 1–4 = increasing brightness (accent/success family).
function heatmapLevelColor(level: 0 | 1 | 2 | 3 | 4): ThemeColor {
  switch (level) {
    case 0:
      return colors.subtle; // empty day — dim track
    case 1:
      return colors.mutedAccent; // 1 solve — low glow
    case 2:
      return colors.accent; // 2–3 solves
    case 3:
      return colors.success; // 4–6 solves
    case 4:
      return colors.fgAccent; // 7+ solves — max brightness
  }
}

// Map a daily first-solve count to an intensity level using fixed thresholds.
// Fixed thresholds (not relative quantiles) so meaning stays stable as the user
// solves more problems over time.
function heatmapLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

// Build the run-length-encoded <text> segments for one heatmap row (one dow).
// Consecutive cells with the same level are merged into a single <text> to keep
// the element count low (~5–15 segments per row typical; worst case 52).
// This is the QuestionList per-segment coloring pattern (QuestionList.tsx:110-119).
function buildHeatmapRow(weekCounts: number[]) {
  // biome-ignore lint/suspicious/noExplicitAny: OpenTUI JSX element array — no JSX type import needed
  const segments: any[] = [];
  let runLevel = -1;
  let runLength = 0;
  let segIndex = 0;

  const flush = (level: number) => {
    if (runLength === 0) return;
    segments.push(
      <text key={segIndex++} fg={heatmapLevelColor(level as 0 | 1 | 2 | 3 | 4)}>
        {HEATMAP_CELL.repeat(runLength)}
      </text>,
    );
  };

  for (const count of weekCounts) {
    const level = heatmapLevel(count);
    if (level === runLevel) {
      runLength++;
    } else {
      flush(runLevel);
      runLevel = level;
      runLength = 1;
    }
  }
  flush(runLevel);
  return segments;
}

export function DashboardView({
  renderer: _renderer,
}: {
  renderer: Awaited<ReturnType<typeof createCliRenderer>>;
}) {
  useBindings(() => ({ bindings: dashboardBindings }), []);

  const dashboardStats = useAppStore((s) => s.dashboardStats);
  // Subscribe to themeVersion so a live theme switch repaints (mirrors Browse/ProblemView).
  // The heatmapLevelColor helper reads from the colors Proxy (live reads), so the heatmap
  // color ramp repaints automatically when themeVersion bumps.
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

            {/* ----------------------------------------------------------------
                (4) Activity heatmap — DASH-05, D-05 order (below summary)
                52 weeks × 7 days. 7 rows (one per weekday, dow 0=Sun..6=Sat);
                each row is a flexDirection="row" box of run-length-encoded
                <text fg={...}> segments. Cell color ramps by first-solve count
                via fixed thresholds → heatmapLevel → heatmapLevelColor (theme
                tokens, no hardcoded hex — D-12). Same HEATMAP_CELL glyph for
                every cell; empty days are the level-0 dim track color, NOT a
                different character (D-12). No Date.now() / date math here —
                all computation lives in buildHeatmapGrid (pure analytics module).
                ---------------------------------------------------------------- */}
            <text fg={colors.fgDim} flexShrink={0}>
              {"Activity (52 wk)"}
            </text>
            <box flexDirection="column">
              {
                // Render 7 weekday rows (dow 0..6).
                // Access pattern: heatmapGrid[weekIndex][dow] (not transposed — Pitfall 3).
                // For each dow, collect cell counts across all 52 weekIndices (0..51).
                Array.from({ length: 7 }, (_, dow) => {
                  // Extract the 52 per-week counts for this day-of-week.
                  const weekCounts = dashboardStats.heatmapGrid.map((week) => week[dow] ?? 0);
                  return (
                    // biome-ignore lint/correctness/useJsxKeyInIterable: static 7-row list, never reordered
                    <box flexDirection="row">{buildHeatmapRow(weekCounts)}</box>
                  );
                })
              }
            </box>

            {/* ----------------------------------------------------------------
                (5) Trend sparkline — DASH-06, D-05 order (below heatmap)
                ~12-week problems-per-week trend as Unicode block glyphs.
                buildSparkline(sparklineWeeks) maps weekly counts to bar heights
                using window-max scaling (max week = "█"). Color: accent for the
                glyph run (a full per-bar ramp is out of scope per D-12 — that
                ramp is the heatmap's). No date math in the component.
                ---------------------------------------------------------------- */}
            <box flexDirection="row">
              <text fg={colors.fgDim}>{"Trend (12 wk) "}</text>
              <text fg={colors.accent}>{buildSparkline(dashboardStats.sparklineWeeks)}</text>
            </box>
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
