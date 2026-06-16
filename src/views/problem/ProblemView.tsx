import { useCallback, useMemo } from "react";
import { useBindings } from "@opentui/keymap/react";
import { useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import type { createCliRenderer, ScrollBoxRenderable } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import type { DbQuestion } from "../../db/questions";
import { colors, difficultyColor, statusColor } from "../../ui/theme";
import { buildMarkdownSyntaxStyle } from "../../ui/markdownStyle";
import { ResultBody } from "../../ui/components/ResultBody";
import { StatusBar } from "../../ui/components/StatusBar";
import { ProgressBar } from "../../ui/components/ProgressBar";
import { UpdateBanner } from "../../ui/components/UpdateBanner";
import { SolutionPickerModal } from "../../ui/components/SolutionPickerModal";
import { SolutionsPanel } from "../../ui/components/SolutionsPanel";
import { RelatedPanel } from "../../ui/components/RelatedPanel";
import { NotesPopup } from "../../ui/components/NotesPopup";
import { HelpPopup } from "../../ui/components/HelpPopup";
import {
  problemGlobalBindings,
  scrollPanelBindings,
  solutionsPanelBindings,
  relatedPanelBindings,
  problemHelpBindings,
  problemPanelBindings,
  isProblemScopeEntryVisible,
  registerProblemScroller,
} from "../../ui/keymap";
import { isDebugEnabled } from "../../debug";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

interface ProblemViewProps {
  renderer: Renderer;
}

function ProblemGlobalBindings() {
  useBindings(() => ({ bindings: problemGlobalBindings }), []);
  return null;
}

function ScrollPanelBindings() {
  useBindings(() => ({ bindings: scrollPanelBindings }), []);
  return null;
}

function SolutionsPanelBindings() {
  useBindings(() => ({ bindings: solutionsPanelBindings }), []);
  return null;
}

function RelatedPanelBindings() {
  useBindings(() => ({ bindings: relatedPanelBindings }), []);
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

// Metadata line under the title: solve status, acceptance rate, and topic tags.
function MetaLine({ question, topicTags }: { question: DbQuestion; topicTags: string[] }) {
  const status = question.status;
  const acRate = question.ac_rate;
  const statusLabel =
    status === "ac" ? "✓ Solved" : status === "notac" ? "✗ Attempted" : "○ Unsolved";
  return (
    <box flexDirection="row" width="100%" height={1}>
      <text fg={statusColor(status)}> {statusLabel} </text>
      {acRate != null && <text fg={colors.subtle}> AC {acRate.toFixed(1)}% </text>}
      {topicTags.length > 0 && <text fg={colors.fgDim}> {topicTags.join(" · ")} </text>}
    </box>
  );
}

// Panel title row with a focus-hotkey [n] tag. Tag + border go accent when the panel is
// focused (mirrors browse's TopicList/QuestionList); the label stays accent-bold.
function PanelTitle({ tag, label, focused }: { tag: string; label: string; focused: boolean }) {
  return (
    <box flexDirection="row">
      <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
      <text fg={colors.fgAccent} attributes={TextAttributes.BOLD}>
        {" "}
        {label}{" "}
      </text>
    </box>
  );
}

function HintsFooter() {
  return (
    <box flexDirection="column" borderStyle="single" borderColor={colors.border} width="100%">
      <text fg={colors.fgDim}>
        {" "}
        Tab:Focus j/k:Nav f:Solutions e:Edit R:Run t:Test s:Submit n:Notes Esc/q:Back{" "}
      </text>
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

  // Stable callback refs (identity-fixed so React only fires them on mount/unmount,
  // not every render) register each scrollbox so the focus-aware scroll commands reach it.
  const registerDescription = useCallback(
    (box: ScrollBoxRenderable | null) => registerProblemScroller("description", box),
    [],
  );
  const registerResult = useCallback(
    (box: ScrollBoxRenderable | null) => registerProblemScroller("result", box),
    [],
  );

  const mainHeight = height - (syncProgress ? 2 : 1) - (updateAvailable ? 1 : 0);

  if (!problem) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <text fg={colors.fgDim}> Loading problem... </text>
      </box>
    );
  }

  const {
    question,
    description,
    topicTags,
    solutions,
    focusedSolutionIndex,
    related,
    focusedRelatedIndex,
    focusedPanel,
    result,
    solutionPicker,
    notes,
    help,
  } = problem;
  const scrollFocused = focusedPanel === "description" || focusedPanel === "result";

  // Related sits at the bottom of the right column; cap its viewport so a long similar-
  // questions list can't starve the Result panel above. Budget = right-column inner
  // height (mainHeight − Header − MetaLine) minus Solutions (~len+3), HintsFooter (3),
  // Related chrome (3), and a floor reserved for Result. On short terminals Result
  // (flexGrow) still gives space first; the max(2, …) keeps Related usable regardless.
  const RESULT_FLOOR = 6;
  const solutionsRows = (solutions.length || 1) + 3;
  const relatedMaxRows = Math.max(2, mainHeight - solutionsRows - RESULT_FLOOR - 8);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Help is a true modal: while open it gates off the global + panel layers so the
          keys it lists (e/R/s/t…) can't fire behind it — only problemHelpBindings is live. */}
      {!help && <ProblemGlobalBindings />}
      {!help && scrollFocused && <ScrollPanelBindings />}
      {!help && focusedPanel === "solutions" && <SolutionsPanelBindings />}
      {!help && focusedPanel === "related" && <RelatedPanelBindings />}

      <UpdateBanner />

      {syncProgress && <ProgressBar current={syncProgress.current} total={syncProgress.total} />}

      <box flexDirection="column" flexGrow={1} height={mainHeight}>
        <Header id={question.id} title={question.title} difficulty={question.difficulty} />
        <MetaLine question={question} topicTags={topicTags} />

        <box flexDirection="row" flexGrow={1}>
          <box
            flexDirection="column"
            width="60%"
            borderStyle="rounded"
            borderColor={focusedPanel === "description" ? colors.accent : colors.border}
          >
            <PanelTitle tag="1" label="Description" focused={focusedPanel === "description"} />
            <scrollbox ref={registerDescription} flexGrow={1} paddingLeft={1} paddingRight={1}>
              <markdown content={description} syntaxStyle={syntaxStyle} />
            </scrollbox>
          </box>

          <box flexDirection="column" width="40%">
            <SolutionsPanel
              solutions={solutions}
              focusedIndex={focusedSolutionIndex}
              focused={focusedPanel === "solutions"}
              tag="2"
            />

            <box
              flexDirection="column"
              borderStyle="rounded"
              borderColor={focusedPanel === "result" ? colors.accent : colors.border}
              flexGrow={1}
              width="100%"
            >
              <PanelTitle tag="3" label="Result" focused={focusedPanel === "result"} />
              <scrollbox ref={registerResult} flexGrow={1}>
                {result ? (
                  <ResultBody view={result} />
                ) : (
                  <text fg={colors.fgDim}> No run/submit yet </text>
                )}
              </scrollbox>
            </box>

            <RelatedPanel
              related={related}
              focusedIndex={focusedRelatedIndex}
              focused={focusedPanel === "related"}
              tag="4"
              maxRows={relatedMaxRows}
            />

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
      {help && (
        <HelpPopup
          scopes={[
            {
              header: `LOCAL KEYS — ${focusedPanel.toUpperCase()}`,
              bindings: problemPanelBindings(focusedPanel),
            },
            { header: "GLOBAL KEYS", bindings: problemGlobalBindings },
          ]}
          closeBindings={problemHelpBindings}
          visible={isProblemScopeEntryVisible}
          debugEnabled={isDebugEnabled()}
        />
      )}
    </box>
  );
}
