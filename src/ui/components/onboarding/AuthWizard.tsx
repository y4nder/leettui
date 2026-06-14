import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { persistTokens } from "../../../config";
import { readFirefoxCookies } from "../../../core/auth/firefox";
import { parseCookieInput } from "../../../core/auth/paste";
import {
  validateTokens,
  openInBrowser,
  LOGIN_URL,
  MAX_PASTE_ATTEMPTS,
  type AuthTokens,
} from "../../../core/auth";

interface AuthWizardProps {
  onComplete: (tokens: AuthTokens) => void;
  onAbort: () => void;
}

type Tone = "info" | "ok" | "err";
interface Msg {
  text: string;
  tone: Tone;
}

const toneColor = (tone: Tone) =>
  tone === "ok" ? colors.success : tone === "err" ? colors.error : colors.subtle;

// In-renderer reimplementation of the auth flow's UX. Reuses the same pure helpers
// as the headless flow (`readFirefoxCookies`, `validateTokens`, `parseCookieInput`,
// `persistTokens`, `openInBrowser`) — only the I/O moves from prompt()/stdout to
// OpenTUI components. Stage 1 tries the Firefox cookie import; stage 2 is the guided
// paste. A single input accepts a full Cookie header or one token at a time.
export function AuthWizard({ onComplete, onAbort }: AuthWizardProps) {
  const [stage, setStage] = useState<"checking" | "paste" | "verifying">("checking");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [creds, setCreds] = useState<{ csrf: string; session: string }>({ csrf: "", session: "" });
  const [inputKey, setInputKey] = useState(0);
  const attempts = useRef(0);
  const browserOpened = useRef(false);
  const valueRef = useRef("");
  const { width } = useTerminalDimensions();

  const push = (m: Msg) => setMessages((prev) => [...prev.slice(-4), m]);

  const enterPaste = () => {
    if (!browserOpened.current) {
      browserOpened.current = true;
      openInBrowser(LOGIN_URL);
      push({ text: "Opened leetcode.com — log in there, then paste your cookie below.", tone: "info" });
    }
    setStage("paste");
  };

  const verify = async (csrf: string, session: string) => {
    setStage("verifying");
    const v = await validateTokens(csrf, session);
    if (v.status === "ok") {
      persistTokens(csrf, session);
      onComplete({ csrftoken: csrf, lc_session: session, username: v.username });
      return;
    }
    attempts.current += 1;
    if (attempts.current >= MAX_PASTE_ATTEMPTS) {
      push({ text: "Too many attempts — aborting.", tone: "err" });
      onAbort();
      return;
    }
    push({
      text:
        v.status === "invalid"
          ? "✗ Not a valid logged-in session — make sure you're logged in, then try again."
          : "✗ Couldn't reach LeetCode to verify (network?). Try again.",
      tone: "err",
    });
    setCreds({ csrf: "", session: "" });
    setInputKey((k) => k + 1);
    setStage("paste");
  };

  // Stage 1: Firefox auto-import on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ff = readFirefoxCookies();
      if (ff) {
        push({ text: "Found LeetCode cookies in Firefox — verifying…", tone: "info" });
        const v = await validateTokens(ff.csrftoken, ff.lc_session);
        if (cancelled) return;
        if (v.status === "ok") {
          persistTokens(ff.csrftoken, ff.lc_session);
          onComplete({ csrftoken: ff.csrftoken, lc_session: ff.lc_session, username: v.username });
          return;
        }
        push({ text: "That Firefox session is logged out or expired — switching to manual paste.", tone: "info" });
      }
      if (!cancelled) enterPaste();
    })();
    return () => {
      cancelled = true;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = () => {
    const value = valueRef.current.trim();
    valueRef.current = "";
    setInputKey((k) => k + 1);
    if (!value) return;

    // Merge anything parseable; a bare value (no "=") fills whichever token is missing.
    const parsed = parseCookieInput(value);
    let csrf = creds.csrf || parsed.csrftoken || "";
    let session = creds.session || parsed.lc_session || "";
    if (!parsed.csrftoken && !parsed.lc_session && !value.includes("=")) {
      if (!session) session = value;
      else if (!csrf) csrf = value;
    }
    setCreds({ csrf, session });

    if (csrf && session) {
      void verify(csrf, session);
      return;
    }
    push({
      text: session
        ? "Got LEETCODE_SESSION ✓ — now paste your csrftoken."
        : csrf
          ? "Got csrftoken ✓ — now paste your LEETCODE_SESSION."
          : "Couldn't find tokens there. Paste the full Cookie header, or one token at a time.",
      tone: session || csrf ? "ok" : "err",
    });
  };

  useKeyboard((key) => {
    if (key.name === "escape") onAbort();
  });

  const inputWidth = Math.min(64, Math.max(24, width - 12));

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

      <box flexDirection="row" gap={3}>
        <text fg={colors.accent}>● Sign in</text>
        <text fg={colors.fgDim}>○ Sync problems</text>
      </box>
      <box height={1} />

      <box flexDirection="column" width={inputWidth}>
        {messages.map((m, i) => (
          <text key={i} fg={toneColor(m.tone)}>
            {m.text}
          </text>
        ))}
      </box>

      {stage === "verifying" || stage === "checking" ? (
        <text fg={colors.info}>{stage === "verifying" ? "Verifying…" : "Looking for a saved session…"}</text>
      ) : (
        <box
          borderStyle="rounded"
          borderColor={colors.borderFocused}
          width={inputWidth}
          height={3}
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            key={inputKey}
            focused={stage === "paste"}
            placeholder="Paste Cookie header (or a single token)…"
            maxLength={20000}
            onInput={(v: string) => {
              valueRef.current = v;
            }}
            onSubmit={handleSubmit}
          />
        </box>
      )}

      <box height={1} />
      <text fg={colors.fgDim}>
        Cookie header: DevTools (F12) → Network → any leetcode.com request → Request Headers → "Cookie"
      </text>
      <text fg={colors.fgDim}>Enter: submit  ·  Esc: cancel</text>
    </box>
  );
}
