import { useTerminalDimensions } from "@opentui/react";
import type { RelatedQuestion } from "../store";
import { colors } from "../theme";

interface RelatedPanelProps {
  related: RelatedQuestion[];
  focusedIndex: number;
  focused: boolean;
  // The number key that focuses this panel ([4]), shown as a tag in the title.
  tag: string;
  // Viewport cap (rows). The window follows focusedIndex so the cursor stays visible;
  // computed in ProblemView from available height so Related can't starve Result.
  maxRows: number;
}

// Focusable list of a problem's similar questions (Stage 12 item 4). j/k move the cursor
// (driven by relatedPanelBindings), Enter navigates-replace to the focused one. Premium
// (🔒) and not-locally-synced entries render dimmed and refuse Enter. Windows like
// QuestionList since a popular problem can have 10+ similar questions.
export function RelatedPanel({ related, focusedIndex, focused, tag, maxRows }: RelatedPanelProps) {
  const { width } = useTerminalDimensions();
  // Title budget for the ~40% right column: subtract the " ● " marker, the rounded
  // border, a trailing space, and ~2 cols reserved for the (double-width) lock glyph.
  // Truncate in JS — a too-long title would otherwise wrap and overlap the next row.
  const budget = Math.max(8, Math.floor(width * 0.4) - 11);

  // Mirror QuestionList/SolutionsPanel focus-aware highlight (fg is the real
  // differentiator since bgHighlight === surface in some themes).
  const selectedBg = focused ? colors.bgHighlight : colors.surface;
  const selectedFg = focused ? colors.fgAccent : colors.mutedAccent;

  // Window the list so the focused row stays visible (mirrors QuestionList).
  const visibleCount = Math.max(1, Math.min(maxRows, related.length));
  let scrollOffset = 0;
  if (focusedIndex >= scrollOffset + visibleCount) scrollOffset = focusedIndex - visibleCount + 1;
  if (focusedIndex < scrollOffset) scrollOffset = focusedIndex;
  const visible = related.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={focused ? colors.accent : colors.border}
      width="100%"
      // flexShrink:0 (like SolutionsPanel): the windowed content is a fixed row count, so
      // shrinking the box would overlap the rows. Result (flexGrow) absorbs the slack.
      flexShrink={0}
    >
      <box flexDirection="row">
        <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
        <text fg={colors.fgAccent}> Related ({related.length}) </text>
      </box>
      {related.length === 0 ? (
        <text fg={colors.fgDim}> No related questions </text>
      ) : (
        visible.map((q, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === focusedIndex;
          const navigable = !q.paidOnly && q.dbQuestion != null;
          const title = q.title.length > budget ? `${q.title.slice(0, budget - 1)}…` : q.title;
          const lock = q.paidOnly ? " 🔒" : "";
          const rowFg = isSelected ? selectedFg : navigable ? colors.fg : colors.fgDim;
          return (
            <box
              key={q.titleSlug}
              flexDirection="row"
              backgroundColor={isSelected ? selectedBg : undefined}
              width="100%"
              height={1}
            >
              <text fg={rowFg}>
                {" "}
                {isSelected ? "●" : " "} {title}
                {lock}{" "}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}
