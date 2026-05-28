import { SyntaxStyle } from "@opentui/core";
import { colors } from "../theme";

const defaultSyntaxStyle = SyntaxStyle.create();

interface QuestionPopupProps {
  title: string;
  content: string;
}

export function QuestionPopup({ title, content }: QuestionPopupProps) {
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
      <text fg={colors.fgAccent}> {title} </text>
      <scrollbox flexGrow={1}>
        <markdown content={content} syntaxStyle={defaultSyntaxStyle} />
      </scrollbox>
      <text fg={colors.fgDim}> j/k:Scroll  Esc/Enter:Close </text>
    </box>
  );
}
