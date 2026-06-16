import { colors } from "../theme";

interface TopicListProps {
  topics: string[];
  selectedIndex: number;
  height: number;
  focused: boolean;
  // The number key that focuses this panel ([1]/[2]), shown as a tag in the title.
  tag: string;
}

export function TopicList({ topics, selectedIndex, height, focused, tag }: TopicListProps) {
  const visibleCount = Math.max(1, height - 2);
  let scrollOffset = 0;
  if (selectedIndex >= scrollOffset + visibleCount) {
    scrollOffset = selectedIndex - visibleCount + 1;
  }

  const visible = topics.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={focused ? colors.accent : colors.border}
      width="20%"
      height="100%"
    >
      <box flexDirection="row">
        <text fg={focused ? colors.accent : colors.fgDim}> [{tag}]</text>
        <text fg={colors.fgAccent}> Topics </text>
      </box>
      {visible.map((topic, i) => {
        const realIndex = scrollOffset + i;
        const isSelected = realIndex === selectedIndex;
        return (
          <box
            key={topic}
            backgroundColor={isSelected ? colors.bgHighlight : undefined}
            width="100%"
          >
            <text fg={isSelected ? colors.fgAccent : colors.fg}>
              {isSelected ? " ► " : "   "}
              {topic}
            </text>
          </box>
        );
      })}
    </box>
  );
}
