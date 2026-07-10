import { useCallback, useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors, difficultyColor } from "../theme";
import { useAppStore } from "../store";
import { registerPopupScroller, resultFullscreenBindings } from "../keymap";
import { ResultBody } from "./ResultBody";

// Full-screen takeover for run/submit/test results (the detached-editor loop:
// solve in the GUI editor, flip to the TUI, hit one key, read the whole result).
// Mounted only while `problem.resultFullscreen` is true — a true modal: ProblemView
// gates the global + panel layers off, so this layer's keys are the only live ones.
// shift+r/t/s re-run from inside (the handlers repaint `result` in place) and `e`
// hops back to the editor without closing. An absolute overlay, not an early
// return, so the underlying layout keeps its scroll offsets.
export function ResultFullscreen() {
  useBindings(() => ({ bindings: resultFullscreenBindings }), []);
  const problem = useAppStore((s) => s.problem);
  const boxRef = useRef<ScrollBoxRenderable | null>(null);
  const registerScroller = useCallback((box: ScrollBoxRenderable | null) => {
    boxRef.current = box;
    registerPopupScroller(box);
  }, []);
  const result = problem?.result ?? null;

  // A re-run from inside replaces the content — snap back to the top so the new
  // loading/result isn't viewed from the old scroll offset.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `result` is the deliberate trigger key; the callback only touches the scrollbox ref
  useEffect(() => {
    boxRef.current?.scrollTo({ x: 0, y: 0 });
  }, [result]);

  if (!problem) return null;
  const { question, solutions, focusedSolutionIndex } = problem;
  const lang = solutions[focusedSolutionIndex];

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={colors.bg}
      flexDirection="column"
    >
      <box flexDirection="row" width="100%" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}>
          {" "}
          {question.id}. {question.title}{" "}
        </text>
        <text fg={difficultyColor(question.difficulty)}>[{question.difficulty}]</text>
        {lang && <text fg={colors.subtle}> {lang}</text>}
      </box>

      <box
        flexDirection="column"
        flexGrow={1}
        borderStyle="rounded"
        borderColor={colors.borderFocused}
      >
        <scrollbox ref={registerScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
          {result ? (
            <ResultBody view={result} />
          ) : (
            <text fg={colors.fgDim}> No run/submit yet </text>
          )}
        </scrollbox>
      </box>

      <text fg={colors.fgDim}>
        {" "}
        j/k:Scroll ^D/^U:Jump R:Run t:Test s:Submit e:Editor Esc/q:Back{" "}
      </text>
    </box>
  );
}
