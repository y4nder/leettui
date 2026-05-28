import { SyntaxStyle, extToFiletype } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { readFileSync } from "fs";

import { useAppStore } from "../store";
import { colors } from "../theme";
import { pickerBindings } from "../keymap";
import { getExtension } from "../../api/types";
import { getSolutionPath } from "../../core/solutions";

const defaultSyntaxStyle = SyntaxStyle.create();

function filetypeFor(langSlug: string): string | undefined {
  return extToFiletype(getExtension(langSlug));
}

function safeReadFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

export function SolutionPickerModal() {
  useBindings(() => ({ bindings: pickerBindings }), []);

  const problem = useAppStore((s) => s.problem);
  if (!problem || !problem.solutionPicker) return null;

  const { snippets, existingByLangSlug, index } = problem.solutionPicker;
  const focused = snippets[index];

  const isExisting = focused ? Boolean(existingByLangSlug[focused.langSlug]) : false;
  const previewContent = focused
    ? isExisting
      ? safeReadFile(
          getSolutionPath(problem.question.id, problem.question.title_slug, focused.langSlug)
        )
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
        {" "}Solutions for {problem.question.id}. {problem.question.title}{" "}
      </text>

      <box flexDirection="row" flexGrow={1}>
        <box
          flexDirection="column"
          width="38%"
          borderStyle="single"
          borderColor={colors.border}
        >
          <scrollbox flexGrow={1}>
            {snippets.map((s, i) => {
              const isSelected = i === index;
              const existingFile = existingByLangSlug[s.langSlug];
              const marker = existingFile ? "●" : " ";
              const cursor = isSelected ? "►" : " ";
              const langCol = s.lang.padEnd(14, " ");
              const suffix = existingFile ? `  ${existingFile}` : "";
              return (
                <text
                  key={s.langSlug}
                  fg={isSelected ? colors.fgAccent : existingFile ? colors.fg : colors.fgDim}
                  bg={isSelected ? colors.bgHighlight : undefined}
                >
                  {" "}{cursor} {marker} {langCol}{suffix}
                </text>
              );
            })}
          </scrollbox>
        </box>

        <box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={colors.border}>
          <text fg={colors.fgDim}>
            {" "}{focused ? `${isExisting ? "" : "(new) "}${focused.lang}` : ""}{" "}
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

      <text fg={colors.fgDim}> j/k:Move  Enter:Select  o:Edit  Esc/q:Cancel </text>
    </box>
  );
}
