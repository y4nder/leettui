import { useMemo } from "react";
import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import type { BrowsePanel } from "../store";
import {
  helpBindings,
  browseGlobalBindings,
  panelBindings,
  describeScope,
  formatKeys,
  isScopeEntryVisible,
  type ScopeBinding,
} from "../keymap";

const KEY_WIDTH = 16;

interface Row {
  key: string;
  desc: string;
}

interface Section {
  header: string;
  rows: Row[];
}

function scopeRows(bindings: Parameters<typeof describeScope>[0], debugEnabled: boolean): Row[] {
  return describeScope(bindings)
    .filter((b: ScopeBinding) => isScopeEntryVisible(b, debugEnabled))
    .map((b) => ({ key: formatKeys(b.keys), desc: b.title }));
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

interface HelpPopupProps {
  focusedPanel: BrowsePanel;
  debugEnabled?: boolean;
}

export function HelpPopup({ focusedPanel, debugEnabled }: HelpPopupProps) {
  useBindings(() => ({ bindings: helpBindings }), []);

  const sections = useMemo<Section[]>(() => {
    const panelLabel = focusedPanel === "topics" ? "Topics" : "Questions";
    const out: Section[] = [];
    const local = scopeRows(panelBindings(focusedPanel), !!debugEnabled);
    if (local.length > 0)
      out.push({ header: `LOCAL KEYS — ${panelLabel.toUpperCase()}`, rows: local });
    const global = scopeRows(browseGlobalBindings, !!debugEnabled);
    if (global.length > 0) out.push({ header: "GLOBAL KEYS", rows: global });
    return out;
  }, [focusedPanel, debugEnabled]);

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
        {sections.flatMap((section) => [
          <text key={`h-${section.header}`} fg={colors.fgAccent}>
            {`  ${section.header}`}
          </text>,
          ...section.rows.map((row) => (
            <text key={`r-${section.header}-${row.key}-${row.desc}`} fg={colors.fg}>
              {`    ${pad(row.key, KEY_WIDTH)}${row.desc}`}
            </text>
          )),
        ])}
      </scrollbox>
      <text fg={colors.fgDim}> Esc/Enter:Close </text>
    </box>
  );
}
