// Authentication flow: acquire validated LeetCode tokens and persist them.
//
// Strategy (decided in the plan):
//   1. Try Firefox cookie auto-import (zero copy-paste).
//   2. Fall back to a guided paste wizard (opens the browser, accepts a pasted
//      Cookie header / individual tokens).
// Every candidate is validated against LeetCode before it is saved, so we never
// persist tokens that don't actually work.
//
// Runs on the plain terminal (uses the global `prompt()` and stdout) — call it
// before the OpenTUI renderer is created, or from within a `renderer.suspend()`
// block (see handleReauth), exactly like the $EDITOR integration.

import { createClient, AuthError } from "../../api/client";
import { persistTokens } from "../../config";
import { readFirefoxCookies } from "./firefox";
import { parseCookieInput } from "./paste";

const VALIDATE_QUERY = "query globalData { userStatus { isSignedIn username } }";
export const LOGIN_URL = "https://leetcode.com/accounts/login/";
export const MAX_PASTE_ATTEMPTS = 3;

export interface AuthTokens {
  csrftoken: string;
  lc_session: string;
  username: string;
}

export type ValidateResult =
  | { status: "ok"; username: string }
  | { status: "invalid" } // reached LeetCode; session is not signed in
  | { status: "unknown" }; // could not reach LeetCode (offline / transient)

interface GlobalData {
  data?: { userStatus?: { isSignedIn?: boolean; username?: string } };
}

/** Validate a candidate token pair via a cheap `globalData` query. */
export async function validateTokens(csrf: string, session: string): Promise<ValidateResult> {
  if (!csrf || !session) return { status: "invalid" };
  try {
    const client = createClient(csrf, session);
    const res = await client.graphql<GlobalData>({ query: VALIDATE_QUERY });
    const us = res?.data?.userStatus;
    if (us?.isSignedIn) return { status: "ok", username: us.username ?? "" };
    return { status: "invalid" };
  } catch (e) {
    if (e instanceof AuthError) return { status: "invalid" };
    return { status: "unknown" };
  }
}

export function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    // unref() so this child (often the launched browser itself, which lives
    // until the user closes its window) doesn't keep our event loop alive and
    // block process exit on quit.
    Bun.spawn(cmd, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  } catch {
    // Non-fatal: the user can navigate manually.
  }
}

// Confirm, persist, and shape a validated token pair into the AuthTokens result.
function persistAndReturn(csrftoken: string, lc_session: string, username: string): AuthTokens {
  console.log(`✓ signed in as ${username || "(unknown user)"}`);
  persistTokens(csrftoken, lc_session);
  return { csrftoken, lc_session, username };
}

// Read one trimmed line; returns "" for empty/EOF (the caller treats "" as abort).
function promptRequired(label: string): string {
  return (prompt(label) ?? "").trim();
}

/**
 * Run the interactive auth flow on the plain terminal. Returns the validated,
 * persisted tokens, or `null` if the user aborts / it cannot complete.
 *
 * Used by the mid-session "Re-authenticate" command (Ctrl+P), which runs it inside a
 * `renderer.suspend()` block. First-run / boot authentication is handled in-renderer
 * by the onboarding `AuthWizard`, which reuses the same pure helpers in this module.
 */
export async function runAuthFlow(): Promise<AuthTokens | null> {
  console.log("\n🔐 leettui — LeetCode authentication\n");

  // 1. Firefox auto-import.
  const ff = readFirefoxCookies();
  if (ff) {
    process.stdout.write("Found LeetCode cookies in Firefox — verifying… ");
    const v = await validateTokens(ff.csrftoken, ff.lc_session);
    if (v.status === "ok") return persistAndReturn(ff.csrftoken, ff.lc_session, v.username);
    console.log("not a valid session (logged out or expired). Falling back to manual paste.\n");
  }

  // 2. Guided paste.
  openInBrowser(LOGIN_URL);
  console.log("Opened leetcode.com in your browser — log in there, then provide your cookies.\n");
  console.log("Two ways to do this:");
  console.log("  • Paste the whole Cookie header: DevTools (F12) → Network → click any");
  console.log("    leetcode.com request → Headers → Request Headers → copy the 'Cookie:' value.");
  console.log("  • Or enter the two tokens one at a time — just press Enter at the paste prompt.");
  console.log("    Find them in DevTools → Application → Cookies → https://leetcode.com.\n");

  for (let attempt = 0; attempt < MAX_PASTE_ATTEMPTS; attempt++) {
    const raw = prompt("Paste full Cookie value (or press Enter to type tokens individually): ");
    if (raw === null) {
      // Ctrl+D / EOF — treat as abort.
      console.log("Aborted.");
      return null;
    }

    // Prompt individually for whatever the paste didn't supply (an empty paste
    // supplies neither, so this is the "type tokens one at a time" path).
    const parsed = parseCookieInput(raw);
    const lc_session = parsed.lc_session || promptRequired("  LEETCODE_SESSION (empty to abort): ");
    const csrftoken = parsed.csrftoken || promptRequired("  csrftoken (empty to abort): ");
    if (!lc_session || !csrftoken) {
      console.log("Aborted.");
      return null;
    }

    process.stdout.write("Verifying… ");
    const v = await validateTokens(csrftoken, lc_session);
    if (v.status === "ok") return persistAndReturn(csrftoken, lc_session, v.username);
    if (v.status === "invalid") {
      console.log("✗ not a valid logged-in session — make sure you're logged in, then try again.\n");
    } else {
      console.log("✗ couldn't reach LeetCode to verify (network?). Try again.\n");
    }
  }

  console.log("Too many attempts — aborting.");
  return null;
}
