import { useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { resolve } from "node:path";

import { colors } from "@/ui/theme";
import { useAppStore } from "@/ui/store";
import { getSolutionsDir } from "@/config";
import { resolveConfigPath } from "@/config/resolvePath";
import { countProblemFolders } from "@/core/relocate";
import { changeSolutionsDir, type ChangeLocationOutcome } from "@/views/browse/handlers";

type Phase = "input" | "confirm" | "done";

// In-TUI "change solutions directory" action (Stage 10 item 4), opened from the
// command palette. Three self-contained phases (mirrors the boot RelocatePrompt's
// internal sub-state, so no extra store coupling): type a new path → confirm the
// change + migration → see the {moved, skipped} result. The actual persist+move
// is the gated `changeSolutionsDir` handler; nothing is written until "confirm".
export function ChangeLocationPrompt() {
  const currentDir = getSolutionsDir();
  const valueRef = useRef(currentDir);
  const { width } = useTerminalDimensions();
  const [phase, setPhase] = useState<Phase>("input");
  // Target details computed at submit, shown on the confirm screen (display only;
  // `changeSolutionsDir` recomputes them from the same raw value when executing).
  const [pending, setPending] = useState<{ toDir: string; count: number } | null>(null);
  const [outcome, setOutcome] = useState<ChangeLocationOutcome | null>(null);

  const close = () => useAppStore.getState().hideRelocate();

  const submitPath = (raw: string) => {
    const chosen = raw.trim() || currentDir;
    valueRef.current = chosen; // freeze the chosen raw value for the execute step
    const toDir = resolveConfigPath(chosen);
    if (resolve(currentDir) === resolve(toDir)) {
      // No change — short-circuit to a "nothing to do" result, writing nothing.
      setOutcome({
        status: "unchanged",
        fromDir: currentDir,
        toDir,
        result: { moved: 0, skipped: 0 },
      });
      setPhase("done");
      return;
    }
    setPending({ toDir, count: countProblemFolders(currentDir) });
    setPhase("confirm");
  };

  const execute = () => {
    const out = changeSolutionsDir(valueRef.current);
    // A relocated tree changes which problems show the "solution exists" marker.
    useAppStore.getState().refreshSolutionFiles();
    setOutcome(out);
    setPhase("done");
  };

  useKeyboard((key) => {
    if (phase === "done") {
      close(); // any key dismisses the result summary
      return;
    }
    if (phase === "input") {
      if (key.name === "escape") close(); // typing flows to <input>; Enter → onSubmit
      return;
    }
    // confirm
    if (key.name === "y" || key.name === "return") execute();
    else if (key.name === "n" || key.name === "escape") close();
  });

  const boxWidth = Math.min(80, Math.max(40, width - 8));

  return (
    <box
      position="absolute"
      left="50%"
      top="30%"
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
      <text fg={colors.fgAccent}>Change solutions directory</text>
      <box height={1} />

      {phase === "input" && (
        <>
          <text fg={colors.subtle}>Enter a new path. Existing problems will be moved there.</text>
          <box height={1} />
          <box
            borderStyle="rounded"
            borderColor={colors.border}
            height={3}
            paddingLeft={1}
            paddingRight={1}
          >
            <input
              focused
              value={currentDir}
              placeholder={currentDir}
              maxLength={4096}
              onInput={(v: string) => {
                valueRef.current = v;
              }}
              onSubmit={() => submitPath(valueRef.current)}
            />
          </box>
          <box height={1} />
          <text fg={colors.fgDim}>
            ~ and $VARS are expanded; a relative path resolves against your home dir.
          </text>
          <text fg={colors.fgDim}>
            Tip: point this at a git repo to version-control and push your work.
          </text>
          <text fg={colors.fgDim}>Enter: continue · Esc: cancel</text>
        </>
      )}

      {phase === "confirm" && pending && (
        <>
          <text fg={colors.fgDim}>{`from  ${currentDir}`}</text>
          <text fg={colors.accent}>{`to    ${pending.toDir}`}</text>
          <box height={1} />
          <text fg={colors.subtle}>
            {pending.count > 0
              ? `${pending.count} problem folder${pending.count === 1 ? "" : "s"} will be moved to the new location.`
              : "No existing solutions to move — future solutions will be saved here."}
          </text>
          <box height={1} />
          <box flexDirection="row">
            <text fg={colors.success}>y</text>
            <text fg={colors.subtle}>: change &amp; move </text>
            <text fg={colors.error}>n</text>
            <text fg={colors.subtle}>: cancel</text>
          </box>
        </>
      )}

      {phase === "done" && outcome && (
        <>
          {outcome.status === "unchanged" ? (
            <text fg={colors.subtle}>Already using this location. Nothing changed.</text>
          ) : (
            <>
              {/* `moved` counts every top-level entry (problem folders plus any
                  shared files like `.git`), so it reads "items", not "folders" —
                  same honest phrasing as the boot RelocatePrompt. */}
              <text fg={colors.success}>
                {`Moved ${outcome.result.moved} item${outcome.result.moved === 1 ? "" : "s"} to ${outcome.toDir}.`}
              </text>
              {outcome.result.skipped > 0 ? (
                <text fg={colors.warn}>
                  {`${outcome.result.skipped} left at the previous location (already present there, or unreadable).`}
                </text>
              ) : null}
            </>
          )}
          <box height={1} />
          <text fg={colors.fgDim}>Press any key to close.</text>
        </>
      )}
    </box>
  );
}
