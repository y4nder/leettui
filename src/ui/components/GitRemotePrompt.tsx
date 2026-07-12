import { useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { colors } from "@/ui/theme";
import { useAppStore } from "@/ui/store";
import { getSolutionsDir } from "@/config";
import { ghCreateArgv } from "@/core/git";
import { runRemoteSetup, type RemoteSetupResult } from "@/views/browse/handlers";

type Phase = "input" | "confirm" | "working" | "done";

const DEFAULT_NAME = "leetcode-solutions";

// Opt-in, one-time "back up my solutions to GitHub" wizard (Stage 22). Three
// self-contained phases like ChangeLocationPrompt: name the repo → confirm the
// exact `gh repo create` command → run it and show the outcome. The work is the
// gated `runRemoteSetup` handler (ensureSolutionsRepo → commit → gh repo create);
// nothing runs until "confirm". Uses gh's OWN auth, never the LeetCode session.
// Degrades cleanly when gh is missing (prints the manual commands) or not logged
// in (points at `gh auth login`). Bare mode → useKeyboard sees every key.
export function GitRemotePrompt() {
  const { width } = useTerminalDimensions();
  const nameRef = useRef(DEFAULT_NAME);
  const [phase, setPhase] = useState<Phase>("input");
  const [name, setName] = useState(DEFAULT_NAME);
  const [outcome, setOutcome] = useState<RemoteSetupResult | null>(null);

  const close = () => useAppStore.getState().hideGitRemote();

  const submitName = (raw: string) => {
    const chosen = raw.trim() || DEFAULT_NAME;
    nameRef.current = chosen;
    setName(chosen);
    setPhase("confirm");
  };

  const execute = async () => {
    setPhase("working");
    setOutcome(await runRemoteSetup(nameRef.current));
    setPhase("done");
  };

  useKeyboard((key) => {
    if (phase === "working") return; // in flight — ignore keys
    if (phase === "done") {
      close(); // any key dismisses the result
      return;
    }
    if (phase === "input") {
      if (key.name === "escape") close(); // typing flows to <input>; Enter → onSubmit
      return;
    }
    // confirm
    if (key.name === "y" || key.name === "return") void execute();
    else if (key.name === "n" || key.name === "escape") close();
  });

  const boxWidth = Math.min(84, Math.max(44, width - 8));
  const ghCommand = ghCreateArgv(name, { private: true }).join(" ");

  return (
    <box
      position="absolute"
      left="50%"
      top="28%"
      width={boxWidth}
      marginLeft={-Math.floor(boxWidth / 2)}
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <text fg={colors.fgAccent}>Back up solutions to GitHub</text>
      <box height={1} />

      {phase === "input" && (
        <>
          <text fg={colors.subtle}>
            Creates a private GitHub repo from your solutions dir and pushes it.
          </text>
          <text fg={colors.fgDim}>{getSolutionsDir()}</text>
          <box height={1} />
          <text fg={colors.subtle}>Repository name:</text>
          <box
            borderStyle="rounded"
            borderColor={colors.border}
            height={3}
            paddingLeft={1}
            paddingRight={1}
          >
            <input
              focused
              value={DEFAULT_NAME}
              placeholder={DEFAULT_NAME}
              maxLength={100}
              onInput={(v: string) => {
                nameRef.current = v;
              }}
              onSubmit={() => submitName(nameRef.current)}
            />
          </box>
          <box height={1} />
          <text fg={colors.fgDim}>Uses your `gh` login (not your LeetCode session).</text>
          <text fg={colors.fgDim}>Enter: continue · Esc: cancel</text>
        </>
      )}

      {phase === "confirm" && (
        <>
          <text fg={colors.subtle}>This runs:</text>
          <box height={1} />
          <text fg={colors.accent}>{ghCommand}</text>
          <box height={1} />
          <box flexDirection="row">
            <text fg={colors.success}>y</text>
            <text fg={colors.subtle}>: create &amp; push </text>
            <text fg={colors.error}>n</text>
            <text fg={colors.subtle}>: cancel</text>
          </box>
        </>
      )}

      {phase === "working" && <text fg={colors.subtle}>{`Creating ${name} and pushing…`}</text>}

      {phase === "done" && outcome && (
        <>
          {outcome.kind === "ok" && (
            <text
              fg={colors.success}
            >{`Pushed to GitHub as a private repo: ${outcome.name}.`}</text>
          )}
          {outcome.kind === "not-authed" && (
            <>
              <text fg={colors.warn}>GitHub CLI isn't logged in.</text>
              <text fg={colors.subtle}>Run `gh auth login`, then try again.</text>
            </>
          )}
          {outcome.kind === "gh-missing" &&
            outcome.instructions.split("\n").map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered lines
              <text key={i} fg={line.trim().startsWith("git ") ? colors.accent : colors.subtle}>
                {line || " "}
              </text>
            ))}
          {outcome.kind === "error" && (
            <>
              <text fg={colors.error}>Couldn't set up the remote:</text>
              <text fg={colors.subtle}>{outcome.message}</text>
            </>
          )}
          <box height={1} />
          <text fg={colors.fgDim}>Press any key to close.</text>
        </>
      )}
    </box>
  );
}
