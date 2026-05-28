import { useEffect, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { NodeHtmlMarkdown } from "node-html-markdown";

import { useAppStore } from "./ui/store";
import { TopicList } from "./ui/components/TopicList";
import { QuestionList } from "./ui/components/QuestionList";
import { StatusBar } from "./ui/components/StatusBar";
import { QuestionPopup } from "./ui/components/QuestionPopup";
import { SelectPopup } from "./ui/components/SelectPopup";
import { ResultPopup } from "./ui/components/ResultPopup";
import { HelpPopup } from "./ui/components/HelpPopup";
import { ProgressBar } from "./ui/components/ProgressBar";

import { fetchQuestionContent } from "./api/queries/question-content";
import { fetchEditorData } from "./api/queries/editor-data";
import { fetchConsolePanelConfig } from "./api/queries/console-panel-config";
import { runCode } from "./api/rest/run";
import { submitCode } from "./api/rest/submit";
import { pollResult } from "./api/rest/check";
import { parseCheckResponse, type ParsedResponse } from "./api/types";
import { getQuestionsByTopic, markAccepted, markAttempted } from "./db/questions";
import { createSolutionFile, readSolutionFile, findExistingSolutions } from "./core/solutions";
import { syncQuestions } from "./core/sync";
import { getEditorCommand, getDefaultLanguage } from "./config";
import { colors } from "./ui/theme";

const nhm = new NodeHtmlMarkdown();

interface AppProps {
  renderer: Awaited<ReturnType<typeof import("@opentui/core").createCliRenderer>>;
}

export function App({ renderer }: AppProps) {
  const { height } = useTerminalDimensions();
  const scrollOffsetRef = useRef(0);

  // Navigation state
  const topics = useAppStore((s) => s.topics);
  const selectedTopicIndex = useAppStore((s) => s.selectedTopicIndex);
  const filteredQuestions = useAppStore((s) => s.filteredQuestions);
  const selectedQuestionIndex = useAppStore((s) => s.selectedQuestionIndex);
  const currentQuestion = useAppStore(
    (s) => s.filteredQuestions[s.selectedQuestionIndex] ?? null
  );
  const currentTopic = useAppStore((s) => s.topics[s.selectedTopicIndex] ?? "all");

  // Search state
  const searchNeedle = useAppStore((s) => s.searchNeedle);

  // UI state
  const mode = useAppStore((s) => s.mode);
  const popupTitle = useAppStore((s) => s.popupTitle);
  const popupContent = useAppStore((s) => s.popupContent);
  const selectTitle = useAppStore((s) => s.selectTitle);
  const selectItems = useAppStore((s) => s.selectItems);
  const selectResolve = useAppStore((s) => s.selectResolve);
  const resultLines = useAppStore((s) => s.resultLines);
  const syncProgress = useAppStore((s) => s.syncProgress);

  // Actions
  const {
    init,
    moveQuestion,
    moveTopic,
    refreshQuestions,
    startSearch,
    updateSearch,
    endSearch,
    showPopup,
    hidePopup,
    showSelect,
    hideSelect,
    showResult,
    hideResult,
    showHelp,
    hideHelp,
    setSyncProgress,
    clearSyncProgress,
  } = useAppStore.getState();

  useEffect(() => {
    init();
  }, []);

  const handleViewProblem = async () => {
    const q = useAppStore.getState().filteredQuestions[
      useAppStore.getState().selectedQuestionIndex
    ] ?? null;
    if (!q) return;
    try {
      const data = await fetchQuestionContent(q.title_slug);
      const md = nhm.translate(data.question.content);
      showPopup(`${q.id}. ${q.title} [${q.difficulty}]`, md);
    } catch (e: any) {
      showResult(["Error fetching question:", e.message]);
    }
  };

  const handleOpenEditor = async () => {
    const q = useAppStore.getState().filteredQuestions[
      useAppStore.getState().selectedQuestionIndex
    ] ?? null;
    if (!q) return;

    try {
      const editorData = await fetchEditorData(q.title_slug);
      const snippets = editorData.question.codeSnippets;
      if (!snippets || snippets.length === 0) {
        showResult(["No code snippets available for this problem."]);
        return;
      }

      const defaultLang = getDefaultLanguage();
      const langSlugs = snippets.map((s) => s.langSlug);

      showSelect("Select Language", snippets.map((s) => s.lang), async (index) => {
        hideSelect();
        if (index === null) return;

        const snippet = snippets[index]!;
        const path = createSolutionFile(q.id, q.title_slug, snippet.langSlug, snippet.code);

        const editor = getEditorCommand();
        renderer.suspend();
        try {
          const proc = Bun.spawn([editor, path], {
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          });
          await proc.exited;
        } finally {
          renderer.resume();
        }
      });
    } catch (e: any) {
      showResult(["Error fetching editor data:", e.message]);
    }
  };

  const handleRunSolution = async () => {
    const q = useAppStore.getState().filteredQuestions[
      useAppStore.getState().selectedQuestionIndex
    ] ?? null;
    if (!q) return;

    try {
      const existing = findExistingSolutions(q.id, q.title_slug);
      if (existing.length === 0) {
        showResult(["No solution file found. Press 'e' to create one."]);
        return;
      }

      const langSlug = existing[0]!.split(".").pop() === "py" ? "python3" : getDefaultLanguage();
      const code = readSolutionFile(q.id, q.title_slug, langSlug);
      if (!code) {
        showResult(["Could not read solution file."]);
        return;
      }

      const config = await fetchConsolePanelConfig(q.title_slug);
      const testCases = config.question.exampleTestcaseList.join("\n");
      const editorData = await fetchEditorData(q.title_slug);

      showResult(["Running solution..."]);

      const runResponse = await runCode(
        q.title_slug,
        langSlug,
        editorData.question.questionId,
        code,
        testCases
      );

      const result = await pollResult(runResponse.interpret_id);
      showResult(formatResult(result));

      markAttempted(q.id);
      const { topics: t, selectedTopicIndex: ti } = useAppStore.getState();
      refreshQuestions(getQuestionsByTopic(t[ti] ?? "all"));
    } catch (e: any) {
      showResult(["Run error:", e.message]);
    }
  };

  const handleSubmitSolution = async () => {
    const q = useAppStore.getState().filteredQuestions[
      useAppStore.getState().selectedQuestionIndex
    ] ?? null;
    if (!q) return;

    try {
      const existing = findExistingSolutions(q.id, q.title_slug);
      if (existing.length === 0) {
        showResult(["No solution file found. Press 'e' to create one."]);
        return;
      }

      const langSlug = existing[0]!.split(".").pop() === "py" ? "python3" : getDefaultLanguage();
      const code = readSolutionFile(q.id, q.title_slug, langSlug);
      if (!code) {
        showResult(["Could not read solution file."]);
        return;
      }

      const editorData = await fetchEditorData(q.title_slug);

      showResult(["Submitting solution..."]);

      const submitResponse = await submitCode(
        q.title_slug,
        langSlug,
        editorData.question.questionId,
        code
      );

      const result = await pollResult(submitResponse.submission_id);
      showResult(formatResult(result));

      if (result.type === "submit_accepted") {
        markAccepted(q.id);
      } else {
        markAttempted(q.id);
      }

      const topic = useAppStore.getState().topics[useAppStore.getState().selectedTopicIndex] ?? "all";
      refreshQuestions(getQuestionsByTopic(topic));
    } catch (e: any) {
      showResult(["Submit error:", e.message]);
    }
  };

  const handleSyncDb = async () => {
    setSyncProgress(0, 0);
    try {
      await syncQuestions((current, total) => {
        setSyncProgress(current, total);
      });
      clearSyncProgress();
      const topic = useAppStore.getState().topics[useAppStore.getState().selectedTopicIndex] ?? "all";
      refreshQuestions(getQuestionsByTopic(topic));
      init();
    } catch (e: any) {
      clearSyncProgress();
      showResult(["Sync error:", e.message]);
    }
  };

  const handleRandomQuestion = () => {
    const s = useAppStore.getState();
    if (s.filteredQuestions.length === 0) return;
    const randomIndex = Math.floor(Math.random() * s.filteredQuestions.length);
    moveQuestion(randomIndex - s.selectedQuestionIndex);
  };

  useKeyboard((event) => {
    if (event.eventType !== "press") return;
    const s = useAppStore.getState();

    if (s.mode === "help") {
      if (event.name === "escape" || event.name === "return") hideHelp();
      return;
    }

    if (s.mode === "popup") {
      switch (event.name) {
        case "escape":
        case "return":
          hidePopup();
          break;
        case "j":
        case "down":
          scrollOffsetRef.current += 1;
          break;
        case "k":
        case "up":
          scrollOffsetRef.current -= 1;
          break;
      }
      return;
    }

    if (s.mode === "result") {
      if (event.name === "escape" || event.name === "return") hideResult();
      return;
    }

    if (s.mode === "select") return;

    if (s.mode === "search") {
      if (event.name === "escape" || event.name === "return") {
        endSearch();
      } else if (event.name === "backspace") {
        updateSearch(s.searchNeedle.slice(0, -1));
      } else if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
        updateSearch(s.searchNeedle + event.name);
      }
      return;
    }

    // Browse mode
    switch (event.name) {
      case "q":
        renderer.destroy();
        break;
      case "j":
      case "down":
        moveQuestion(1);
        break;
      case "k":
      case "up":
        moveQuestion(-1);
        break;
      case "t":
        moveTopic(1);
        break;
      case "return":
        handleViewProblem();
        break;
      case "e":
        handleOpenEditor();
        break;
      case "r":
        handleRandomQuestion();
        break;
      case "/":
        startSearch();
        break;
      case "h":
        showHelp();
        break;
    }

    if (event.shift) {
      switch (event.name) {
        case "t":
          moveTopic(-1);
          break;
        case "r":
          handleRunSolution();
          break;
      }
    }

    if (event.name === "s" && !event.shift && !event.ctrl) {
      handleSubmitSolution();
    }

    if (event.name === "*") {
      handleSyncDb();
    }
  });

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

      <StatusBar mode={mode} searchNeedle={searchNeedle} />

      {mode === "popup" && <QuestionPopup title={popupTitle} content={popupContent} />}

      {mode === "select" && (
        <SelectPopup
          title={selectTitle}
          items={selectItems}
          onSelect={(index) => selectResolve?.(index)}
        />
      )}

      {mode === "result" && <ResultPopup lines={resultLines} />}

      {mode === "help" && <HelpPopup />}
    </box>
  );
}

function formatResult(result: ParsedResponse): string[] {
  switch (result.type) {
    case "pending":
      return ["Still pending..."];
    case "run_accepted":
      return [
        "✓ Run Accepted",
        `Runtime: ${result.data.status_runtime ?? "N/A"}`,
        `Memory: ${result.data.status_memory ?? "N/A"}`,
        `Tests: ${result.data.total_correct}/${result.data.total_testcases}`,
        ...(result.data.code_answer ?? []).map((a, i) => `  Output ${i + 1}: ${a}`),
      ];
    case "run_wrong_answer":
      return [
        "✗ Wrong Answer (Run)",
        `Tests: ${result.data.total_correct}/${result.data.total_testcases}`,
        ...(result.data.code_answer ?? []).map((a, i) => `  Output ${i + 1}: ${a}`),
        ...(result.data.expected_code_answer ?? []).map(
          (a, i) => `  Expected ${i + 1}: ${a}`
        ),
      ];
    case "submit_accepted":
      return [
        "✓ Accepted!",
        `Runtime: ${result.data.status_runtime ?? "N/A"} (faster than ${result.data.runtime_percentile?.toFixed(1) ?? "?"}%)`,
        `Memory: ${result.data.status_memory ?? "N/A"} (less than ${result.data.memory_percentile?.toFixed(1) ?? "?"}%)`,
      ];
    case "submit_wrong_answer":
      return [
        "✗ Wrong Answer",
        `Tests: ${result.data.total_correct}/${result.data.total_testcases}`,
        `Last Testcase: ${result.data.last_testcase ?? "N/A"}`,
        `Expected: ${result.data.expected_output ?? "N/A"}`,
        `Output: ${result.data.code_output ?? "N/A"}`,
      ];
    case "compile_error":
      return [
        "✗ Compile Error",
        result.data.full_compile_error ?? result.data.compile_error ?? "Unknown error",
      ];
    case "runtime_error":
      return [
        "✗ Runtime Error",
        result.data.full_runtime_error ?? result.data.runtime_error ?? "Unknown error",
      ];
    case "time_limit_exceeded":
      return ["✗ Time Limit Exceeded"];
    case "memory_limit_exceeded":
      return ["✗ Memory Limit Exceeded"];
    case "output_limit_exceeded":
      return ["✗ Output Limit Exceeded"];
    case "internal_error":
      return ["✗ Internal Error (LeetCode server error)"];
    case "timeout":
      return ["✗ Timeout (polling exceeded)"];
    case "unknown":
      return [`✗ Unknown status (code: ${result.statusCode})`];
  }
}
