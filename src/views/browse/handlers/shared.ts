// Browse-scoped handler helpers. The cross-view scaffolding (Renderer,
// withSuspendedRenderer, currentTopic, makeReportError) lives in `views/shared`;
// this module only adds what's specific to the browse list.

import { useAppStore } from "@/ui/store";
import { makeReportError } from "@/views/shared";

export type { Renderer } from "@/views/shared";
export { withSuspendedRenderer, openInEditor, currentTopic } from "@/views/shared";

// Browse error reports log against the "browse" scope.
export const reportError = makeReportError("browse");

export function currentQuestion() {
  const s = useAppStore.getState();
  return s.filteredQuestions[s.selectedQuestionIndex] ?? null;
}

// Mutual-exclusion guard for `handleStartBackfill` (backfill.ts) and
// `handleSyncDb` (solve.ts) — both drive the same store `syncProgress` state,
// so without this, starting one mid-flight of the other lets one operation's
// `clearSyncProgress()` blank out the other's still-in-progress bar. A plain
// module-level flag, mirroring backfill.ts's own `cancelRef` re-entrancy
// guard. Each handler still keeps its own dedicated guard for a second
// invocation of *itself* — this only arbitrates between the two.
type SyncKind = "backfill" | "db-sync";
let activeSync: SyncKind | null = null;

// Claims the guard for `kind` if nothing else is running; returns false
// (leaving the existing operation untouched) when one already is.
export function tryAcquireSync(kind: SyncKind): boolean {
  if (activeSync !== null) return false;
  activeSync = kind;
  return true;
}

export function releaseSync(): void {
  activeSync = null;
}
