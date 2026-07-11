import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import { colors, difficultyColor, statusColor, statusIcon } from "../theme";
import { useAppStore } from "../store";
import { handleEnterProblemView } from "../../views/problem/handlers";
import { formatRelative } from "../relativeTime";
import { useScrollableList } from "../useScrollableList";
import { useListMouse } from "../useListMouse";

// "Recently viewed" history modal (Stage 20), opened with `h` from browse. A
// recency-sorted list of the questions you've opened (detail popup or ProblemView),
// rendered QuestionList-style. j/k navigate, Enter jumps to the question (which
// re-records it → bumps to top), Esc/h close. Mounted only while mode === "recent",
// so its bindings layer registers/unregisters with it — cloned from SelectPopup,
// with QuestionList's windowing so the selection stays visible past ~50 rows.
export function RecentPopup() {
  const recents = useAppStore((s) => s.recents);
  const solutionFileIds = useAppStore((s) => s.solutionFileIds);
  const hideRecent = useAppStore((s) => s.hideRecent);
  const { height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const open = (index: number) => {
    const q = recents[index];
    hideRecent();
    if (q) void handleEnterProblemView(q, "h");
  };

  useBindings(
    () => ({
      bindings: [
        { key: "j", cmd: () => setSelectedIndex((i) => Math.min(i + 1, recents.length - 1)) },
        { key: "down", cmd: () => setSelectedIndex((i) => Math.min(i + 1, recents.length - 1)) },
        { key: "k", cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "up", cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "return", cmd: () => open(selectedIndex) },
        { key: "escape", cmd: () => hideRecent() },
        { key: "h", cmd: () => hideRecent() },
      ],
    }),
    [recents, selectedIndex, hideRecent],
  );

  // Window the list like QuestionList so the selection never scrolls out of view.
  // Popup is 60% tall; reserve border (2) + title (1) + footer (1).
  const visibleCount = Math.max(1, Math.floor(height * 0.6) - 4);
  const list = useScrollableList(selectedIndex, recents.length, visibleCount);
  const scrollOffset = list.scrollOffset;
  const visible = recents.slice(scrollOffset, scrollOffset + visibleCount);

  // Click to select, click the selected row again to open (≡ Enter), wheel to scroll
  // the viewport (the highlight is dragged along only when it would leave the window).
  // A modal is always "focused", so it gets pure select/activate semantics.
  const mouse = useListMouse({
    getSelectedIndex: () => selectedIndex,
    select: setSelectedIndex,
    activate: open,
    onWheel: (d) => {
      const dragged = list.scrollBy(d);
      if (dragged !== null) setSelectedIndex(dragged);
    },
  });

  return (
    <box
      position="absolute"
      left="20%"
      top="20%"
      width="60%"
      height="60%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
      {...mouse.containerProps}
    >
      <text fg={colors.fgAccent} attributes={TextAttributes.BOLD}>
        {` Recently viewed (${recents.length}) `}
      </text>
      {recents.length === 0 ? (
        <box flexGrow={1} paddingLeft={1}>
          <text fg={colors.fgDim}>No recently viewed questions yet.</text>
        </box>
      ) : (
        // A plain column, not a scrollbox: the list is already windowed
        // (useScrollableList slices to visibleCount), so the content never overflows —
        // and the wheel drives our viewport, not a scrollbox's. Container props sit on
        // the popup box so the wheel works anywhere over the modal.
        <box flexDirection="column" flexGrow={1}>
          {visible.map((q, i) => {
            const realIndex = scrollOffset + i;
            const isSelected = realIndex === selectedIndex;
            return (
              <box
                key={q.id}
                flexDirection="row"
                backgroundColor={isSelected ? colors.bgHighlight : undefined}
                width="100%"
                {...mouse.rowProps(realIndex)}
              >
                <text fg={isSelected ? colors.fgAccent : colors.fg}>
                  {isSelected ? " ► " : "   "}
                </text>
                <text fg={statusColor(q.status)}>{statusIcon(q.status)} </text>
                <text fg={colors.accent}>{solutionFileIds.has(q.id) ? "◆ " : "  "}</text>
                <text fg={colors.fgDim}>{String(q.id).padStart(4, " ")} </text>
                <text fg={isSelected ? colors.fgAccent : colors.fg} flexGrow={1}>
                  {q.title}
                  {q.paid_only ? " 🔒" : ""}
                </text>
                <text fg={difficultyColor(q.difficulty)}> {q.difficulty.padEnd(6)} </text>
                <text fg={colors.fgDim}>{formatRelative(q.viewedAt).padStart(9)} </text>
              </box>
            );
          })}
        </box>
      )}
      <text fg={colors.fgDim}> j/k:Navigate Enter:Open Esc/h:Close </text>
    </box>
  );
}
