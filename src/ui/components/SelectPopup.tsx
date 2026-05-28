import { useState } from "react";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";

interface SelectPopupProps {
  title: string;
  items: string[];
  onSelect: (index: number | null) => void;
}

export function SelectPopup({ title, items, onSelect }: SelectPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useBindings(
    () => ({
      bindings: [
        { key: "j",       cmd: () => setSelectedIndex((i) => Math.min(i + 1, items.length - 1)) },
        { key: "down",    cmd: () => setSelectedIndex((i) => Math.min(i + 1, items.length - 1)) },
        { key: "k",       cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "up",      cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "return",  cmd: () => onSelect(selectedIndex) },
        { key: "escape",  cmd: () => onSelect(null) },
      ],
    }),
    [items.length, selectedIndex, onSelect],
  );

  return (
    <box
      position="absolute"
      left="25%"
      top="20%"
      width="50%"
      height="60%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> {title} </text>
      <scrollbox flexGrow={1}>
        {items.map((item, i) => (
          <text
            key={item}
            fg={i === selectedIndex ? colors.fgAccent : colors.fg}
            bg={i === selectedIndex ? colors.bgHighlight : undefined}
          >
            {i === selectedIndex ? " ► " : "   "}
            {item}
          </text>
        ))}
      </scrollbox>
      <text fg={colors.fgDim}> j/k:Navigate Enter:Select Esc:Cancel </text>
    </box>
  );
}
