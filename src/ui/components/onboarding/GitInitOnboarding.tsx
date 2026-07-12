import { useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { Logo } from "@/ui/components/onboarding/Logo";
import { colors } from "@/ui/theme";
import { getSolutionsDir } from "@/config";
import type { GitOpResult } from "@/core/git";
import {
  runRemoteSync,
  scaffoldSolutionsGit,
  type RemoteSyncResult,
} from "@/views/browse/handlers";

interface GitInitOnboardingProps {
  /** Called once the user resolves the step (initialized, cloned, or skipped). */
  onResolved: () => void;
}

const DEFAULT_NAME = "leetcode-solutions";

type Phase = "choose" | "input" | "working" | "result";
type Outcome = { mode: "init"; res: GitOpResult } | { mode: "clone"; res: RemoteSyncResult };

// First-run-only "version-control your solutions?" step (Stage 22; clone path added
// Stage 24). Genuine first installs only (gated by the same firstRunRef as
// SolutionsOnboarding, so it never re-nags). Three ways to resolve:
//   [i] start a new local repo (scaffoldSolutionsGit)
//   [c] clone an existing GitHub backup into the (still-empty) dir — the
//       fresh-machine RESTORE, reusing the Stage 24 runRemoteSync clone path (gh's
//       own auth, never the LeetCode session)
//   [n] skip (Ctrl+g / palette can set it up later, so skipping costs nothing)
// Clone MUST be offered here, before any git init: once a local repo exists Sync
// takes the pull path and can't clone into it, so restore has to happen first.
export function GitInitOnboarding({ onResolved }: GitInitOnboardingProps) {
  const { width } = useTerminalDimensions();
  const dir = getSolutionsDir();
  const repoRef = useRef(DEFAULT_NAME);
  const [repo, setRepo] = useState(DEFAULT_NAME);
  const [phase, setPhase] = useState<Phase>("choose");
  const [busy, setBusy] = useState<"init" | "clone" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const startInit = () => {
    setBusy("init");
    setPhase("working");
    scaffoldSolutionsGit().then((res) => {
      setOutcome({ mode: "init", res });
      setPhase("result");
    });
  };

  const startClone = (raw: string) => {
    const chosen = raw.trim() || DEFAULT_NAME;
    repoRef.current = chosen;
    setRepo(chosen);
    setBusy("clone");
    setPhase("working");
    runRemoteSync(chosen).then((res) => {
      setOutcome({ mode: "clone", res });
      setPhase("result");
    });
  };

  useKeyboard((key) => {
    if (phase === "working") return; // in flight — ignore keys
    if (phase === "result") {
      onResolved(); // any key continues past the result line
      return;
    }
    if (phase === "input") {
      if (key.name === "escape") setPhase("choose"); // typing/Enter → <input>; Esc backs out
      return;
    }
    // choose
    if (key.name === "i" || key.name === "return") startInit();
    else if (key.name === "c") setPhase("input");
    else if (key.name === "n" || key.name === "escape") onResolved();
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

      {phase === "choose" && (
        <>
          <text fg={colors.subtle}>Version-control your solutions?</text>
          <box height={1} />
          <text fg={colors.fgDim}>{dir}</text>
          <box height={1} />
          <box flexDirection="column">
            <box flexDirection="row">
              <text fg={colors.success}>i</text>
              <text fg={colors.subtle}> · Start a new git repo</text>
            </box>
            <box flexDirection="row">
              <text fg={colors.accent}>c</text>
              <text fg={colors.subtle}> · Clone from a GitHub remote </text>
              <text fg={colors.fgDim}>(restore a backup)</text>
            </box>
            <box flexDirection="row">
              <text fg={colors.error}>n</text>
              <text fg={colors.subtle}> · Skip</text>
            </box>
          </box>
          <box height={1} />
          <text fg={colors.fgDim}>i/Enter: new repo · c: clone · n/Esc: skip</text>
        </>
      )}

      {phase === "input" && (
        <>
          <box flexDirection="column" width={inputWidth}>
            <text fg={colors.subtle}>Clone which GitHub repo?</text>
            <text fg={colors.fgDim}>OWNER/REPO, a URL, or a name in your account.</text>
          </box>
          <box height={1} />
          <box
            borderStyle="rounded"
            borderColor={colors.borderFocused}
            width={inputWidth}
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
              onSubmit={() => startClone(repoRef.current)}
            />
          </box>
          <box height={1} />
          <text fg={colors.fgDim}>Uses your `gh` login (not your LeetCode session).</text>
          <text fg={colors.fgDim}>Enter: clone · Esc: back</text>
        </>
      )}

      {phase === "working" && (
        <text fg={colors.subtle}>
          {busy === "clone" ? `Cloning ${repo}…` : "Initializing git repository…"}
        </text>
      )}

      {phase === "result" && outcome && (
        <>
          {outcome.mode === "init" &&
            (outcome.res.ok ? (
              <text fg={colors.success}>Initialized a git repository for your solutions.</text>
            ) : (
              <>
                <text fg={colors.warn}>
                  Couldn't initialize git — you can set it up later with Ctrl+g.
                </text>
                <text fg={colors.fgDim}>{outcome.res.output}</text>
              </>
            ))}

          {outcome.mode === "clone" && <CloneResult res={outcome.res} />}

          <box height={1} />
          <text fg={colors.fgDim}>Press any key to continue.</text>
        </>
      )}
    </box>
  );
}

// The clone outcome lines. runRemoteSync only yields cloned/gh-missing/not-authed/
// error (never "pulled"); a failed clone leaves the dir empty (git clone cleans up),
// so continuing lands in a usable empty dir the user can retry from the palette.
function CloneResult({ res }: { res: RemoteSyncResult }) {
  if (res.kind === "cloned") {
    return <text fg={colors.success}>{`Cloned ${res.repo} into your solutions dir.`}</text>;
  }
  if (res.kind === "not-authed") {
    return (
      <>
        <text fg={colors.warn}>GitHub CLI isn't logged in.</text>
        <text fg={colors.subtle}>
          Run `gh auth login`, then retry from the palette (Ctrl+P → Sync).
        </text>
      </>
    );
  }
  if (res.kind === "gh-missing") {
    return (
      <>
        {res.instructions.split("\n").map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered lines
          <text key={i} fg={line.trim().startsWith("git ") ? colors.accent : colors.subtle}>
            {line || " "}
          </text>
        ))}
      </>
    );
  }
  return (
    <>
      <text fg={colors.error}>Couldn't clone:</text>
      <text fg={colors.subtle}>{res.kind === "error" ? res.message : ""}</text>
      <text fg={colors.fgDim}>
        You can retry later from the palette (Ctrl+P → Sync solutions from GitHub).
      </text>
    </>
  );
}
