import { useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { colors } from "@/ui/theme";
import { useAppStore } from "@/ui/store";
import { getSolutionsDir } from "@/config";
import { ghCloneArgv } from "@/core/git";
import { runRemotePull, runRemoteSync, type RemoteSyncResult } from "@/views/browse/handlers";

type Phase = "input" | "confirm" | "working" | "done";

const DEFAULT_NAME = "leetcode-solutions";

// Sync solutions FROM a GitHub remote (Stage 24) — the inverse of GitRemotePrompt.
// Adaptive on the probed direction (handleOpenGitSync sets gitSyncMode):
//   • clone (fresh/empty dir): name the repo → confirm the exact `gh repo clone` → run
//     it (gh's OWN auth) → outcome.
//   • pull (already-tracked dir): confirm the fast-forward pull → run `git pull
//     --ff-only` → outcome; a diverged history fails with an "open lazygit" hint, since
//     genuine merges still delegate to lazygit.
// Bare mode (no key-bearing layer mounted) → useKeyboard sees every key, like
// GitRemotePrompt / ChangeLocationPrompt. Nothing runs until "confirm".
export function GitSyncPrompt() {
  const { width } = useTerminalDimensions();
  const isPull = useAppStore((s) => s.gitSyncMode) === "pull";

  const repoRef = useRef(DEFAULT_NAME);
  // Pull needs no repo input, so it opens straight at "confirm".
  const [phase, setPhase] = useState<Phase>(isPull ? "confirm" : "input");
  const [repo, setRepo] = useState(DEFAULT_NAME);
  const [outcome, setOutcome] = useState<RemoteSyncResult | null>(null);

  const close = () => useAppStore.getState().hideGitSync();

  const submitRepo = (raw: string) => {
    const chosen = raw.trim() || DEFAULT_NAME;
    repoRef.current = chosen;
    setRepo(chosen);
    setPhase("confirm");
  };

  const execute = async () => {
    setPhase("working");
    setOutcome(isPull ? await runRemotePull() : await runRemoteSync(repoRef.current));
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
  const dir = getSolutionsDir();
  const cloneCommand = ghCloneArgv(repo, dir).join(" ");

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
      <text fg={colors.fgAccent}>Sync solutions from GitHub</text>
      <box height={1} />

      {phase === "input" && (
        <>
          <text fg={colors.subtle}>Clones your GitHub solutions repo into the solutions dir.</text>
          <text fg={colors.fgDim}>{dir}</text>
          <box height={1} />
          <text fg={colors.subtle}>Repository (OWNER/REPO, a URL, or a name in your account):</text>
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
              maxLength={200}
              onInput={(v: string) => {
                repoRef.current = v;
              }}
              onSubmit={() => submitRepo(repoRef.current)}
            />
          </box>
          <box height={1} />
          <text fg={colors.fgDim}>Uses your `gh` login (not your LeetCode session).</text>
          <text fg={colors.fgDim}>Enter: continue · Esc: cancel</text>
        </>
      )}

      {phase === "confirm" && (
        <>
          {isPull ? (
            <>
              <text fg={colors.subtle}>Fast-forward pull from your remote into:</text>
              <text fg={colors.fgDim}>{dir}</text>
              <box height={1} />
              <text fg={colors.accent}>git pull --ff-only</text>
            </>
          ) : (
            <>
              <text fg={colors.subtle}>This runs:</text>
              <box height={1} />
              <text fg={colors.accent}>{cloneCommand}</text>
            </>
          )}
          <box height={1} />
          <box flexDirection="row">
            <text fg={colors.success}>y</text>
            <text fg={colors.subtle}>: {isPull ? "pull" : "clone"} </text>
            <text fg={colors.error}>n</text>
            <text fg={colors.subtle}>: cancel</text>
          </box>
        </>
      )}

      {phase === "working" && (
        <text fg={colors.subtle}>{isPull ? "Pulling latest…" : `Cloning ${repo}…`}</text>
      )}

      {phase === "done" && outcome && (
        <>
          {outcome.kind === "cloned" && (
            <text fg={colors.success}>{`Cloned ${outcome.repo} into your solutions dir.`}</text>
          )}
          {outcome.kind === "pulled" && (
            <text fg={colors.success}>Synced — your solutions match the remote.</text>
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
              <text fg={colors.error}>{isPull ? "Couldn't pull:" : "Couldn't clone:"}</text>
              <text fg={colors.subtle}>{outcome.message}</text>
              {isPull && (
                <>
                  <box height={1} />
                  <text fg={colors.fgDim}>
                    Diverged or conflicted? Open lazygit (Ctrl+g) to merge.
                  </text>
                </>
              )}
            </>
          )}
          <box height={1} />
          <text fg={colors.fgDim}>Press any key to close.</text>
        </>
      )}
    </box>
  );
}
