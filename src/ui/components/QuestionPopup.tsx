import { useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import { buildMarkdownSyntaxStyle } from "../markdownStyle";
import { useAppStore } from "../store";
import { popupBindings, registerPopupScroller } from "../keymap";

interface QuestionPopupProps {
  title: string;
  content: string;
}

export function QuestionPopup({ title, content }: QuestionPopupProps) {
  useBindings(() => ({ bindings: popupBindings }), []);
  const themeVersion = useAppStore((s) => s.themeVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion is the deliberate cache-bust key; the callback reads the live `colors` proxy
  const syntaxStyle = useMemo(() => buildMarkdownSyntaxStyle(), [themeVersion]);
  return (
    <box
      position="absolute"
      left="15%"
      top="10%"
      width="70%"
      height="80%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent} attributes={TextAttributes.BOLD}>
        {" "}
        {title}{" "}
      </text>
      <scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
        <markdown content={content} syntaxStyle={syntaxStyle} />
      </scrollbox>
      <text fg={colors.fgDim}> j/k:Scroll Esc/Enter:Close </text>
    </box>
  );
}
