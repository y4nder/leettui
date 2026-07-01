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
import { Loading } from "../../ui/components/Loading";
import { StatusBar } from "../../ui/components/StatusBar";
import { ProgressBar } from "../../ui/components/ProgressBar";
import { UpdateBanner } from "../../ui/components/UpdateBanner";
import { SolutionPickerModal } from "../../ui/components/SolutionPickerModal";
import { SolutionsPanel } from "../../ui/components/SolutionsPanel";
import { RelatedPanel } from "../../ui/components/RelatedPanel";
import { HistoryPanel } from "../../ui/components/HistoryPanel";
import { NotesPopup } from "../../ui/components/NotesPopup";
import { DeleteSolutionPrompt } from "../../ui/components/DeleteSolutionPrompt";
import { HelpPopup } from "../../ui/components/HelpPopup";
import {
  problemGlobalBindings,
  scrollPanelBindings,
  solutionsPanelBindings,
  relatedPanelBindings,
  historyPanelBindings,
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

function HistoryPanelBindings() {
  useBindings(() => ({ bindings: historyPanelBindings }), []);
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
  const problemSubmissions = useAppStore((s) => s.problemSubmissions);
  const submissionSummary = useAppStore((s) => s.submissionSummary);

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
      <box flexDirection="column" width="100%" height="100%" padding={1}>
        <Loading label="Loading problem..." />
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
    focusedHistoryIndex,
    focusedPanel,
    result,
    solutionPicker,
    notes,
    help,
    deleteConfirm,
  } = problem;
  const scrollFocused = focusedPanel === "description" || focusedPanel === "result";

  // Related and History share the bottom of the right column (D-08/D-09); cap both
  // viewports so neither starves the Result panel above, and split the remaining budget
  // roughly evenly between the two windowed panels rather than handing each the old
  // 3-panel total unchanged (which would double-count vertical space and overflow on
  // short terminals, since both boxes are flexShrink:0 — RESEARCH Pattern 2).
  const RESULT_FLOOR = 6;
  const solutionsRows = (solutions.length || 1) + 3;
  const RIGHT_COLUMN_CHROME = 8; // border+title overhead for the two windowed panels
  const sharedMaxRows = Math.max(
    2,
    Math.floor((mainHeight - solutionsRows - RESULT_FLOOR - RIGHT_COLUMN_CHROME) / 2),
  );

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Help and the delete-confirm prompt are true modals: while either is open it gates
          off the global + panel layers so the keys they'd shadow (e/R/s/t…, and especially
          the `d` that opened the prompt) can't fire behind them — only the modal's own layer
          is live (problemHelpBindings / deletePromptBindings). */}
      {!help && !deleteConfirm && <ProblemGlobalBindings />}
      {!help && !deleteConfirm && scrollFocused && <ScrollPanelBindings />}
      {!help && !deleteConfirm && focusedPanel === "solutions" && <SolutionsPanelBindings />}
      {!help && !deleteConfirm && focusedPanel === "related" && <RelatedPanelBindings />}
      {!help && !deleteConfirm && focusedPanel === "history" && <HistoryPanelBindings />}

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
              maxRows={sharedMaxRows}
            />

            <HistoryPanel
              submissions={problemSubmissions}
              summary={submissionSummary}
              focused={focusedPanel === "history"}
              focusedIndex={focusedHistoryIndex}
              tag="5"
              maxRows={sharedMaxRows}
            />
          </box>
        </box>
      </box>

      <StatusBar
        mode={mode}
        problemPanel={focusedPanel}
        searchNeedle={searchNeedle}
        stats={stats}
        difficultyFilter={difficultyFilter}
      />

      {solutionPicker && <SolutionPickerModal />}
      {notes && <NotesPopup content={notes.content} />}
      {deleteConfirm && <DeleteSolutionPrompt langSlug={deleteConfirm.langSlug} />}
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
