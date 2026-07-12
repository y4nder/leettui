import { useState } from "react";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "@/ui/theme";
import { useListMouse } from "@/ui/useListMouse";

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
        { key: "j", cmd: () => setSelectedIndex((i) => Math.min(i + 1, items.length - 1)) },
        { key: "down", cmd: () => setSelectedIndex((i) => Math.min(i + 1, items.length - 1)) },
        { key: "k", cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "up", cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "return", cmd: () => onSelect(selectedIndex) },
        { key: "escape", cmd: () => onSelect(null) },
      ],
    }),
    [items.length, selectedIndex, onSelect],
  );

  // Click to select, click the selected item again to confirm (≡ Enter), wheel to move
  // the cursor. A modal is always "focused", so it gets pure select/activate semantics.
  const mouse = useListMouse({
    getSelectedIndex: () => selectedIndex,
    select: setSelectedIndex,
    activate: (i) => onSelect(i),
    onWheel: (d) => setSelectedIndex((i) => Math.max(0, Math.min(i + d, items.length - 1))),
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
        {/* The rows wrapper sits INSIDE the scrollbox so its wheel handler runs first
            (descendant order) and stopPropagation suppresses the native content scroll —
            the wheel drives the selection cursor, exactly like j/k. */}
        <box flexDirection="column" width="100%" {...mouse.containerProps}>
          {items.map((item, i) => (
            <text
              key={item}
              fg={i === selectedIndex ? colors.fgAccent : colors.fg}
              bg={i === selectedIndex ? colors.bgHighlight : undefined}
              {...mouse.rowProps(i)}
            >
              {i === selectedIndex ? " ► " : "   "}
              {item}
            </text>
          ))}
        </box>
      </scrollbox>
      <text fg={colors.fgDim}> j/k:Navigate Enter:Select Esc:Cancel </text>
    </box>
  );
}
