// Browse handlers for the daily-challenge popup, the "What's new" changelog, and
// the recently-viewed history modal — the read-mostly overlays opened from browse.

import { useAppStore } from "@/ui/store";
import { htmlToMarkdown } from "@/core/markdown";
import { fetchQuestionContent } from "@/api/queries/question-content";
import { fetchDailyChallenge } from "@/api/queries/daily-challenge";
import { getQuestionBySlug } from "@/db/questions";
import { getRecents, recordRecent } from "@/db/recents";
import { fetchReleases } from "@/core/update";
import { handleEnterProblemView } from "@/views/problem/handlers";
import { info, loading } from "@/views/browse/resultView";
import { reportError } from "@/views/browse/handlers/shared";

// Command-palette "What's new": fetch the recent releases on demand and open the
// changelog popup with the **latest** emphasized. Un-gated (works on dev/from-source
// builds too, unlike the boot auto-popup). Deliberately highlights the latest — the
// most useful answer when you're behind — distinct from the post-update auto-popup,
// which highlights the version you just installed; past releases scroll below either
// way. A brief loading result covers the fetch; a failure surfaces a clean error.
export async function handleViewChangelog(): Promise<void> {
  const { showResult, showChangelog } = useAppStore.getState();
  showResult(loading("Fetching what's new…"));
  try {
    const releases = await fetchReleases(10);
    showChangelog({ releases, highlightTag: releases[0]!.tag });
  } catch (e) {
    reportError(showResult, "", "handleViewChangelog", "Couldn't fetch the changelog", e);
  }
}

// `h` history modal (Stage 20): snapshot the recently-viewed questions and open
// the RecentPopup. Synchronous (getRecents is a local DB read) — no loading state.
export function handleOpenRecent() {
  useAppStore.getState().showRecent(getRecents());
}

export async function handleViewDailyChallenge(triggerKey: string) {
  const { showPopup, showResult } = useAppStore.getState();
  try {
    const daily = await fetchDailyChallenge();
    const q = daily.activeDailyCodingChallengeQuestion.question;
    const content = await fetchQuestionContent(q.titleSlug);
    const html = content.question?.content;
    if (!html) {
      showResult(info("No description available (problem may be premium-only)."));
      return;
    }
    const md = htmlToMarkdown(html);
    // Opening the detail popup is a "viewed" moment (Stage 20). The daily question
    // is keyed by slug here; record it only when it maps to a locally-synced row
    // (recents references questions.id), otherwise quietly skip.
    const dbQ = getQuestionBySlug(q.titleSlug);
    if (dbQ) recordRecent(dbQ.id);
    // Stash the resolved DB row (may be null) so the popup's Enter can open it in
    // the problem view (handleEnterPopupProblem).
    showPopup(`${q.frontendQuestionId}. ${q.title} [${q.difficulty}] — Daily`, md, dbQ);
  } catch (e) {
    reportError(
      showResult,
      triggerKey,
      "handleViewDailyChallenge",
      "Error fetching daily challenge",
      e,
    );
  }
}

// Enter from inside the daily-challenge popup: open the question in the full
// problem view (the same path as Enter on the questions list). The popup only
// stores a DB row when the daily question is locally synced; when it isn't,
// surface a clear "sync first" message instead of silently doing nothing.
export function handleEnterPopupProblem() {
  const { popupQuestion, hidePopup, showResult } = useAppStore.getState();
  hidePopup();
  if (!popupQuestion) {
    showResult(info("This problem isn't in your local DB yet — sync with * first."));
    return;
  }
  void handleEnterProblemView(popupQuestion, "popup-enter");
}
