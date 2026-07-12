import { SyntaxStyle, extToFiletype } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";

import { useAppStore } from "@/ui/store";
import { colors } from "@/ui/theme";
import { getKeymap, pickerBindings } from "@/ui/keymap";
import { useListMouse } from "@/ui/useListMouse";
import { getExtension } from "@/api/types";
import { readSolutionFile } from "@/core/solutions";

const defaultSyntaxStyle = SyntaxStyle.create();

function filetypeFor(langSlug: string): string | undefined {
  return extToFiletype(getExtension(langSlug));
}

export function SolutionPickerModal() {
  useBindings(() => ({ bindings: pickerBindings }), []);

  const problem = useAppStore((s) => s.problem);

  // Click to focus a language, click the focused one again to confirm (≡ Enter — the
  // command opens the file in $EDITOR, creating it from the snippet first if needed),
  // wheel to move the cursor. A modal is always "focused": pure select/activate.
  const mouse = useListMouse({
    getSelectedIndex: () => useAppStore.getState().problem?.solutionPicker?.index ?? 0,
    select: (i) => useAppStore.getState().setPickerIndex(i),
    activate: () => getKeymap().runCommand("picker.confirm"),
    onWheel: (d) => useAppStore.getState().movePicker(d),
  });

  if (!problem?.solutionPicker) return null;

  const { snippets, existing, index } = problem.solutionPicker;
  const focused = snippets[index];

  const isExisting = focused ? existing.has(focused.langSlug) : false;
  const previewContent = focused
    ? isExisting
      ? (readSolutionFile(problem.question.id, problem.question.title_slug, focused.langSlug) ?? "")
      : focused.code
    : "";
  const previewFiletype = focused ? filetypeFor(focused.langSlug) : undefined;

  return (
    <box
      position="absolute"
      left="10%"
      top="8%"
      width="80%"
      height="84%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}>
        {" "}
        Solutions for {problem.question.id}. {problem.question.title}{" "}
      </text>

      <box flexDirection="row" flexGrow={1}>
        <box flexDirection="column" width="38%" borderStyle="single" borderColor={colors.border}>
          <scrollbox flexGrow={1}>
            {/* The rows wrapper sits INSIDE the scrollbox so its wheel handler runs
                first (descendant order) and stopPropagation suppresses the native
                content scroll — the wheel drives the language cursor like j/k. The
                right-hand preview scrollbox keeps its native wheel scroll. */}
            <box flexDirection="column" width="100%" {...mouse.containerProps}>
              {snippets.map((s, i) => {
                const isSelected = i === index;
                const hasSolution = existing.has(s.langSlug);
                const marker = hasSolution ? "●" : " ";
                const cursor = isSelected ? "►" : " ";
                const langCol = s.lang.padEnd(14, " ");
                return (
                  <text
                    key={s.langSlug}
                    fg={isSelected ? colors.fgAccent : hasSolution ? colors.fg : colors.fgDim}
                    bg={isSelected ? colors.bgHighlight : undefined}
                    {...mouse.rowProps(i)}
                  >
                    {" "}
                    {cursor} {marker} {langCol}
                  </text>
                );
              })}
            </box>
          </scrollbox>
        </box>

        <box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={colors.border}>
          <text fg={colors.fgDim}>
            {" "}
            {focused ? `${isExisting ? "" : "(new) "}${focused.lang}` : ""}{" "}
          </text>
          <scrollbox flexGrow={1}>
            <code
              content={previewContent}
              filetype={previewFiletype}
              syntaxStyle={defaultSyntaxStyle}
            />
          </scrollbox>
        </box>
      </box>

      <text fg={colors.fgDim}> j/k:Move Enter:Select o:Edit Esc/q:Cancel </text>
    </box>
  );
}
