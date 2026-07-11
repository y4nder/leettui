import { useCallback, useEffect, useRef, useState } from "react";
import type { createCliRenderer } from "@opentui/core";
import { useKeyboard } from "@opentui/react";

import { App } from "../../../app";
import { Splash } from "./Splash";
import { AuthWizard } from "./AuthWizard";
import { SyncStep } from "./SyncStep";
import { RelocatePrompt } from "./RelocatePrompt";
import { SolutionsOnboarding } from "./SolutionsOnboarding";
import { GitInitOnboarding } from "./GitInitOnboarding";
import { Logo } from "./Logo";
import { colors } from "../../theme";
import { loadConfig, hasTokens, getDbPath, getSolutionsDir } from "../../../config";
import { validateTokens, type AuthTokens } from "../../../core/auth";
import { initClient } from "../../../api/client";
import { openDatabase } from "../../../db";
import { hasAnySubmissions } from "../../../db/submissions";
import { syncIfEmpty } from "../../../core/sync";
import { migrateSolutionsLayout } from "../../../core/migration";
import { detectSolutionsRelocation, type RelocationPlan } from "../../../core/relocate";
import {
  checkForUpdate,
  fetchReleases,
  setPendingUpdate,
  shouldShowChangelog,
} from "../../../core/update";
import { IS_RELEASE, VERSION } from "../../../core/version";
import {
  getLastKnownSolutionsDir,
  setLastKnownSolutionsDir,
  getLastShownChangelogVersion,
  setLastShownChangelogVersion,
  getBackfillNudgeShown,
  setBackfillNudgeShown,
  shouldShowBackfillNudge,
} from "../../../core/session";
import { useAppStore } from "../../store";

type Phase =
  | "splash"
  | "auth"
  | "solutions"
  | "gitInit"
  | "loading"
  | "relocate"
  | "ready"
  | "error";

interface BootFlowProps {
  renderer: Awaited<ReturnType<typeof createCliRenderer>>;
  /** True when the `auth` subcommand forces re-authentication. */
  force: boolean;
}

// Boot state machine: splash → (auth) → loading (init client / open DB / sync) →
// ready (hand off to <App>). Replaces the pre-renderer auth + sync that used to run
// on the plain terminal, so the whole first-run is branded and animated.
export function BootFlow({ renderer, force }: BootFlowProps) {
  const [phase, setPhase] = useState<Phase>("splash");
  const [error, setError] = useState<string | null>(null);
  const tokensRef = useRef<AuthTokens | null>(null);
  const planRef = useRef<RelocationPlan | null>(null);
  // A brand-new install has empty tokens in config; existing users always carry
  // token *values* (even when expired), and `auth`-subcommand re-auth keeps this
  // false — so it gates the first-run solutions prompt to genuine first installs.
  const firstRunRef = useRef(false);

  const handleSplashDone = useCallback(async () => {
    const config = loadConfig();
    firstRunRef.current = !hasTokens(config);
    if (!force && hasTokens(config)) {
      const v = await validateTokens(config.csrftoken, config.lc_session);
      // An offline/"unknown" result keeps the saved session so the app still opens.
      if (v.status !== "invalid") {
        tokensRef.current = {
          csrftoken: config.csrftoken,
          lc_session: config.lc_session,
          username: v.status === "ok" ? v.username : "",
        };
        setPhase("loading");
        return;
      }
    }
    setPhase("auth");
  }, [force]);

  const handleAuthComplete = useCallback((t: AuthTokens) => {
    tokensRef.current = t;
    // Only brand-new installs get the "where should solutions live?" step.
    setPhase(firstRunRef.current ? "solutions" : "loading");
  }, []);

  const handleSolutionsChosen = useCallback(() => {
    // First installs continue to the git-init offer (Stage 22) before loading.
    setPhase("gitInit");
  }, []);

  const handleGitInitResolved = useCallback(() => {
    setPhase("loading");
  }, []);

  const handleAuthAbort = useCallback(() => {
    setError("Authentication is required to use leettui.");
    setPhase("error");
  }, []);

  // After the user moves or skips, the current dir becomes the new last-known
  // (so a skipped relocation isn't re-offered every boot — per the spec).
  const handleRelocationResolved = useCallback(() => {
    setLastKnownSolutionsDir(getSolutionsDir());
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;
    const tokens = tokensRef.current;
    if (!tokens) {
      setError("Internal error: missing tokens after auth.");
      setPhase("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        initClient(tokens.csrftoken, tokens.lc_session);
        // Non-blocking, fail-silent update check: lands in the store whenever it
        // resolves and the banner appears reactively. Never gates the ready hand-off.
        checkForUpdate()
          .then((tag) => {
            if (!tag) return;
            useAppStore.getState().setUpdateAvailable(tag);
            // Also park it for the on-quit reminder, independent of the
            // banner's session-only dismiss state.
            setPendingUpdate(tag);
          })
          .catch(() => {});
        // Post-update "What's new" (Stage 18): on the first launch after an
        // update, pop the release notes once — the *running* version emphasized,
        // past releases scrolling below — into a calm browse view. A fresh
        // install is seeded "caught up" so it doesn't pop on first launch;
        // recording VERSION unconditionally (below) keeps it strictly
        // once-per-version. The decision lives in the pure, tested
        // shouldShowChangelog; this block only owns the IS_RELEASE gate + fetch.
        // No per-tag fallback: the list endpoint fails under the same conditions
        // and this path is already fail-silent; if VERSION isn't in the first 10
        // the list still renders, just without the installed emphasis.
        if (IS_RELEASE) {
          const lastShown = getLastShownChangelogVersion();
          if (shouldShowChangelog(VERSION, lastShown, useAppStore.getState().mode)) {
            fetchReleases(10)
              .then((releases) => {
                // Re-validate mode (the fetch was async) so we don't pop over a
                // problem/modal the user opened meanwhile.
                if (useAppStore.getState().mode === "browse") {
                  useAppStore.getState().showChangelog({ releases, highlightTag: VERSION });
                }
              })
              .catch(() => {});
          }
          // MUST stay unconditional + outside the branch above: this both seeds a
          // fresh install ("caught up", undefined → VERSION) and marks an update's
          // changelog shown. Moving it inside `if (shouldShowChangelog)` would
          // leave a fresh install's flag undefined forever → the popup could never
          // fire on a later update (the seeding deadlock).
          setLastShownChangelogVersion(VERSION);
        }
        openDatabase(getDbPath());
        // One-time, idempotent migration of any legacy flat solution files into
        // the per-problem / per-language folder layout. Filesystem-only; the
        // no-op path on already-migrated installs is a single readdir.
        migrateSolutionsLayout();
        await syncIfEmpty((c, t) => useAppStore.getState().setSyncProgress(c, t));
        useAppStore.getState().clearSyncProgress();
        if (cancelled) return;
        // One-time first-run backfill nudge (D-01/D-02/D-03): offers to import
        // LeetCode submission history. Placed here (post-sync, post-openDatabase)
        // rather than alongside the changelog check above because `hasData` needs
        // the now-open DB. setBackfillNudgeShown() is UNCONDITIONAL — mirrors the
        // changelog's setLastShownChangelogVersion seeding invariant exactly: a
        // fresh install is seeded "caught up" (so it never pops on the very first
        // launch) and every subsequent launch has the flag already true, so the
        // nudge can fire at most once, ever.
        if (!getBackfillNudgeShown()) {
          const hasData = hasAnySubmissions();
          if (
            shouldShowBackfillNudge(getBackfillNudgeShown(), hasData, useAppStore.getState().mode)
          ) {
            useAppStore.getState().showBackfillNudge();
          }
          setBackfillNudgeShown();
        }
        // Did the resolved solutions dir move out from under us (incl. a
        // hand-edited config.toml)? If the old dir still holds problems, offer
        // to relocate them; otherwise just adopt the current dir as last-known.
        const plan = detectSolutionsRelocation(getSolutionsDir(), getLastKnownSolutionsDir());
        if (plan) {
          planRef.current = plan;
          setPhase("relocate");
        } else {
          setLastKnownSolutionsDir(getSolutionsDir());
          setPhase("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (phase === "splash") return <Splash onDone={handleSplashDone} />;
  if (phase === "auth")
    return <AuthWizard onComplete={handleAuthComplete} onAbort={handleAuthAbort} />;
  if (phase === "solutions")
    return <SolutionsOnboarding defaultDir={getSolutionsDir()} onDone={handleSolutionsChosen} />;
  if (phase === "gitInit") return <GitInitOnboarding onResolved={handleGitInitResolved} />;
  if (phase === "loading") return <SyncStep />;
  if (phase === "relocate" && planRef.current)
    return <RelocatePrompt plan={planRef.current} onResolved={handleRelocationResolved} />;
  if (phase === "error") return <BootError message={error ?? "Something went wrong."} />;
  return <App renderer={renderer} />;
}

function BootError({ message }: { message: string }) {
  useKeyboard(() => process.exit(1));
  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={colors.bg}
    >
      <Logo subtitle="" />
      <box height={1} />
      <text fg={colors.error}>{message}</text>
      <text fg={colors.fgDim}>Press any key to quit.</text>
    </box>
  );
}
