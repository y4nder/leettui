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
import { persistTokens, hasTokens } from "../../config";
import type { Config } from "../../config/types";
import { readFirefoxCookies } from "./firefox";
import { parseCookieInput } from "./paste";

const VALIDATE_QUERY = "query globalData { userStatus { isSignedIn username } }";
const LOGIN_URL = "https://leetcode.com/accounts/login/";
const MAX_PASTE_ATTEMPTS = 3;

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

function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
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
 * Ensure usable tokens exist before anything talks to LeetCode. Validates saved
 * tokens (unless `force`d) and only prompts when they are missing or definitively
 * invalid — an "unknown" (offline) result keeps the saved tokens so the app still
 * opens without a network connection. Returns the tokens, or `null` if auth fails.
 */
export async function ensureAuthenticated(config: Config, opts: { force: boolean }): Promise<AuthTokens | null> {
  if (!opts.force && hasTokens(config)) {
    const v = await validateTokens(config.csrftoken, config.lc_session);
    if (v.status !== "invalid") {
      return {
        csrftoken: config.csrftoken,
        lc_session: config.lc_session,
        username: v.status === "ok" ? v.username : "",
      };
    }
    console.log("Your saved LeetCode session is no longer valid — re-authenticating.\n");
  }
  return runAuthFlow();
}

/**
 * Run the interactive auth flow. Returns the validated, persisted tokens, or
 * `null` if the user aborts / it cannot complete.
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
