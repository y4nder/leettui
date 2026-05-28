import { colors } from "../theme";

type Row = { key: string; desc: string } | { header: string };

const KEYBINDINGS: Row[] = [
  { header: "BROWSE" },
  { key: "j / ↓",        desc: "Next question" },
  { key: "k / ↑",        desc: "Previous question" },
  { key: "t / T",        desc: "Next / prev topic" },
  { key: "Enter",        desc: "View problem description" },
  { key: "d",            desc: "Today's daily challenge" },
  { key: "e",            desc: "Open in editor (language select)" },
  { key: "R",            desc: "Run solution against examples" },
  { key: "s",            desc: "Submit solution" },
  { key: "/",            desc: "Search / filter questions" },
  { key: "r",            desc: "Jump to random question" },
  { key: "*",            desc: "Sync problem database" },
  { key: "Ctrl+P",       desc: "Command palette" },
  { key: "h",            desc: "Show this help screen" },
  { key: "q",            desc: "Quit" },
  { header: "POPUP / RESULT" },
  { key: "j / k",        desc: "Scroll content" },
  { key: "Esc / Enter",  desc: "Close" },
  { header: "SEARCH" },
  { key: "Type",         desc: "Filter questions in real time" },
  { key: "Esc / Enter",  desc: "Exit search" },
];

const DEBUG_KEYBINDINGS: Row[] = [
  { header: "DEBUG" },
  { key: "`",            desc: "Open debug log overlay" },
  { key: "y (overlay)",  desc: "Yank log to /tmp/leettui-debug.log" },
  { key: "Esc (overlay)", desc: "Close debug overlay" },
];

const KEY_WIDTH = 16;

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

interface HelpPopupProps {
  debugEnabled?: boolean;
}

export function HelpPopup({ debugEnabled }: HelpPopupProps) {
  const rows = debugEnabled ? [...KEYBINDINGS, ...DEBUG_KEYBINDINGS] : KEYBINDINGS;

  return (
    <box
      position="absolute"
      left="20%"
      top="10%"
      width="60%"
      height="80%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> Keybindings </text>
      <scrollbox flexGrow={1}>
        {rows.map((row, i) => {
          if ("header" in row) {
            return (
              <text key={i} fg={colors.fgAccent}>
                {`  ${row.header}`}
              </text>
            );
          }
          return (
            <text key={i} fg={colors.fg}>
              {`    ${pad(row.key, KEY_WIDTH)}${row.desc}`}
            </text>
          );
        })}
      </scrollbox>
      <text fg={colors.fgDim}> Esc/Enter:Close </text>
    </box>
  );
}
