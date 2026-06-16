// Shared debounced topic-load. Used by the selection slice (topic j/k) and the
// questions slice (topic-panel search) so rapid navigation/typing doesn't fire a
// blocking `loadTopic` DB query per keypress.
//
// This is a DEBOUNCE (reset-on-each-call), not the throttle in core/session:
// holding `j` must load the topic you *settle* on, not an intermediate one. Each
// call clears the pending timer and re-arms it, so the query runs once, ~90ms
// after navigation goes idle (the lazygit "list catches up when you stop" feel).
// The cursor move itself stays instant (a cheap `set`), so the highlight tracks
// the key at frame rate while the heavier question-list load lags behind.

import type { AppStore } from "./index";
import { saveSession } from "../../core/session";

const TOPIC_LOAD_DEBOUNCE_MS = 90;

let timer: ReturnType<typeof setTimeout> | null = null;

// Schedule a load of the *currently selected* topic's questions. The topic is
// read at fire time (last-wins), so a fast scroll-through never loads stale
// intermediate topics. When `persist` is set (the navigation path), the question
// position is saved after the load — the cursor has reset to 0, so this records
// the settled topic's first question. Search passes `persist: false` (its cursor
// position isn't meant to survive restarts).
export function scheduleTopicLoad(get: () => AppStore, persist = false): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const { topics, selectedTopicIndex } = get();
    const topic = topics[selectedTopicIndex];
    if (!topic) return;
    get().loadTopic(topic);
    if (persist) {
      saveSession({ questionId: get().filteredQuestions[get().selectedQuestionIndex]?.id });
    }
  }, TOPIC_LOAD_DEBOUNCE_MS);
}

// Cancel a pending load (e.g. a search needle cleared or matched nothing, where
// the question list is resolved synchronously and a trailing load would be stale).
export function cancelTopicLoad(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
