import { colors } from "../theme";
import { getKeymap } from "../keymap";
import { useAppStore } from "../store";
import { problemPanelMouseEnabled, useListMouse } from "../useListMouse";

interface SolutionsPanelProps {
  // langSlugs of solutions that exist on disk; the active one (focusedIndex) is what
  // e/R/s/t target.
  solutions: string[];
  focusedIndex: number;
  focused: boolean;
  // The number key that focuses this panel ([2]), shown as a tag in the title.
  tag: string;
}

// Focusable list of the problem's existing solutions (Stage 12 item 3). j/k cycle the
// active solution while focused (driven by solutionsPanelBindings); the `f` picker still
// owns creating a new language. Auto-heights to its few rows so the Result panel below
// (flexGrow) absorbs the rest of the column.
export function SolutionsPanel({ solutions, focusedIndex, focused, tag }: SolutionsPanelProps) {
  // Click to make a solution active (focusing the panel first if needed), click the
  // active one again to open it in $EDITOR (≡ Enter/e), wheel to cycle like j/k —
  // this list renders all its few rows, so there's no viewport to scroll.
  const mouse = useListMouse({
    enabled: problemPanelMouseEnabled,
    isFocused: () => useAppStore.getState().problem?.focusedPanel === "solutions",
    focus: () => useAppStore.getState().setProblemFocusedPanel("solutions"),
    getSelectedIndex: () => useAppStore.getState().problem?.focusedSolutionIndex ?? 0,
    select: (i) => useAppStore.getState().setFocusedSolutionIndex(i),
    activate: () => getKeymap().runCommand("problem.editorOpen"),
    onWheel: (d) => useAppStore.getState().moveFocusedSolution(d),
  });

  // Mirror QuestionList's focus-aware highlight: the fg is the real differentiator since
  // bgHighlight === surface in some themes, so a bg-only change would be invisible there.
  const selectedBg = focused ? colors.bgHighlight : colors.surface;
  const selectedFg = focused ? colors.fgAccent : colors.mutedAccent;

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={focused ? colors.accent : colors.border}
      width="100%"
      // flexShrink:0 so the flex column never squeezes this panel — without it, a
      // short column (the flexGrow Result sibling claiming space) collapses the rows
      // onto each other. The Result scrollbox absorbs the squeeze instead.
      flexShrink={0}
      {...mouse.containerProps}
    >
      <box flexDirection="row">
        <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
        <text fg={colors.fgAccent}> Solutions ({solutions.length}) </text>
      </box>
      {solutions.length === 0 ? (
        <text fg={colors.fgDim}> No solution — press f </text>
      ) : (
        solutions.map((lang, i) => {
          const isSelected = i === focusedIndex;
          return (
            <box
              key={lang}
              flexDirection="row"
              backgroundColor={isSelected ? selectedBg : undefined}
              width="100%"
              {...mouse.rowProps(i)}
            >
              <text fg={isSelected ? selectedFg : colors.fg}>
                {" "}
                {isSelected ? "●" : " "} {lang}{" "}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}
