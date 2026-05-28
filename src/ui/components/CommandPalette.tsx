import { useMemo, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { colors } from "../theme";
import { browseActions, type ActionId, type ActionMeta } from "../keymap";
import { fuzzyMatch } from "../../core/search";
import { useAppStore } from "../store";

interface CommandPaletteProps {
  onRun: (action: ActionId) => void;
}

function filterActions(actions: ActionMeta[], needle: string): ActionMeta[] {
  if (!needle.trim()) return actions;
  return actions
    .map((a) => ({ a, score: Math.max(fuzzyMatch(needle, a.title), fuzzyMatch(needle, a.id)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.a);
}

export function CommandPalette({ onRun }: CommandPaletteProps) {
  const [needle, setNeedle] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const all = useMemo(() => browseActions(), []);
  const filtered = useMemo(() => filterActions(all, needle), [all, needle]);

  const clampedIndex = filtered.length === 0
    ? 0
    : Math.min(selectedIndex, filtered.length - 1);

  useKeyboard((event) => {
    if (event.eventType !== "press") return;
    const name = event.name ?? "";

    switch (name) {
      case "escape":
        useAppStore.getState().hidePalette();
        return;
      case "return":
        if (filtered.length > 0) {
          const action = filtered[clampedIndex]!;
          onRun(action.id);
        }
        return;
      case "j":
      case "down":
        setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      case "k":
      case "up":
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      case "backspace":
        setNeedle((n) => n.slice(0, -1));
        setSelectedIndex(0);
        return;
    }

    if (name.length === 1 && !event.ctrl && !event.meta) {
      setNeedle((n) => n + name);
      setSelectedIndex(0);
    }
  });

  return (
    <box
      position="absolute"
      left="20%"
      top="15%"
      width="60%"
      height="70%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> Command Palette </text>
      <box flexDirection="row" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}> &gt; </text>
        <text fg={colors.fg}>{needle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
      <scrollbox flexGrow={1}>
        {filtered.length === 0 ? (
          <text fg={colors.fgDim}>   (no matches)</text>
        ) : (
          filtered.map((a, i) => {
            const selected = i === clampedIndex;
            return (
              <text
                key={a.id}
                fg={selected ? colors.fgAccent : colors.fg}
                bg={selected ? colors.bgHighlight : undefined}
              >
                {`${selected ? " ► " : "   "}${a.title.padEnd(40)}  ${a.display}`}
              </text>
            );
          })
        )}
      </scrollbox>
      <text fg={colors.fgDim}> Type:Filter j/k:Navigate Enter:Run Esc:Cancel </text>
    </box>
  );
}
