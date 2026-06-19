// Helpers shared by both view handler layers (browse + problem). Kept in a leaf
// module that imports neither view's handlers, so the two handler trees can both
// depend on it without forming an import cycle (browse → problem → browse/resultView).

import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "../ui/store";
import { errMessage, logError } from "../debug";
import { errorView, type ResultView } from "./browse/resultView";

export type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

// Run `fn` on the bare terminal (editor, auth prompts, git UI, …) with the TUI
// paused, always resuming afterwards — the shared scaffold behind every spawn.
export async function withSuspendedRenderer<T>(
  renderer: Renderer,
  fn: () => Promise<T>,
): Promise<T> {
  renderer.suspend();
  try {
    return await fn();
  } finally {
    renderer.resume();
  }
}

export function currentTopic() {
  const s = useAppStore.getState();
  return s.topics[s.selectedTopicIndex] ?? "all";
}

// The repeated catch tail: log against a scope ("browse" / "problem"), then
// surface the failure through the given result-view setter. One place to change
// the shape of every error report; each view binds its own scope once.
export function makeReportError(scope: string) {
  return (
    setResult: (view: ResultView) => void,
    triggerKey: string,
    name: string,
    title: string,
    e: unknown,
  ) => {
    logError(triggerKey, scope, name, e);
    setResult(errorView(title, errMessage(e)));
  };
}
