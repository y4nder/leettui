import { useTerminalDimensions } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore, PANEL_ORDER } from "@/ui/store";
import { TopicList } from "@/ui/components/TopicList";
import { QuestionList } from "@/ui/components/QuestionList";
import { StatusBar } from "@/ui/components/StatusBar";
import { QuestionPopup } from "@/ui/components/QuestionPopup";
import { SelectPopup } from "@/ui/components/SelectPopup";
import { ResultPopup } from "@/ui/components/ResultPopup";
import { HelpPopup } from "@/ui/components/HelpPopup";
import { DebugPopup } from "@/ui/components/DebugPopup";
import { ProgressBar } from "@/ui/components/ProgressBar";
import { UpdateBanner } from "@/ui/components/UpdateBanner";
import { CommandPalette } from "@/ui/components/CommandPalette";
import { ChangeLocationPrompt } from "@/ui/components/ChangeLocationPrompt";
import { SettingsEditor } from "@/ui/components/SettingsEditor";
import { GitInitPrompt } from "@/ui/components/GitInitPrompt";
import { GitRemotePrompt } from "@/ui/components/GitRemotePrompt";
import { GitSyncPrompt } from "@/ui/components/GitSyncPrompt";
import { ChangelogPopup } from "@/ui/components/ChangelogPopup";
import { RecentPopup } from "@/ui/components/RecentPopup";
import { ThemePickerPopup } from "@/ui/components/ThemePickerPopup";
import { BackfillNudge } from "@/ui/components/BackfillNudge";
import { EasterEgg } from "@/ui/components/EasterEgg";
import { isDebugEnabled, getEntries } from "@/debug";
import {
  browseGlobalBindings,
  topicPanelBindings,
  questionPanelBindings,
  searchBindings,
  panelBindings,
  helpBindings,
} from "@/ui/keymap";

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

export function BrowseView({ renderer }: BrowseViewProps) {
  const { height } = useTerminalDimensions();

  const topics = useAppStore((s) => s.topics);
  const selectedTopicIndex = useAppStore((s) => s.selectedTopicIndex);
  const filteredQuestions = useAppStore((s) => s.filteredQuestions);
  const selectedQuestionIndex = useAppStore((s) => s.selectedQuestionIndex);
  const currentTopic = useAppStore((s) => s.topics[s.selectedTopicIndex] ?? "all");

  const searchNeedle = useAppStore((s) => s.searchNeedle);
  const topicNeedle = useAppStore((s) => s.topicNeedle);
  const stats = useAppStore((s) => s.stats);
  const difficultyFilter = useAppStore((s) => s.difficultyFilter);
  const solutionFileIds = useAppStore((s) => s.solutionFileIds);
  const attemptCounts = useAppStore((s) => s.attemptCounts);

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
  const changelog = useAppStore((s) => s.changelog);
  const topicScrollNonce = useAppStore((s) => s.topicScrollNonce);
  const questionScrollNonce = useAppStore((s) => s.questionScrollNonce);

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
          smoothNonce={topicScrollNonce}
        />
        <QuestionList
          questions={filteredQuestions}
          selectedIndex={selectedQuestionIndex}
          height={mainHeight}
          topic={currentTopic}
          solutionFileIds={solutionFileIds}
          attemptCounts={attemptCounts}
          focused={focusedPanel === "questions"}
          tag={String(PANEL_ORDER.indexOf("questions") + 1)}
          smoothNonce={questionScrollNonce}
        />
      </box>

      <StatusBar
        mode={mode}
        focusedPanel={focusedPanel}
        searchNeedle={searchNeedle}
        topicNeedle={topicNeedle}
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

      {mode === "help" && (
        <HelpPopup
          scopes={[
            {
              header: `LOCAL KEYS — ${focusedPanel === "topics" ? "TOPICS" : "QUESTIONS"}`,
              bindings: panelBindings(focusedPanel),
            },
            { header: "GLOBAL KEYS", bindings: browseGlobalBindings },
          ]}
          closeBindings={helpBindings}
          debugEnabled={isDebugEnabled()}
        />
      )}

      {mode === "debug" && <DebugPopup entries={getEntries()} />}

      {mode === "palette" && <CommandPalette />}

      {mode === "relocate" && <ChangeLocationPrompt />}

      {mode === "config" && <SettingsEditor />}

      {mode === "gitInit" && <GitInitPrompt renderer={renderer} />}

      {mode === "gitRemote" && <GitRemotePrompt />}

      {mode === "gitSync" && <GitSyncPrompt />}

      {mode === "changelog" && changelog && (
        <ChangelogPopup releases={changelog.releases} highlightTag={changelog.highlightTag} />
      )}

      {mode === "recent" && <RecentPopup />}

      {mode === "themePicker" && <ThemePickerPopup />}

      {mode === "backfillNudge" && <BackfillNudge />}

      {mode === "easterEgg" && <EasterEgg />}
    </box>
  );
}
