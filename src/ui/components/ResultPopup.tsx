import { colors } from "../theme";

interface ResultPopupProps {
  lines: string[];
}

export function ResultPopup({ lines }: ResultPopupProps) {
  return (
    <box
      position="absolute"
      left="15%"
      top="15%"
      width="70%"
      height="70%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> Result </text>
      <scrollbox flexGrow={1}>
        {lines.map((line, i) => {
          let fg = colors.fg;
          if (line.includes("Accepted")) fg = colors.accepted;
          else if (line.includes("Wrong") || line.includes("Error") || line.includes("Exceeded"))
            fg = colors.hard;
          return (
            <text key={i} fg={fg}>
              {" "}
              {line}
            </text>
          );
        })}
      </scrollbox>
      <text fg={colors.fgDim}> Esc/Enter:Close </text>
    </box>
  );
}
