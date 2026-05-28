import { useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { NodeHtmlMarkdown } from "node-html-markdown";

import { useAppState } from "./ui/hooks/useAppState";
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
  const { state, dispatch, init, moveTopic, currentQuestion, currentTopic } = useAppState();
  const { height } = useTerminalDimensions();
  const scrollOffsetRef = useRef(0);

  useEffect(() => {
    init();
  }, [init]);

  const handleViewProblem = useCallback(async () => {
    if (!currentQuestion) return;
    try {
      const data = await fetchQuestionContent(currentQuestion.title_slug);
      const html = data.question.content;
      const md = nhm.translate(html);
      dispatch({
        type: "SHOW_POPUP",
        title: `${currentQuestion.id}. ${currentQuestion.title} [${currentQuestion.difficulty}]`,
        content: md,
      });
    } catch (e: any) {
      dispatch({
        type: "SHOW_RESULT",
        lines: ["Error fetching question:", e.message],
      });
    }
  }, [currentQuestion, dispatch]);

  const handleOpenEditor = useCallback(async () => {
    if (!currentQuestion) return;

    try {
      const editorData = await fetchEditorData(currentQuestion.title_slug);
      const snippets = editorData.question.codeSnippets;
      if (!snippets || snippets.length === 0) {
        dispatch({ type: "SHOW_RESULT", lines: ["No code snippets available for this problem."] });
        return;
      }

      const langSlugs = snippets.map((s) => s.langSlug);
      const defaultLang = getDefaultLanguage();
      const defaultIndex = langSlugs.indexOf(defaultLang);

      dispatch({
        type: "SHOW_SELECT",
        title: "Select Language",
        items: snippets.map((s) => s.lang),
        resolve: async (index: number | null) => {
          dispatch({ type: "HIDE_SELECT" });
          if (index === null) return;

          const snippet = snippets[index]!;
          const path = createSolutionFile(
            currentQuestion.id,
            currentQuestion.title_slug,
            snippet.langSlug,
            snippet.code
          );

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
        },
      });
    } catch (e: any) {
      dispatch({
        type: "SHOW_RESULT",
        lines: ["Error fetching editor data:", e.message],
      });
    }
  }, [currentQuestion, dispatch, renderer]);

  const handleRunSolution = useCallback(async () => {
    if (!currentQuestion) return;

    try {
      const existing = findExistingSolutions(currentQuestion.id, currentQuestion.title_slug);
      if (existing.length === 0) {
        dispatch({ type: "SHOW_RESULT", lines: ["No solution file found. Press 'e' to create one."] });
        return;
      }

      const langSlug = existing[0]!.split(".").pop() === "py" ? "python3" : getDefaultLanguage();
      const code = readSolutionFile(currentQuestion.id, currentQuestion.title_slug, langSlug);
      if (!code) {
        dispatch({ type: "SHOW_RESULT", lines: ["Could not read solution file."] });
        return;
      }

      const config = await fetchConsolePanelConfig(currentQuestion.title_slug);
      const testCases = config.question.exampleTestcaseList.join("\n");
      const editorData = await fetchEditorData(currentQuestion.title_slug);

      dispatch({ type: "SHOW_RESULT", lines: ["Running solution..."] });

      const runResponse = await runCode(
        currentQuestion.title_slug,
        langSlug,
        editorData.question.questionId,
        code,
        testCases
      );

      const result = await pollResult(runResponse.interpret_id);
      dispatch({ type: "SHOW_RESULT", lines: formatResult(result) });

      markAttempted(currentQuestion.id);
      const questions = getQuestionsByTopic(currentTopic);
      dispatch({ type: "REFRESH_QUESTIONS", questions });
    } catch (e: any) {
      dispatch({ type: "SHOW_RESULT", lines: ["Run error:", e.message] });
    }
  }, [currentQuestion, currentTopic, dispatch]);

  const handleSubmitSolution = useCallback(async () => {
    if (!currentQuestion) return;

    try {
      const existing = findExistingSolutions(currentQuestion.id, currentQuestion.title_slug);
      if (existing.length === 0) {
        dispatch({ type: "SHOW_RESULT", lines: ["No solution file found. Press 'e' to create one."] });
        return;
      }

      const langSlug = existing[0]!.split(".").pop() === "py" ? "python3" : getDefaultLanguage();
      const code = readSolutionFile(currentQuestion.id, currentQuestion.title_slug, langSlug);
      if (!code) {
        dispatch({ type: "SHOW_RESULT", lines: ["Could not read solution file."] });
        return;
      }

      const editorData = await fetchEditorData(currentQuestion.title_slug);

      dispatch({ type: "SHOW_RESULT", lines: ["Submitting solution..."] });

      const submitResponse = await submitCode(
        currentQuestion.title_slug,
        langSlug,
        editorData.question.questionId,
        code
      );

      const result = await pollResult(submitResponse.submission_id);
      dispatch({ type: "SHOW_RESULT", lines: formatResult(result) });

      if (result.type === "submit_accepted") {
        markAccepted(currentQuestion.id);
      } else {
        markAttempted(currentQuestion.id);
      }

      const questions = getQuestionsByTopic(currentTopic);
      dispatch({ type: "REFRESH_QUESTIONS", questions });
    } catch (e: any) {
      dispatch({ type: "SHOW_RESULT", lines: ["Submit error:", e.message] });
    }
  }, [currentQuestion, currentTopic, dispatch]);

  const handleSyncDb = useCallback(async () => {
    dispatch({ type: "SYNC_PROGRESS", current: 0, total: 0 });
    try {
      await syncQuestions((current, total) => {
        dispatch({ type: "SYNC_PROGRESS", current, total });
      });
      dispatch({ type: "SYNC_DONE" });
      const questions = getQuestionsByTopic(currentTopic);
      dispatch({ type: "REFRESH_QUESTIONS", questions });
      init();
    } catch (e: any) {
      dispatch({ type: "SYNC_DONE" });
      dispatch({ type: "SHOW_RESULT", lines: ["Sync error:", e.message] });
    }
  }, [currentTopic, dispatch, init]);

  const handleRandomQuestion = useCallback(() => {
    if (state.filteredQuestions.length === 0) return;
    const randomIndex = Math.floor(Math.random() * state.filteredQuestions.length);
    dispatch({ type: "MOVE_QUESTION", delta: randomIndex - state.selectedQuestionIndex });
  }, [state.filteredQuestions.length, state.selectedQuestionIndex, dispatch]);

  useKeyboard((event) => {
    if (event.eventType !== "press") return;

    if (state.mode === "help") {
      if (event.name === "escape" || event.name === "return") {
        dispatch({ type: "HIDE_HELP" });
      }
      return;
    }

    if (state.mode === "popup") {
      switch (event.name) {
        case "escape":
        case "return":
          dispatch({ type: "HIDE_POPUP" });
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

    if (state.mode === "result") {
      if (event.name === "escape" || event.name === "return") {
        dispatch({ type: "HIDE_RESULT" });
      }
      return;
    }

    if (state.mode === "select") {
      return;
    }

    if (state.mode === "search") {
      if (event.name === "escape") {
        dispatch({ type: "END_SEARCH" });
      } else if (event.name === "return") {
        dispatch({ type: "END_SEARCH" });
      } else if (event.name === "backspace") {
        dispatch({
          type: "UPDATE_SEARCH",
          needle: state.searchNeedle.slice(0, -1),
        });
      } else if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
        dispatch({
          type: "UPDATE_SEARCH",
          needle: state.searchNeedle + event.name,
        });
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
        dispatch({ type: "MOVE_QUESTION", delta: 1 });
        break;
      case "k":
      case "up":
        dispatch({ type: "MOVE_QUESTION", delta: -1 });
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
        dispatch({ type: "START_SEARCH" });
        break;
      case "h":
        dispatch({ type: "SHOW_HELP" });
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

  const mainHeight = height - (state.syncProgress ? 2 : 1);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {state.syncProgress && (
        <ProgressBar
          current={state.syncProgress.current}
          total={state.syncProgress.total}
        />
      )}

      <box flexDirection="row" flexGrow={1} height={mainHeight}>
        <TopicList
          topics={state.topics}
          selectedIndex={state.selectedTopicIndex}
          height={mainHeight}
        />
        <QuestionList
          questions={state.filteredQuestions}
          selectedIndex={state.selectedQuestionIndex}
          height={mainHeight}
          topic={currentTopic}
        />
      </box>

      <StatusBar
        mode={state.mode}
        searchNeedle={state.searchNeedle}
      />

      {state.mode === "popup" && (
        <QuestionPopup title={state.popupTitle} content={state.popupContent} />
      )}

      {state.mode === "select" && (
        <SelectPopup
          title={state.selectTitle}
          items={state.selectItems}
          onSelect={(index) => {
            state.selectResolve?.(index);
          }}
        />
      )}

      {state.mode === "result" && <ResultPopup lines={state.resultLines} />}

      {state.mode === "help" && <HelpPopup />}
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
