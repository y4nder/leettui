import type { DbQuestion } from "../../db/questions";
import { colors, difficultyColor, statusIcon, statusColor } from "../theme";

interface QuestionListProps {
  questions: DbQuestion[];
  selectedIndex: number;
  height: number;
  topic: string;
  solutionFileIds: Set<number>;
  focused: boolean;
  // The number key that focuses this panel ([1]/[2]), shown as a tag in the title.
  tag: string;
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
  focused,
  tag,
}: QuestionListProps) {
  const visibleCount = Math.max(1, height - 2);
  let scrollOffset = 0;
  if (selectedIndex >= scrollOffset + visibleCount) {
    scrollOffset = selectedIndex - visibleCount + 1;
  }
  if (selectedIndex < scrollOffset) {
    scrollOffset = selectedIndex;
  }

  const visible = questions.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={focused ? colors.accent : colors.border}
      flexGrow={1}
      height="100%"
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
          const acStr = formatAcRate(q.ac_rate).padStart(6, " ");
          const runtimeStr = (q.last_runtime ?? "").padStart(8, " ");

          return (
            <box
              key={q.id}
              flexDirection="row"
              backgroundColor={isSelected ? colors.bgHighlight : undefined}
              width="100%"
            >
              <text fg={sColor}> {icon} </text>
              <text fg={colors.accent}>{hasSolution ? "◆" : " "}</text>
              <text fg={colors.fgDim}> {idStr} </text>
              <text fg={isSelected ? colors.fgAccent : colors.fg} flexGrow={1}>
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
