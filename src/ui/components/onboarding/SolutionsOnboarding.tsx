import { useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { persistSolutionsDir } from "../../../config";

interface SolutionsOnboardingProps {
  /** The resolved default solutions dir, pre-filled into the input. */
  defaultDir: string;
  /** Called once the choice is made (persisted or default-accepted). */
  onDone: () => void;
}

// First-run prompt (Stage 10 item 3): where should solutions live? The input is
// pre-filled with the XDG default, so Enter accepts it unchanged (existing-user
// behavior, no config write). Typing a path persists it to `[paths] solutions`
// via the comment-preserving rewrite, which resets the config memo so the rest
// of boot (last-known recording) sees the chosen dir. Esc also accepts default.
export function SolutionsOnboarding({ defaultDir, onDone }: SolutionsOnboardingProps) {
  const valueRef = useRef(defaultDir);
  const { width } = useTerminalDimensions();

  const choose = (raw: string) => {
    const chosen = raw.trim() || defaultDir;
    // Only write when it actually differs — keeps the default config clean and
    // leaves existing/default users with no `[paths]` section at all.
    if (chosen !== defaultDir) persistSolutionsDir(chosen);
    onDone();
  };

  useKeyboard((key) => {
    if (key.name === "escape") onDone(); // accept the default, write nothing
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
        <text fg={colors.success}>● Sign in</text>
        <text fg={colors.accent}>● Solutions folder</text>
        <text fg={colors.fgDim}>○ Sync problems</text>
      </box>
      <box height={1} />

      <box flexDirection="column" width={inputWidth}>
        <text fg={colors.subtle}>Where should your solutions live?</text>
        <text fg={colors.fgDim}>
          Tip: point this at a git repo to version-control and push your work.
        </text>
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
          value={defaultDir}
          placeholder={defaultDir}
          maxLength={4096}
          onInput={(v: string) => {
            valueRef.current = v;
          }}
          onSubmit={() => choose(valueRef.current)}
        />
      </box>

      <box height={1} />
      <text fg={colors.fgDim}>
        ~ and $VARS are expanded; a relative path resolves against your home dir.
      </text>
      <text fg={colors.fgDim}>Enter: use this folder · Esc: use the default</text>
    </box>
  );
}
