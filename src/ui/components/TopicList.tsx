import { colors } from "../theme";

interface TopicListProps {
  topics: string[];
  selectedIndex: number;
  height: number;
  focused: boolean;
}

export function TopicList({ topics, selectedIndex, height, focused }: TopicListProps) {
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
      <text fg={colors.fgAccent}> Topics </text>
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
