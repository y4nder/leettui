import { useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import { buildMarkdownSyntaxStyle } from "../markdownStyle";
import { useAppStore } from "../store";
import { notesBindings } from "../keymap";

interface NotesPopupProps {
  content: string;
}

// Shared, language-agnostic notes view for the problem view. Mounted only while
// `problem.notes` is non-null, so its bindings layer (notesBindings) registers
// and unregisters with it — shadowing problem-view e/escape/q while open.
export function NotesPopup({ content }: NotesPopupProps) {
  useBindings(() => ({ bindings: notesBindings }), []);
  const themeVersion = useAppStore((s) => s.themeVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion is the deliberate cache-bust key; the callback reads the live `colors` proxy
  const syntaxStyle = useMemo(() => buildMarkdownSyntaxStyle(), [themeVersion]);
  const trimmed = content.trim();
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
        Notes{" "}
      </text>
      <scrollbox flexGrow={1} paddingLeft={1} paddingRight={1}>
        {trimmed ? (
          <markdown content={content} syntaxStyle={syntaxStyle} />
        ) : (
          <text fg={colors.fgDim}>No notes yet — press e to start.</text>
        )}
      </scrollbox>
      <text fg={colors.fgDim}> e:Edit j/k:Scroll Esc/q:Close </text>
    </box>
  );
}
