import { useCallback, useEffect, useRef, useState } from "react";
import type { createCliRenderer } from "@opentui/core";
import { useKeyboard } from "@opentui/react";

import { App } from "../../../app";
import { Splash } from "./Splash";
import { AuthWizard } from "./AuthWizard";
import { SyncStep } from "./SyncStep";
import { RelocatePrompt } from "./RelocatePrompt";
import { Logo } from "./Logo";
import { colors } from "../../theme";
import { loadConfig, hasTokens, getDbPath, getSolutionsDir } from "../../../config";
import { validateTokens, type AuthTokens } from "../../../core/auth";
import { initClient } from "../../../api/client";
import { openDatabase } from "../../../db";
import { syncIfEmpty } from "../../../core/sync";
import { migrateSolutionsLayout } from "../../../core/migration";
import { detectSolutionsRelocation, type RelocationPlan } from "../../../core/relocate";
import { getLastKnownSolutionsDir, setLastKnownSolutionsDir } from "../../../core/session";
import { useAppStore } from "../../store";

type Phase = "splash" | "auth" | "loading" | "relocate" | "ready" | "error";

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

  const handleSplashDone = useCallback(async () => {
    const config = loadConfig();
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
        openDatabase(getDbPath());
        // One-time, idempotent migration of any legacy flat solution files into
        // the per-problem / per-language folder layout. Filesystem-only; the
        // no-op path on already-migrated installs is a single readdir.
        migrateSolutionsLayout();
        await syncIfEmpty((c, t) => useAppStore.getState().setSyncProgress(c, t));
        useAppStore.getState().clearSyncProgress();
        if (cancelled) return;
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
  if (phase === "auth") return <AuthWizard onComplete={handleAuthComplete} onAbort={handleAuthAbort} />;
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
