import { useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import { buildMarkdownSyntaxStyle } from "../markdownStyle";
import { useAppStore } from "../store";
import { changelogBindings, registerPopupScroller } from "../keymap";

interface ChangelogPopupProps {
  tag: string;
  body: string;
}

// "What's new" popup (Stage 18): the latest release's notes rendered as markdown.
// Mounted only while mode === "changelog", so its bindings layer (changelogBindings)
// registers/unregisters with it. `o` opens the full release page on GitHub, j/k
// scroll, Esc/q close. Shown once per new version at boot (BootFlow) and on demand
// via the command palette (changelog.open). A pure presenter like NotesPopup/HelpPopup.
export function ChangelogPopup({ tag, body }: ChangelogPopupProps) {
  useBindings(() => ({ bindings: changelogBindings }), []);
  const themeVersion = useAppStore((s) => s.themeVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion is the deliberate cache-bust key; the callback reads the live `colors` proxy
  const syntaxStyle = useMemo(() => buildMarkdownSyntaxStyle(), [themeVersion]);
  const trimmed = body.trim();
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
        {` What's new — ${tag} `}
      </text>
      <scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
        {trimmed ? (
          <markdown content={body} syntaxStyle={syntaxStyle} />
        ) : (
          <text fg={colors.fgDim}>No release notes available.</text>
        )}
      </scrollbox>
      <text fg={colors.fgDim}> o:Open on GitHub j/k:Scroll Esc/q:Close </text>
    </box>
  );
}
