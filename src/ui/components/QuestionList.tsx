import type { DbQuestion } from "../../db/questions";
import { colors, difficultyColor, statusIcon, statusColor } from "../theme";
import { getKeymap } from "../keymap";
import { useAppStore } from "../store";
import { useScrollableList } from "../useScrollableList";
import { useGlide } from "../useGlide";
import { useListMouse } from "../useListMouse";

interface QuestionListProps {
  questions: DbQuestion[];
  selectedIndex: number;
  height: number;
  topic: string;
  solutionFileIds: Set<number>;
  attemptCounts: Map<number, number>;
  focused: boolean;
  // The number key that focuses this panel ([1]/[2]), shown as a tag in the title.
  tag: string;
  // Bumped by the half-page commands to glide the scroll; unchanged = snap.
  smoothNonce: number;
}

function formatAcRate(acRate: number | null): string {
  if (acRate == null) return "";
  return `${acRate.toFixed(1)}%`;
}

export function QuestionList({
  questions,
  selectedIndex,
  height,
  topic,
  solutionFileIds,
  attemptCounts,
  focused,
  tag,
  smoothNonce,
}: QuestionListProps) {
  const visibleCount = Math.max(1, height - 2);
  const list = useScrollableList(selectedIndex, questions.length, visibleCount);
  const scrollOffset = useGlide(list.scrollOffset, smoothNonce);

  const visible = questions.slice(scrollOffset, scrollOffset + visibleCount);

  // Click to select (focusing the panel first if needed), click the selected question
  // again to open it in the problem view (≡ Enter), wheel to scroll the viewport — the
  // highlight is dragged along only when it would leave the window, so j/k afterwards
  // continues from where you're looking.
  const mouse = useListMouse({
    enabled: () => useAppStore.getState().mode === "browse",
    isFocused: () => useAppStore.getState().focusedPanel === "questions",
    focus: () => useAppStore.getState().setFocusedPanel("questions"),
    getSelectedIndex: () => useAppStore.getState().selectedQuestionIndex,
    select: (i) => useAppStore.getState().setQuestionIndex(i),
    activate: () => getKeymap().runCommand("problem.enter"),
    onWheel: (d) => {
      const dragged = list.scrollBy(d);
      if (dragged !== null) useAppStore.getState().setQuestionIndex(dragged);
    },
  });

  // When the panel isn't focused, the selected row gets a muted version of the
  // highlight (dimmer bg + dimmer accent) so the active panel's selection stands out.
  const selectedBg = focused ? colors.bgHighlight : colors.surface;
  const selectedFg = focused ? colors.fgAccent : colors.mutedAccent;

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={focused ? colors.accent : colors.border}
      flexGrow={1}
      height="100%"
      {...mouse.containerProps}
    >
      <box flexDirection="row">
        <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
        <text fg={colors.fgAccent}>
          {" "}
          Questions [{topic}] ({questions.length}){" "}
        </text>
      </box>
      {visible.length === 0 ? (
        <text fg={colors.fgDim}> No questions found</text>
      ) : (
        visible.map((q, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === selectedIndex;
          const icon = statusIcon(q.status);
          const idStr = String(q.id).padStart(4, " ");
          const diffColor = difficultyColor(q.difficulty);
          const sColor = statusColor(q.status);
          const paidStr = q.paid_only ? " 🔒" : "";
          const hasSolution = solutionFileIds.has(q.id);
          const attemptCount = attemptCounts.get(q.id) ?? 0;
          const acStr = formatAcRate(q.ac_rate).padStart(6, " ");
          const runtimeStr = (q.last_runtime ?? "").padStart(8, " ");
          const markerStr = (
            attemptCount > 0 ? `×${attemptCount}` : hasSolution ? "◆" : " "
          ).padStart(3, " ");

          return (
            <box
              key={q.id}
              flexDirection="row"
              backgroundColor={isSelected ? selectedBg : undefined}
              width="100%"
              {...mouse.rowProps(realIndex)}
            >
              <text fg={sColor}> {icon} </text>
              <text fg={colors.accent}>{markerStr}</text>
              <text fg={colors.fgDim}> {idStr} </text>
              <text fg={isSelected ? selectedFg : colors.fg} flexGrow={1}>
                {q.title}
                {paidStr}
              </text>
              <text fg={colors.fgDim}> {acStr} </text>
              <text fg={diffColor}> {q.difficulty.padEnd(6)} </text>
              <text fg={colors.success}>{runtimeStr} </text>
            </box>
          );
        })
      )}
    </box>
  );
}
