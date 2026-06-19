import { useState } from "react";
import { useKeyboard } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { getGitUiCommand, getSolutionsDir } from "../../../config";
import { scaffoldSolutionsGit } from "../../../views/browse/handlers";
import type { GitOpResult } from "../../../core/git";

interface GitInitOnboardingProps {
  /** Called once the user resolves the step (initialized or skipped). */
  onResolved: () => void;
}

// First-run-only "version-control your solutions?" step (Stage 22), shown right
// after the solutions dir is chosen — genuine first installs only, gated by the
// same firstRunRef as SolutionsOnboarding, so it never re-nags. y/Enter scaffolds
// the repo (git init + defensive .gitignore + first commit) via the shared
// `scaffoldSolutionsGit` seam; n/Esc skips. Either way boot continues to loading;
// the in-app Ctrl+g flow can set it up later, so skipping costs nothing.
export function GitInitOnboarding({ onResolved }: GitInitOnboardingProps) {
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<GitOpResult | null>(null);
  const dir = getSolutionsDir();
  const gitUi = getGitUiCommand();

  useKeyboard((key) => {
    if (working) return;
    if (result) {
      onResolved(); // any key continues past the result line
      return;
    }
    if (key.name === "y" || key.name === "return") {
      setWorking(true);
      scaffoldSolutionsGit().then((res) => {
        setWorking(false);
        setResult(res);
      });
    } else if (key.name === "n" || key.name === "escape") {
      onResolved();
    }
  });

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
      {working ? (
        <text fg={colors.subtle}>Initializing git repository…</text>
      ) : result ? (
        <>
          {result.ok ? (
            <text fg={colors.success}>Initialized a git repository for your solutions.</text>
          ) : (
            <>
              <text fg={colors.warn}>
                Couldn't initialize git — you can set it up later with Ctrl+g.
              </text>
              <text fg={colors.fgDim}>{result.output}</text>
            </>
          )}
          <text fg={colors.fgDim}>Press any key to continue.</text>
        </>
      ) : (
        <>
          <text fg={colors.subtle}>Version-control your solutions with git?</text>
          <box height={1} />
          <text fg={colors.fgDim}>{dir}</text>
          <box height={1} />
          <text fg={colors.subtle}>
            {`Runs git init + a safe .gitignore so you can commit and push (open ${gitUi} anytime with Ctrl+g).`}
          </text>
          <box height={1} />
          <box flexDirection="row">
            <text fg={colors.subtle}>Initialize now? </text>
            <text fg={colors.success}>y</text>
            <text fg={colors.subtle}>es</text>
            <text fg={colors.fgDim}> / </text>
            <text fg={colors.error}>n</text>
            <text fg={colors.subtle}>o (skip)</text>
          </box>
        </>
      )}
    </box>
  );
}
