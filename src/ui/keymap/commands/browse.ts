// Browse-mode commands: list/topic navigation, panel focus, the difficulty filter, and the
// question-targeted file actions (open editor / open workspace / yank URL on the selected
// question). Run/submit are intentionally absent — they belong to the problem view, so
// browse stays a navigator. Split into two exported runs (`browseNavCommands` and
// `browseSolveCommands`) because in the flat COMMANDS array the problem-view block sits
// *between* them — keeping them as two arrays lets commands/index.ts reproduce that exact
// byte order.

import { useAppStore } from "../../store";
import { getScrollJumpRows } from "../../../config";
import { makeCommand, type CommandEntry } from "../command";
import { getRenderer } from "../runtime";
import {
  handleOpenEditor,
  handleOpenRecent,
  handleOpenWorkspace,
  handleRandomQuestion,
  handleYankUrl,
} from "../../../views/browse/handlers";

export const browseNavCommands: CommandEntry[] = [
  makeCommand({
    name: "question.next",
    title: "Next question",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveQuestion(1),
  }),
  makeCommand({
    name: "question.prev",
    title: "Previous question",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveQuestion(-1),
  }),
  makeCommand({
    name: "topic.next",
    title: "Next topic",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveTopic(1),
  }),
  makeCommand({
    name: "topic.prev",
    title: "Previous topic",
    category: "Navigation",
    short: "Navigate",
    run: () => useAppStore.getState().moveTopic(-1),
  }),
  makeCommand({
    name: "topic.first",
    title: "Jump to first topic",
    category: "Navigation",
    run: () => useAppStore.getState().setTopicIndex(0),
  }),
  makeCommand({
    name: "topic.last",
    title: "Jump to last topic",
    category: "Navigation",
    run: () => useAppStore.getState().setTopicIndex(Number.MAX_SAFE_INTEGER),
  }),
  makeCommand({
    name: "question.random",
    title: "Jump to random question",
    category: "Navigation",
    run: () => handleRandomQuestion(),
  }),
  makeCommand({
    name: "recent.open",
    title: "Recently viewed questions",
    category: "Navigation",
    short: "Recent",
    run: () => handleOpenRecent(),
  }),
  makeCommand({
    name: "question.halfDown",
    title: "Page down (questions)",
    category: "Navigation",
    run: () => {
      const s = useAppStore.getState();
      s.requestSmoothScroll("questions");
      s.moveQuestion(getScrollJumpRows());
    },
  }),
  makeCommand({
    name: "question.halfUp",
    title: "Page up (questions)",
    category: "Navigation",
    run: () => {
      const s = useAppStore.getState();
      s.requestSmoothScroll("questions");
      s.moveQuestion(-getScrollJumpRows());
    },
  }),
  makeCommand({
    name: "topic.halfDown",
    title: "Page down (topics)",
    category: "Navigation",
    run: () => {
      const s = useAppStore.getState();
      s.requestSmoothScroll("topics");
      s.moveTopic(getScrollJumpRows());
    },
  }),
  makeCommand({
    name: "topic.halfUp",
    title: "Page up (topics)",
    category: "Navigation",
    run: () => {
      const s = useAppStore.getState();
      s.requestSmoothScroll("topics");
      s.moveTopic(-getScrollJumpRows());
    },
  }),
  makeCommand({
    name: "question.first",
    title: "Jump to first question",
    category: "Navigation",
    run: () => useAppStore.getState().setQuestionIndex(0),
  }),
  makeCommand({
    name: "question.last",
    title: "Jump to last question",
    category: "Navigation",
    run: () => useAppStore.getState().setQuestionIndex(Number.MAX_SAFE_INTEGER),
  }),
  makeCommand({
    name: "filter.cycleDifficulty",
    title: "Cycle difficulty filter (Easy → Medium → Hard → All)",
    category: "View",
    run: () => useAppStore.getState().cycleDifficulty(),
  }),

  makeCommand({
    name: "focus.cycle",
    title: "Focus next panel",
    category: "Navigation",
    short: "Focus",
    run: () => useAppStore.getState().cycleFocusedPanel(1),
  }),
  makeCommand({
    name: "focus.cyclePrev",
    title: "Focus previous panel",
    category: "Navigation",
    run: () => useAppStore.getState().cycleFocusedPanel(-1),
  }),
  makeCommand({
    name: "focus.topics",
    title: "Focus topics panel",
    category: "Navigation",
    run: () => useAppStore.getState().setFocusedPanel("topics"),
  }),
  makeCommand({
    name: "focus.questions",
    title: "Focus questions panel",
    category: "Navigation",
    run: () => useAppStore.getState().setFocusedPanel("questions"),
  }),
];

export const browseSolveCommands: CommandEntry[] = [
  makeCommand({
    name: "problem.openEditor",
    title: "Open in editor",
    category: "Solve",
    short: "Edit",
    run: () => {
      const r = getRenderer();
      if (r) handleOpenEditor("e", r);
    },
  }),
  makeCommand({
    name: "browse.openWorkspace",
    title: "Open problem workspace (whole folder) in editor",
    category: "Solve",
    short: "Wkspc",
    run: () => {
      const r = getRenderer();
      if (r) handleOpenWorkspace("w", r);
    },
  }),
  makeCommand({
    name: "question.yankUrl",
    title: "Yank problem URL to clipboard",
    category: "View",
    short: "Yank",
    run: () => handleYankUrl("y"),
  }),
];
