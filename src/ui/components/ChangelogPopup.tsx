import { useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "@/ui/theme";
import { buildMarkdownSyntaxStyle } from "@/ui/markdownStyle";
import { useAppStore } from "@/ui/store";
import { changelogBindings, registerPopupScroller } from "@/ui/keymap";
import { formatReleaseDate, type ReleaseInfo } from "@/core/update";
import { VERSION } from "@/core/version";

interface ChangelogPopupProps {
  releases: ReleaseInfo[];
  highlightTag: string;
}

// A dim horizontal rule under each release header. Fixed width — the scrollbox
// clips overflow at narrow terminals rather than wrapping into a second row.
const RULE = "─".repeat(48);

// "What's new" popup (Stage 18): the recent releases' notes as one continuous
// markdown scroll, newest-first — each under a styled header (tag + published
// date + latest/installed badges), with `highlightTag` emphasized (the installed
// version at boot, the latest via the palette). Mounted only while mode ===
// "changelog", so its bindings layer (changelogBindings) registers/unregisters
// with it. `o` opens the emphasized release's page on GitHub, j/k + Ctrl+d/u
// scroll, Esc/q close. A pure presenter like NotesPopup/HelpPopup.
//
// LAYOUT GOTCHA (found empirically): the title/footer <text>s MUST pin
// flexShrink={0}. The scrollbox reports its full content height to Yoga, and
// once the multi-release scroll grows a few viewports tall the flex shrink
// pass rounds the 1-row siblings down to 0 — the title row vanishes and the
// content/footer overdraw it and the border. The single-release popups
// (Question/Notes/Result) sit below that threshold, which is why the same
// chrome never needed the pin before.
export function ChangelogPopup({ releases, highlightTag }: ChangelogPopupProps) {
  useBindings(() => ({ bindings: changelogBindings }), []);
  const themeVersion = useAppStore((s) => s.themeVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion is the deliberate cache-bust key; the callback reads the live `colors` proxy
  const syntaxStyle = useMemo(() => buildMarkdownSyntaxStyle(), [themeVersion]);
  const latestTag = releases[0]?.tag;
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
      <text fg={colors.fgAccent} attributes={TextAttributes.BOLD} flexShrink={0}>
        {` What's new — ${highlightTag} `}
      </text>
      <scrollbox ref={registerPopupScroller} flexGrow={1} paddingLeft={1} paddingRight={1}>
        {releases.length === 0 ? (
          <text fg={colors.fgDim}>No release notes available.</text>
        ) : (
          releases.flatMap((r) => {
            const date = formatReleaseDate(r.publishedAt);
            // Each release contributes a flat run of scrollbox children:
            // header row, dim rule, markdown body, one-row gap.
            return [
              <box key={`${r.tag}-header`} flexDirection="row">
                <text
                  fg={r.tag === highlightTag ? colors.fgAccent : colors.fg}
                  attributes={TextAttributes.BOLD}
                >
                  {r.tag}
                </text>
                {r.tag === latestTag && <text fg={colors.success}> (latest)</text>}
                {/* When installed == latest (the common boot case), "(latest)" alone
                    is clearer than a double badge — the title already names the tag. */}
                {r.tag === VERSION && r.tag !== latestTag && (
                  <text fg={colors.warn}> (installed)</text>
                )}
                {date !== "" && <text fg={colors.fgDim}>{`  ${date}`}</text>}
              </box>,
              <text key={`${r.tag}-rule`} fg={colors.fgDim}>
                {RULE}
              </text>,
              r.body.trim() ? (
                <markdown key={`${r.tag}-body`} content={r.body} syntaxStyle={syntaxStyle} />
              ) : (
                <text key={`${r.tag}-body`} fg={colors.fgDim}>
                  No release notes.
                </text>
              ),
              <text key={`${r.tag}-gap`}> </text>,
            ];
          })
        )}
      </scrollbox>
      <text fg={colors.fgDim} flexShrink={0}>
        {" "}
        o:Open on GitHub j/k:Scroll ^d/^u:Page Esc/q:Close{" "}
      </text>
    </box>
  );
}
