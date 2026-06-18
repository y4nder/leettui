import { colors } from "../theme";
import { useScrollOffset } from "../useScrollOffset";
import { useGlide } from "../useGlide";

interface TopicListProps {
  topics: string[];
  selectedIndex: number;
  height: number;
  focused: boolean;
  // The number key that focuses this panel ([1]/[2]), shown as a tag in the title.
  tag: string;
  // Bumped by the half-page commands to glide the scroll; unchanged = snap.
  smoothNonce: number;
}

export function TopicList({
  topics,
  selectedIndex,
  height,
  focused,
  tag,
  smoothNonce,
}: TopicListProps) {
  const visibleCount = Math.max(1, height - 2);
  const scrollOffset = useGlide(
    useScrollOffset(selectedIndex, topics.length, visibleCount),
    smoothNonce,
  );

  const visible = topics.slice(scrollOffset, scrollOffset + visibleCount);

  // When the panel isn't focused, the selected row gets a muted version of the
  // highlight (dimmer bg + dimmer accent) so the active panel's selection stands out.
  const selectedBg = focused ? colors.bgHighlight : colors.surface;
  const selectedFg = focused ? colors.fgAccent : colors.mutedAccent;

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
          <box key={topic} backgroundColor={isSelected ? selectedBg : undefined} width="100%">
            <text fg={isSelected ? selectedFg : colors.fg}>
              {isSelected ? " ► " : "   "}
              {topic}
            </text>
          </box>
        );
      })}
    </box>
  );
}
