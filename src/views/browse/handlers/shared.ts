// Browse-scoped handler helpers. The cross-view scaffolding (Renderer,
// withSuspendedRenderer, currentTopic, makeReportError) lives in `views/shared`;
// this module only adds what's specific to the browse list.

import { useAppStore } from "../../../ui/store";
import { makeReportError } from "../../shared";

export type { Renderer } from "../../shared";
export { withSuspendedRenderer, currentTopic } from "../../shared";

// Browse error reports log against the "browse" scope.
export const reportError = makeReportError("browse");

export function currentQuestion() {
  const s = useAppStore.getState();
  return s.filteredQuestions[s.selectedQuestionIndex] ?? null;
}
