import type { DbSubmission } from "../../db/submissions";
import type { AcRuntimeSummary } from "../verdict";
import { langAbbrev, parseRuntimeMs, verdictColor, verdictGlyph } from "../verdict";
import { formatRelative } from "../relativeTime";
import { colors } from "../theme";
import { useAppStore } from "../store";
import { problemPanelMouseEnabled, useListMouse } from "../useListMouse";
import { useScrollableList } from "../useScrollableList";

interface HistoryPanelProps {
  submissions: DbSubmission[];
  summary: AcRuntimeSummary | null;
  focusedIndex: number;
  focused: boolean;
  // The number key that focuses this panel ([5]), shown as a tag in the title.
  tag: string;
  // Viewport cap (rows), shared with RelatedPanel — computed in ProblemView.
  maxRows: number;
}

// D-01's compact runtime field: parseRuntimeMs-round to "45ms"; a null/unparseable
// runtime falls back gracefully rather than showing a raw space-padded string.
function compactRuntime(runtime: string | null): string {
  const ms = parseRuntimeMs(runtime);
  if (ms != null) return `${ms}ms`;
  if (!runtime) return "-";
  return runtime.replace(/\s+/g, "").toLowerCase();
}

// Compacts LeetCode's "16.4 MB" into "16mb" for the row's memory field.
function compactMemory(memory: string | null): string {
  if (!memory) return "-";
  const m = /^([\d.]+)\s*MB$/i.exec(memory.trim());
  if (m?.[1]) return `${Math.round(Number(m[1]))}mb`;
  return memory.replace(/\s+/g, "").toLowerCase();
}

// Focusable, navigate-only (D-10 — Enter reserved) list of every stored attempt for the
// currently-open problem (HIST-01/02/03), mirroring RelatedPanel's windowed-list shape.
export function HistoryPanel({
  submissions,
  summary,
  focusedIndex,
  focused,
  tag,
  maxRows,
}: HistoryPanelProps) {
  // Window the list so the focused row stays visible (mirrors RelatedPanel/QuestionList).
  const visibleCount = Math.max(1, Math.min(maxRows, submissions.length));
  const list = useScrollableList(focusedIndex, submissions.length, visibleCount);
  const scrollOffset = list.scrollOffset;
  const visible = submissions.slice(scrollOffset, scrollOffset + visibleCount);

  // Click to move the cursor (focusing the panel first if needed), wheel to scroll the
  // viewport (the cursor is dragged along only when it would leave the window).
  // Navigate-only (D-10 — Enter reserved), so there's no activate: a second click on
  // the focused row is deliberately a no-op.
  const mouse = useListMouse({
    enabled: problemPanelMouseEnabled,
    isFocused: () => useAppStore.getState().problem?.focusedPanel === "history",
    focus: () => useAppStore.getState().setProblemFocusedPanel("history"),
    getSelectedIndex: () => useAppStore.getState().problem?.focusedHistoryIndex ?? 0,
    select: (i) => useAppStore.getState().setFocusedHistoryIndex(i),
    onWheel: (d) => {
      const dragged = list.scrollBy(d);
      if (dragged !== null) useAppStore.getState().setFocusedHistoryIndex(dragged);
    },
  });

  const selectedBg = focused ? colors.bgHighlight : colors.surface;
  const selectedFg = focused ? colors.fgAccent : colors.mutedAccent;

  const arrow =
    summary?.direction === "improved" ? "↓" : summary?.direction === "regressed" ? "↑" : "=";
  const summaryColor =
    summary?.direction === "improved"
      ? colors.success
      : summary?.direction === "regressed"
        ? colors.error
        : colors.subtle;

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={focused ? colors.accent : colors.border}
      width="100%"
      // flexShrink:0 (like RelatedPanel): the windowed content is a fixed row count, so
      // shrinking the box would overlap the rows.
      flexShrink={0}
      {...mouse.containerProps}
    >
      <box flexDirection="row">
        <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
        <text fg={colors.fgAccent}> History ({submissions.length}) </text>
      </box>

      {/* D-05/D-06/D-07: best-vs-latest AC runtime summary, shown only when 2+ AC exist. */}
      {summary && (
        <text fg={summaryColor}>
          {" "}
          Best: {summary.bestMs}ms · Latest: {summary.latestMs}ms {arrow}{" "}
        </text>
      )}

      {submissions.length === 0 ? (
        // D-04: the panel always renders (border/title stay), even with zero attempts.
        <text fg={colors.fgDim}> No attempts yet </text>
      ) : (
        visible.map((row, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === focusedIndex;
          const textFg = isSelected ? selectedFg : colors.fg;
          const glyphFg = isSelected ? selectedFg : verdictColor(row.statusDisplay);
          return (
            <box
              key={row.submissionId}
              flexDirection="row"
              backgroundColor={isSelected ? selectedBg : undefined}
              width="100%"
              height={1}
              {...mouse.rowProps(realIndex)}
            >
              <text fg={glyphFg}> {verdictGlyph(row.statusDisplay)} </text>
              <text fg={textFg}>{langAbbrev(row.lang)} </text>
              <text fg={textFg}>{compactRuntime(row.runtime)}</text>
              {row.runtimePercentile != null && (
                <text fg={colors.fgDim}> (top {Math.round(row.runtimePercentile)}%)</text>
              )}
              <text fg={textFg}> {compactMemory(row.memory)} </text>
              <text fg={colors.fgDim}>{formatRelative(row.submittedAt)} </text>
            </box>
          );
        })
      )}
    </box>
  );
}
