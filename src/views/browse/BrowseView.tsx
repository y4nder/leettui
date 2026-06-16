import { useTerminalDimensions } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore, PANEL_ORDER } from "../../ui/store";
import { TopicList } from "../../ui/components/TopicList";
import { QuestionList } from "../../ui/components/QuestionList";
import { StatusBar } from "../../ui/components/StatusBar";
import { QuestionPopup } from "../../ui/components/QuestionPopup";
import { SelectPopup } from "../../ui/components/SelectPopup";
import { ResultPopup } from "../../ui/components/ResultPopup";
import { HelpPopup } from "../../ui/components/HelpPopup";
import { DebugPopup } from "../../ui/components/DebugPopup";
import { ProgressBar } from "../../ui/components/ProgressBar";
import { UpdateBanner } from "../../ui/components/UpdateBanner";
import { CommandPalette } from "../../ui/components/CommandPalette";
import { ChangeLocationPrompt } from "../../ui/components/ChangeLocationPrompt";
import { EasterEgg } from "../../ui/components/EasterEgg";
import { isDebugEnabled, getEntries } from "../../debug";
import {
  browseGlobalBindings,
  topicPanelBindings,
  questionPanelBindings,
  searchBindings,
} from "../../ui/keymap";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

interface BrowseViewProps {
  renderer: Renderer;
}

function BrowseGlobalBindings() {
  useBindings(() => ({ bindings: browseGlobalBindings }), []);
  return null;
}

function TopicPanelBindings() {
  useBindings(() => ({ bindings: topicPanelBindings }), []);
  return null;
}

function QuestionPanelBindings() {
  useBindings(() => ({ bindings: questionPanelBindings }), []);
  return null;
}

function SearchBindings() {
  useBindings(() => ({ bindings: searchBindings }), []);
  return null;
}

export function BrowseView({ renderer: _renderer }: BrowseViewProps) {
  const { height } = useTerminalDimensions();

  const topics = useAppStore((s) => s.topics);
  const selectedTopicIndex = useAppStore((s) => s.selectedTopicIndex);
  const filteredQuestions = useAppStore((s) => s.filteredQuestions);
  const selectedQuestionIndex = useAppStore((s) => s.selectedQuestionIndex);
  const currentTopic = useAppStore((s) => s.topics[s.selectedTopicIndex] ?? "all");

  const searchNeedle = useAppStore((s) => s.searchNeedle);
  const stats = useAppStore((s) => s.stats);
  const difficultyFilter = useAppStore((s) => s.difficultyFilter);
  const solutionFileIds = useAppStore((s) => s.solutionFileIds);

  const mode = useAppStore((s) => s.mode);
  const focusedPanel = useAppStore((s) => s.focusedPanel);
  useAppStore((s) => s.themeVersion);
  const popupTitle = useAppStore((s) => s.popupTitle);
  const popupContent = useAppStore((s) => s.popupContent);
  const selectTitle = useAppStore((s) => s.selectTitle);
  const selectItems = useAppStore((s) => s.selectItems);
  const selectResolve = useAppStore((s) => s.selectResolve);
  const resultView = useAppStore((s) => s.resultView);
  const syncProgress = useAppStore((s) => s.syncProgress);
  const updateAvailable = useAppStore((s) => s.updateAvailable);

  const mainHeight = height - (syncProgress ? 2 : 1) - (updateAvailable ? 1 : 0);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {mode === "browse" && <BrowseGlobalBindings />}
      {mode === "browse" && focusedPanel === "topics" && <TopicPanelBindings />}
      {mode === "browse" && focusedPanel === "questions" && <QuestionPanelBindings />}
      {mode === "search" && <SearchBindings />}

      <UpdateBanner />

      {syncProgress && <ProgressBar current={syncProgress.current} total={syncProgress.total} />}

      <box flexDirection="row" flexGrow={1} height={mainHeight}>
        <TopicList
          topics={topics}
          selectedIndex={selectedTopicIndex}
          height={mainHeight}
          focused={focusedPanel === "topics"}
          tag={String(PANEL_ORDER.indexOf("topics") + 1)}
        />
        <QuestionList
          questions={filteredQuestions}
          selectedIndex={selectedQuestionIndex}
          height={mainHeight}
          topic={currentTopic}
          solutionFileIds={solutionFileIds}
          focused={focusedPanel === "questions"}
          tag={String(PANEL_ORDER.indexOf("questions") + 1)}
        />
      </box>

      <StatusBar
        mode={mode}
        focusedPanel={focusedPanel}
        searchNeedle={searchNeedle}
        stats={stats}
        difficultyFilter={difficultyFilter}
        debugEnabled={isDebugEnabled()}
      />

      {mode === "popup" && <QuestionPopup title={popupTitle} content={popupContent} />}

      {mode === "select" && (
        <SelectPopup
          title={selectTitle}
          items={selectItems}
          onSelect={(index) => selectResolve?.(index)}
        />
      )}

      {mode === "result" && resultView && <ResultPopup view={resultView} />}

      {mode === "help" && <HelpPopup debugEnabled={isDebugEnabled()} />}

      {mode === "debug" && <DebugPopup entries={getEntries()} />}

      {mode === "palette" && <CommandPalette />}

      {mode === "relocate" && <ChangeLocationPrompt />}

      {mode === "easterEgg" && <EasterEgg />}
    </box>
  );
}
