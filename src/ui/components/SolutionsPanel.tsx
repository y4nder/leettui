import { colors } from "../theme";
import type { ProblemLangPicker } from "../store/slices/uiSlice";

interface SolutionsPanelProps {
  solutions: string[];
  focusedIndex: number;
  langPicker: ProblemLangPicker | null;
}

export function SolutionsPanel({ solutions, focusedIndex, langPicker }: SolutionsPanelProps) {
  const isPicking = langPicker !== null;
  const title = isPicking ? "Select Language" : "Solutions";

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={isPicking ? colors.borderFocused : colors.border}
      flexGrow={1}
      width="100%"
    >
      <text fg={colors.fgAccent}> {title} </text>

      {isPicking ? (
        <scrollbox flexGrow={1}>
          {langPicker!.snippets.map((s, i) => {
            const isSelected = i === langPicker!.index;
            return (
              <text
                key={s.langSlug}
                fg={isSelected ? colors.fgAccent : colors.fg}
                bg={isSelected ? colors.bgHighlight : undefined}
              >
                {isSelected ? " ► " : "   "}
                {s.lang}
              </text>
            );
          })}
        </scrollbox>
      ) : solutions.length === 0 ? (
        <text fg={colors.fgDim}> Press e to create a solution file</text>
      ) : (
        <scrollbox flexGrow={1}>
          {solutions.map((filename, i) => {
            const isSelected = i === focusedIndex;
            return (
              <text
                key={filename}
                fg={isSelected ? colors.fgAccent : colors.fg}
                bg={isSelected ? colors.bgHighlight : undefined}
              >
                {isSelected ? " ► " : "   "}
                {filename}
              </text>
            );
          })}
        </scrollbox>
      )}
    </box>
  );
}
