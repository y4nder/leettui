// type: domain
// Owns the currently-open problem's submission-history rows + derived best/latest AC
// summary (feeds HistoryPanel). Populated synchronously on handleEnterProblemView (a
// local DB read, not a fetch) and cleared on exit. Domain-pure: no cursor/focus state —
// that lives in problemSlice's focusedHistoryIndex (UI/domain split). The browse badge's
// aggregate attempt-count Map is a SEPARATE concern (owned by questionsSlice, plan 02-02).

import type { StateCreator } from "zustand";
import type { DbSubmission } from "@/db/submissions";
import { getSubmissionsForQuestion } from "@/db/submissions";
import { summarizeAcRuntime, type AcRuntimeSummary } from "@/ui/verdict";
import type { AppStore } from "@/ui/store/index";

export interface SubmissionsSlice {
  problemSubmissions: DbSubmission[];
  submissionSummary: AcRuntimeSummary | null;

  loadProblemSubmissions: (questionId: number) => void;
  clearProblemSubmissions: () => void;
}

export const createSubmissionsSlice: StateCreator<AppStore, [], [], SubmissionsSlice> = (set) => ({
  problemSubmissions: [],
  submissionSummary: null,

  loadProblemSubmissions: (questionId) => {
    const rows = getSubmissionsForQuestion(questionId);
    set({ problemSubmissions: rows, submissionSummary: summarizeAcRuntime(rows) });
  },

  clearProblemSubmissions: () => {
    set({ problemSubmissions: [], submissionSummary: null });
  },
});
