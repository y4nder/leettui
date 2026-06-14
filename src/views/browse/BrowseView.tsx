import { useTerminalDimensions } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../../ui/store";
import { TopicList } from "../../ui/components/TopicList";
import { QuestionList } from "../../ui/components/QuestionList";
import { StatusBar } from "../../ui/components/StatusBar";
import { QuestionPopup } from "../../ui/components/QuestionPopup";
import { SelectPopup } from "../../ui/components/SelectPopup";
import { ResultPopup } from "../../ui/components/ResultPopup";
import { HelpPopup } from "../../ui/components/HelpPopup";
import { DebugPopup } from "../../ui/components/DebugPopup";
import { ProgressBar } from "../../ui/components/ProgressBar";
import { CommandPalette } from "../../ui/components/CommandPalette";
import { EasterEgg } from "../../ui/components/EasterEgg";
import { isDebugEnabled, getEntries } from "../../debug";
import { browseBindings, searchBindings } from "../../ui/keymap";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

interface BrowseViewProps {
  renderer: Renderer;
}

function BrowseBindings() {
  useBindings(() => ({ bindings: browseBindings }), []);
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
  useAppStore((s) => s.themeVersion);
  const popupTitle = useAppStore((s) => s.popupTitle);
  const popupContent = useAppStore((s) => s.popupContent);
  const selectTitle = useAppStore((s) => s.selectTitle);
  const selectItems = useAppStore((s) => s.selectItems);
  const selectResolve = useAppStore((s) => s.selectResolve);
  const resultView = useAppStore((s) => s.resultView);
  const syncProgress = useAppStore((s) => s.syncProgress);

  const mainHeight = height - (syncProgress ? 2 : 1);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {mode === "browse" && <BrowseBindings />}
      {mode === "search" && <SearchBindings />}

      {syncProgress && (
        <ProgressBar current={syncProgress.current} total={syncProgress.total} />
      )}

      <box flexDirection="row" flexGrow={1} height={mainHeight}>
        <TopicList topics={topics} selectedIndex={selectedTopicIndex} height={mainHeight} />
        <QuestionList
          questions={filteredQuestions}
          selectedIndex={selectedQuestionIndex}
          height={mainHeight}
          topic={currentTopic}
          solutionFileIds={solutionFileIds}
        />
      </box>

      <StatusBar
        mode={mode}
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

      {mode === "easterEgg" && <EasterEgg />}
    </box>
  );
}
