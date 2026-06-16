import { SyntaxStyle, extToFiletype } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";

import { useAppStore } from "../store";
import { colors } from "../theme";
import { pickerBindings } from "../keymap";
import { getExtension } from "../../api/types";
import { readSolutionFile } from "../../core/solutions";

const defaultSyntaxStyle = SyntaxStyle.create();

function filetypeFor(langSlug: string): string | undefined {
  return extToFiletype(getExtension(langSlug));
}

export function SolutionPickerModal() {
  useBindings(() => ({ bindings: pickerBindings }), []);

  const problem = useAppStore((s) => s.problem);
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
                >
                  {" "}
                  {cursor} {marker} {langCol}
                </text>
              );
            })}
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
