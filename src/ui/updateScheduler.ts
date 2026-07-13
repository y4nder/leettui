// The in-TUI update loop: a boot check plus a 4-hour re-check, each tick
// advertising a newer release in the banner and — when `[update] auto` is on,
// the build is an official release, and the platform can self-update — silently
// downloading + installing it in the background (the atomic swap in
// core/update), then flipping the banner to the "restart to apply" CTA. This
// module owns only the timer and the store writes; every decision and all
// filesystem work lives in core/update so it stays unit-testable. It absorbed
// BootFlow's old one-shot `checkForUpdate().then(...)` block, so there is
// exactly one check → advertise → auto-install path.
import { getUpdateAuto } from "@/config";
import {
  autoInstallUpdate,
  checkForUpdate,
  getInstalledUpdate,
  isNewerVersion,
  selfUpdateSupported,
  setInstalledUpdate,
  setPendingUpdate,
  shouldAutoDownload,
  sweepStaleUpdateTmp,
} from "@/core/update";
import { IS_RELEASE } from "@/core/version";
import { useAppStore } from "@/ui/store";

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
// The last tag raised in the banner — a re-check must not resurrect a banner
// the user dismissed for the same tag; a genuinely newer tag re-raises it.
let advertisedTag: string | null = null;

/**
 * Start the boot check + 4h background loop. Idempotent, since BootFlow's
 * loading effect can re-run. Fail-silent throughout, like the boot check it
 * replaced — an update must never disturb the session.
 */
export function startUpdateScheduler(): void {
  if (started) return;
  started = true;
  // Clear any orphaned download temp files from a previous crashed session.
  sweepStaleUpdateTmp();
  // Dev preview of the installed banner + on-quit notice (never downloads —
  // the LEETTUI_FAKE_UPDATE analogue for the post-install stage).
  const fakeInstalled = process.env.LEETTUI_FAKE_INSTALLED;
  if (fakeInstalled) {
    setInstalledUpdate(fakeInstalled);
    useAppStore.getState().setUpdateInstalled(fakeInstalled);
  }
  void tick();
}

/** Stop the loop and reset its state (test/teardown hook). */
export function stopUpdateScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  started = false;
  advertisedTag = null;
}

// One check → advertise → auto-install pass, then self-reschedule. A
// setTimeout chain (not setInterval) so the next tick is armed only after this
// one — download included — fully settles; unref'd so a pending 4h timer can't
// hold the process open after the renderer is destroyed.
async function tick(): Promise<void> {
  try {
    const tag = await checkForUpdate();
    if (tag) await handleTag(tag);
  } catch {
    // Fail-silent by contract.
  }
  timer = setTimeout(() => void tick(), UPDATE_CHECK_INTERVAL_MS);
  timer.unref?.();
}

async function handleTag(tag: string): Promise<void> {
  const installedTag = getInstalledUpdate();
  // An equal-or-newer tag is already staged: the installed banner covers it —
  // don't re-advertise or re-download every tick.
  if (installedTag && !isNewerVersion(tag, installedTag)) return;
  // Park the on-quit reminder, independent of the banner's dismiss state.
  setPendingUpdate(tag);
  if (tag !== advertisedTag) {
    advertisedTag = tag;
    useAppStore.getState().setUpdateAvailable(tag);
  }
  const download = shouldAutoDownload({
    auto: getUpdateAuto(),
    isRelease: IS_RELEASE,
    assetSupported: selfUpdateSupported() !== null,
    tag,
    installedTag,
  });
  if (!download) return;
  const ok = await autoInstallUpdate(tag);
  if (ok) {
    setInstalledUpdate(tag);
    // Supersedes the available banner with the "restart to apply" CTA.
    useAppStore.getState().setUpdateInstalled(tag);
  }
}
