// Helpers shared by both view handler layers (browse + problem). Kept in a leaf
// module that imports neither view's handlers, so the two handler trees can both
// depend on it without forming an import cycle (browse → problem → browse/resultView).

import { dirname } from "node:path";

import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "@/ui/store";
import { errMessage, logError } from "@/debug";
import { getEditorArgv, getEditorDetach, shouldDetachEditor } from "@/config";
import { errorView, type ResultView } from "@/views/browse/resultView";

export type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

// Run `fn` on the bare terminal (editor, auth prompts, git UI, …) with the TUI
// paused, always resuming afterwards — the shared scaffold behind every
// *blocking* spawn (GUI editors go through openInEditor's detached branch).
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

// Launch `$EDITOR` on `target` (file or dir) — the single spawn point behind
// `e`/`w`/`W`/notes/picker. GUI editors (per `[editor] detach`) launch detached
// so the TUI stays live and interactive; terminal editors keep the
// suspend/spawn/resume handover. `onExit` is the caller's state refresh: in
// blocking mode it runs once after the editor closes; in detached mode it runs
// immediately (the target already exists on disk) and again when the editor
// eventually exits, so `code --wait` users still get an exit-time refresh.
export async function openInEditor(
  renderer: Renderer,
  target: string,
  opts: { cwd?: string; onExit?: () => void | Promise<void> } = {},
): Promise<void> {
  const editor = getEditorArgv();
  const cwd = opts.cwd ?? dirname(target);

  if (shouldDetachEditor(editor, getEditorDetach())) {
    // Bun.spawn throws synchronously on a missing binary, so failures still
    // reach the caller's try/catch exactly like the blocking branch.
    const proc = Bun.spawn([...editor, target], {
      cwd,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();
    if (opts.onExit) {
      const onExit = opts.onExit;
      await onExit();
      proc.exited
        .then(() => onExit())
        .catch((e) => logError("detach", "shared", "openInEditor.onExit", e));
    }
    return;
  }

  await withSuspendedRenderer(renderer, async () => {
    const proc = Bun.spawn([...editor, target], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  });
  await opts.onExit?.();
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
