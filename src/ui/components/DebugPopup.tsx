import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import { debugBindings } from "../keymap";
import type { DebugEntry } from "../../debug";

interface DebugPopupProps {
  entries: DebugEntry[];
}

export function DebugPopup({ entries }: DebugPopupProps) {
  useBindings(() => ({ bindings: debugBindings }), []);
  const reversed = [...entries].reverse();

  return (
    <box
      position="absolute"
      left="10%"
      top="5%"
      width="80%"
      height="90%"
      borderStyle="rounded"
      borderColor={colors.error}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.error}> Debug Log ({entries.length} entries) </text>
      <scrollbox flexGrow={1}>
        {reversed.map((e, i) => {
          const modPart = e.mods ? `+${e.mods}` : "";
          const header = `[${e.ts}] key=${e.key}${modPart} mode=${e.mode} → ${e.action}`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only debug log render, entries are not reordered
            <box key={i} flexDirection="column">
              <text fg={e.error ? colors.error : colors.fg}>{` ${header}`}</text>
              {e.error?.split("\n").map((line, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered error lines that may repeat
                <text key={j} fg={colors.error}>{`   ${line}`}</text>
              ))}
            </box>
          );
        })}
        {entries.length === 0 && (
          <text fg={colors.fgDim}> No entries yet. Press keys to populate the log.</text>
        )}
      </scrollbox>
      <text fg={colors.fgDim}> y:Yank to file Esc/Enter:Close </text>
    </box>
  );
}
