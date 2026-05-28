import { useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
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
import { isDebugEnabled, logKey, getEntries, dumpToString } from "../../debug";
import { resolveAction, ACTIONS, type ActionId } from "../../ui/keymap";

import {
  handleViewProblem,
  handleViewDailyChallenge,
  handleOpenEditor,
  handleRunSolution,
  handleSubmitSolution,
  handleSyncDb,
  handleRandomQuestion,
} from "./handlers";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

interface BrowseViewProps {
  renderer: Renderer;
}

export function BrowseView({ renderer }: BrowseViewProps) {
  const { height } = useTerminalDimensions();
  const scrollOffsetRef = useRef(0);

  // Selectors — kept narrow so re-renders stay tight.
  const topics = useAppStore((s) => s.topics);
  const selectedTopicIndex = useAppStore((s) => s.selectedTopicIndex);
  const filteredQuestions = useAppStore((s) => s.filteredQuestions);
  const selectedQuestionIndex = useAppStore((s) => s.selectedQuestionIndex);
  const currentTopic = useAppStore((s) => s.topics[s.selectedTopicIndex] ?? "all");

  const searchNeedle = useAppStore((s) => s.searchNeedle);
  const stats = useAppStore((s) => s.stats);

  const mode = useAppStore((s) => s.mode);
  const popupTitle = useAppStore((s) => s.popupTitle);
  const popupContent = useAppStore((s) => s.popupContent);
  const selectTitle = useAppStore((s) => s.selectTitle);
  const selectItems = useAppStore((s) => s.selectItems);
  const selectResolve = useAppStore((s) => s.selectResolve);
  const resultView = useAppStore((s) => s.resultView);
  const syncProgress = useAppStore((s) => s.syncProgress);

  function dispatchAction(action: ActionId, triggerKey: string) {
    const s = useAppStore.getState();
    logKey(triggerKey, "", s.mode, action);

    switch (action) {
      case "moveQuestionDown":   s.moveQuestion(1); return;
      case "moveQuestionUp":     s.moveQuestion(-1); return;
      case "moveTopicNext":      s.moveTopic(1); return;
      case "moveTopicPrev":      s.moveTopic(-1); return;
      case "viewProblem":        handleViewProblem(triggerKey); return;
      case "viewDailyChallenge": handleViewDailyChallenge(triggerKey); return;
      case "openEditor":         handleOpenEditor(triggerKey, renderer); return;
      case "runSolution":        handleRunSolution(triggerKey); return;
      case "submitSolution":     handleSubmitSolution(triggerKey); return;
      case "startSearch":        s.startSearch(); return;
      case "showHelp":           s.showHelp(); return;
      case "showDebug":          if (isDebugEnabled()) s.showDebug(); return;
      case "syncDb":             handleSyncDb(triggerKey); return;
      case "randomQuestion":     handleRandomQuestion(); return;
      case "showCommandPalette": s.showPalette(); return;
      case "quit":               renderer.destroy(); return;

      case "scrollPopupDown":    scrollOffsetRef.current += 1; return;
      case "scrollPopupUp":      scrollOffsetRef.current -= 1; return;

      case "closePopup":         s.hidePopup(); return;
      case "closeResult":        s.hideResult(); return;
      case "closeHelp":          s.hideHelp(); return;
      case "closeDebug":         s.hideDebug(); return;
      case "closePalette":       s.hidePalette(); return;

      case "yankDebug": {
        const log = dumpToString();
        Bun.write("/tmp/leettui-debug.log", log).then(() => {
          s.hideDebug();
          s.showResult({ kind: "info", title: "Log written to /tmp/leettui-debug.log" });
        });
        return;
      }

      case "endSearch":          s.endSearch(); return;
      case "searchBackspace":    s.updateSearch(s.searchNeedle.slice(0, -1)); return;
    }
  }

  useKeyboard((event) => {
    if (event.eventType !== "press") return;
    const s = useAppStore.getState();
    const key = event.name ?? "";

    // SelectPopup / CommandPalette own their input; defer to their own hooks.
    if (s.mode === "select" || s.mode === "palette") return;

    const action = resolveAction(s.mode, {
      key,
      ctrl: event.ctrl,
      shift: event.shift,
      meta: event.meta,
    });

    if (action) {
      dispatchAction(action, key);
      return;
    }

    // Search mode: capture remaining 1-char keys as text input.
    if (s.mode === "search" && key.length === 1 && !event.ctrl && !event.meta) {
      logKey(key, "", s.mode, `updateSearch(+${key})`);
      s.updateSearch(s.searchNeedle + key);
    }
  });

  function runActionFromPalette(action: ActionId) {
    // Defer everything to a microtask so the synchronous keyboard dispatch
    // finishes first. This avoids a race where BrowseView's useKeyboard fires
    // after the palette's, sees mode === "browse", and re-handles the Enter.
    queueMicrotask(() => {
      useAppStore.getState().hidePalette();
      dispatchAction(action, ACTIONS[action].display);
    });
  }

  const mainHeight = height - (syncProgress ? 2 : 1);

  return (
    <box flexDirection="column" width="100%" height="100%">
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
        />
      </box>

      <StatusBar mode={mode} searchNeedle={searchNeedle} stats={stats} debugEnabled={isDebugEnabled()} />

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

      {mode === "palette" && <CommandPalette onRun={runActionFromPalette} />}
    </box>
  );
}
