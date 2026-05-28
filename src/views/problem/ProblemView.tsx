import { SyntaxStyle } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { useTerminalDimensions } from "@opentui/react";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import { colors, difficultyColor } from "../../ui/theme";
import { SolutionsPanel } from "../../ui/components/SolutionsPanel";
import { ResultBody } from "../../ui/components/ResultBody";
import { StatusBar } from "../../ui/components/StatusBar";
import { ProgressBar } from "../../ui/components/ProgressBar";
import { problemBindings } from "../../ui/keymap";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

interface ProblemViewProps {
  renderer: Renderer;
}

const defaultSyntaxStyle = SyntaxStyle.create();

function ProblemBindings() {
  useBindings(() => ({ bindings: problemBindings }), []);
  return null;
}

function Header({ id, title, difficulty }: { id: number; title: string; difficulty: string }) {
  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      backgroundColor={colors.statusBar}
    >
      <text fg={colors.fgAccent}> {id}. {title} </text>
      <text fg={difficultyColor(difficulty)}>[{difficulty}]</text>
    </box>
  );
}

function HintsFooter({ langPicker }: { langPicker: boolean }) {
  return (
    <box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.border}
      width="100%"
    >
      {langPicker ? (
        <text fg={colors.fgDim}> j/k:Lang Enter:Open Esc:Cancel </text>
      ) : (
        <>
          <text fg={colors.fgDim}> j/k:Focus  e:Edit  R:Run  s:Submit </text>
          <text fg={colors.fgDim}> Esc/q:Back </text>
        </>
      )}
    </box>
  );
}

export function ProblemView({ renderer: _renderer }: ProblemViewProps) {
  const { height } = useTerminalDimensions();
  const stats = useAppStore((s) => s.stats);
  const mode = useAppStore((s) => s.mode);
  const searchNeedle = useAppStore((s) => s.searchNeedle);
  const syncProgress = useAppStore((s) => s.syncProgress);
  const problem = useAppStore((s) => s.problem);

  const mainHeight = height - (syncProgress ? 2 : 1);

  if (!problem) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <text fg={colors.fgDim}> Loading problem... </text>
      </box>
    );
  }

  const { question, description, solutions, focusedSolutionIndex, result, langPicker } = problem;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <ProblemBindings />

      {syncProgress && (
        <ProgressBar current={syncProgress.current} total={syncProgress.total} />
      )}

      <box flexDirection="column" flexGrow={1} height={mainHeight}>
        <Header id={question.id} title={question.title} difficulty={question.difficulty} />

        <box flexDirection="row" flexGrow={1}>
          <box
            flexDirection="column"
            width="60%"
            borderStyle="rounded"
            borderColor={colors.border}
          >
            <text fg={colors.fgAccent}> Description </text>
            <scrollbox flexGrow={1}>
              <markdown content={description} syntaxStyle={defaultSyntaxStyle} />
            </scrollbox>
          </box>

          <box flexDirection="column" width="40%">
            <SolutionsPanel
              solutions={solutions}
              focusedIndex={focusedSolutionIndex}
              langPicker={langPicker}
            />

            <box
              flexDirection="column"
              borderStyle="rounded"
              borderColor={colors.border}
              flexGrow={1}
              width="100%"
            >
              <text fg={colors.fgAccent}> Result </text>
              <scrollbox flexGrow={1}>
                {result ? (
                  <ResultBody view={result} />
                ) : (
                  <text fg={colors.fgDim}> No run/submit yet </text>
                )}
              </scrollbox>
            </box>

            <HintsFooter langPicker={langPicker !== null} />
          </box>
        </box>
      </box>

      <StatusBar mode={mode} searchNeedle={searchNeedle} stats={stats} />
    </box>
  );
}
