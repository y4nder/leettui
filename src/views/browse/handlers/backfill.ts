// Command-palette backfill trigger (DATA-07): imports LeetCode submission history
// into the local store via the never-throws, resumable backfillSubmissions
// service (01-02). Mirrors git.ts's handler style — store-driven, delegating to a
// core service that never throws — and BootFlow's syncIfEmpty progress-callback
// pattern (setSyncProgress/clearSyncProgress, RESEARCH.md Pattern 7): the service
// runs as a plain async function, so the OpenTUI render loop runs between await
// points and the user can keep navigating while it's in flight (D-04).

import { useAppStore } from "../../../ui/store";
import { backfillSubmissions, type CancelRef } from "../../../core/backfill";
import { errorView, info } from "../resultView";
import { releaseSync, tryAcquireSync } from "./shared";

// Module-level so handleCancelBackfill can reach the in-flight run without any
// component needing to hold a ref; null when idle (also the no-op guard both for
// a duplicate start and for a stray cancel — mirrors update.dismiss).
let cancelRef: CancelRef | null = null;

// Palette "submissions.backfill". A second invocation while one is already
// running is a no-op info message rather than a second concurrent run.
export async function handleStartBackfill(): Promise<void> {
  const { showResult, setSyncProgress, clearSyncProgress } = useAppStore.getState();

  if (cancelRef) {
    showResult(info("A submission import is already running."));
    return;
  }
  if (!tryAcquireSync("backfill")) {
    showResult(info("A database sync is already running — try again once it finishes."));
    return;
  }

  cancelRef = { cancelled: false };
  try {
    const result = await backfillSubmissions(
      (done, total) => setSyncProgress(done, total),
      cancelRef,
    );

    if (result.ok) {
      const importedLabel = `${result.imported} submission${result.imported === 1 ? "" : "s"}`;
      showResult(info(`Imported ${importedLabel} (${result.skipped} already known).`));
      return;
    }

    switch (result.reason) {
      case "auth-error":
        showResult(
          errorView(
            "Session expired",
            'Re-authenticate via Ctrl+P → "Re-authenticate (refresh LeetCode session)", then run the import again.',
          ),
        );
        break;
      case "rate-limited":
        showResult(
          errorView(
            "Rate-limited by LeetCode",
            "Try again later — the submissions imported so far were kept.",
          ),
        );
        break;
      case "network-error":
        showResult(
          errorView(
            "Network error",
            `Check your connection and try again — the submissions imported so far were kept. (${result.message})`,
          ),
        );
        break;
      case "cancelled":
        showResult(
          info(
            `Backfill cancelled — ${result.imported} submission${result.imported === 1 ? "" : "s"} kept.`,
          ),
        );
        break;
    }
  } finally {
    // Clears the progress bar on EVERY exit path — success, error, AND cancel
    // (Pitfall 6) — so it can never freeze/stick regardless of how the run ends.
    clearSyncProgress();
    cancelRef = null;
    releaseSync();
  }
}

// Palette "submissions.cancelBackfill". A no-op when no backfill is running
// (mirrors update.dismiss) — flips the shared CancelRef the in-flight loop polls
// between pages, preserving rows already written (D-05).
export function handleCancelBackfill(): void {
  if (cancelRef) cancelRef.cancelled = true;
}
