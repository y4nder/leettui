import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { colors } from "../theme";

interface SelectPopupProps {
  title: string;
  items: string[];
  onSelect: (index: number | null) => void;
}

export function SelectPopup({ title, items, onSelect }: SelectPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useKeyboard((event) => {
    switch (event.name) {
      case "j":
      case "down":
        setSelectedIndex((i: number) => Math.min(i + 1, items.length - 1));
        break;
      case "k":
      case "up":
        setSelectedIndex((i: number) => Math.max(i - 1, 0));
        break;
      case "return":
        onSelect(selectedIndex);
        break;
      case "escape":
        onSelect(null);
        break;
    }
  });

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
