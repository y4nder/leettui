import { useMemo } from "react";
import { useBindings } from "@opentui/keymap/react";
import { useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import { colors, difficultyColor } from "../../ui/theme";
import { buildMarkdownSyntaxStyle } from "../../ui/markdownStyle";
import { ResultBody } from "../../ui/components/ResultBody";
import { StatusBar } from "../../ui/components/StatusBar";
import { ProgressBar } from "../../ui/components/ProgressBar";
import { UpdateBanner } from "../../ui/components/UpdateBanner";
import { SolutionPickerModal } from "../../ui/components/SolutionPickerModal";
import { NotesPopup } from "../../ui/components/NotesPopup";
import { problemBindings } from "../../ui/keymap";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

interface ProblemViewProps {
  renderer: Renderer;
}

function ProblemBindings() {
  useBindings(() => ({ bindings: problemBindings }), []);
  return null;
}

function Header({ id, title, difficulty }: { id: number; title: string; difficulty: string }) {
  return (
    <box flexDirection="row" width="100%" height={1} backgroundColor={colors.statusBar}>
      <text fg={colors.fgAccent}>
        {" "}
        {id}. {title}{" "}
      </text>
      <text fg={difficultyColor(difficulty)}>[{difficulty}]</text>
    </box>
  );
}

function ActiveSolutionStrip({ langSlug }: { langSlug: string | null }) {
  return (
    <box flexDirection="row" width="100%" height={1} backgroundColor={colors.statusBar}>
      {langSlug ? (
        <text fg={colors.fgAccent}> ● {langSlug} </text>
      ) : (
        <text fg={colors.fgDim}> No solution selected — press f </text>
      )}
    </box>
  );
}

function HintsFooter() {
  return (
    <box flexDirection="column" borderStyle="single" borderColor={colors.border} width="100%">
      <text fg={colors.fgDim}> f:Solutions e:Edit R:Run t:Test s:Submit n:Notes Esc/q:Back </text>
    </box>
  );
}

export function ProblemView({ renderer: _renderer }: ProblemViewProps) {
  const { height } = useTerminalDimensions();
  const themeVersion = useAppStore((s) => s.themeVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion is the deliberate cache-bust key; the callback reads the live `colors` proxy
  const syntaxStyle = useMemo(() => buildMarkdownSyntaxStyle(), [themeVersion]);
  const stats = useAppStore((s) => s.stats);
  const mode = useAppStore((s) => s.mode);
  const searchNeedle = useAppStore((s) => s.searchNeedle);
  const difficultyFilter = useAppStore((s) => s.difficultyFilter);
  const syncProgress = useAppStore((s) => s.syncProgress);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const problem = useAppStore((s) => s.problem);

  const mainHeight = height - (syncProgress ? 2 : 1) - (updateAvailable ? 1 : 0);

  if (!problem) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <text fg={colors.fgDim}> Loading problem... </text>
      </box>
    );
  }

  const { question, description, solutions, focusedSolutionIndex, result, solutionPicker, notes } =
    problem;
  const focusedLangSlug = solutions[focusedSolutionIndex] ?? null;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <ProblemBindings />

      <UpdateBanner />

      {syncProgress && <ProgressBar current={syncProgress.current} total={syncProgress.total} />}

      <box flexDirection="column" flexGrow={1} height={mainHeight}>
        <Header id={question.id} title={question.title} difficulty={question.difficulty} />

        <box flexDirection="row" flexGrow={1}>
          <box flexDirection="column" width="60%" borderStyle="rounded" borderColor={colors.border}>
            <text fg={colors.fgAccent} attributes={TextAttributes.BOLD}>
              {" "}
              Description{" "}
            </text>
            <scrollbox flexGrow={1} paddingLeft={1} paddingRight={1}>
              <markdown content={description} syntaxStyle={syntaxStyle} />
            </scrollbox>
          </box>

          <box flexDirection="column" width="40%">
            <ActiveSolutionStrip langSlug={focusedLangSlug} />

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

            <HintsFooter />
          </box>
        </box>
      </box>

      <StatusBar
        mode={mode}
        searchNeedle={searchNeedle}
        stats={stats}
        difficultyFilter={difficultyFilter}
      />

      {solutionPicker && <SolutionPickerModal />}
      {notes && <NotesPopup content={notes.content} />}
    </box>
  );
}
