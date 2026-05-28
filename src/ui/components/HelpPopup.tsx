import { useMemo } from "react";
import { useBindings, useKeymap } from "@opentui/keymap/react";
import { formatCommandBindings } from "@opentui/keymap/extras";
import type { CommandEntry } from "@opentui/keymap";
import type { KeyEvent, Renderable } from "@opentui/core";
import { colors } from "../theme";
import { helpBindings } from "../keymap";

type Entry = CommandEntry<Renderable, KeyEvent>;

const KEY_WIDTH = 16;
const CATEGORY_ORDER = ["Navigation", "View", "Solve", "Search", "System"] as const;
type Category = typeof CATEGORY_ORDER[number];

interface Row {
  key: string;
  desc: string;
}

interface Section {
  header: string;
  rows: Row[];
}

function buildSections(entries: readonly Entry[], debugEnabled: boolean): Section[] {
  const byCategory = new Map<string, Row[]>();
  const debugRows: Row[] = [];

  for (const e of entries) {
    const group = e.command.group as string | undefined;
    if (group === "modal") continue;
    if (group === "debug" && !debugEnabled) continue;

    const title = (e.command.title as string | undefined) ?? e.command.name;
    const display = formatCommandBindings(e.bindings) ?? "";
    if (!display) continue;
    const row: Row = { key: display, desc: title };

    if (group === "debug") {
      debugRows.push(row);
      continue;
    }
    const cat = (e.command.category as string | undefined) ?? "System";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  }

  const sections: Section[] = [];
  for (const cat of CATEGORY_ORDER) {
    const rows = byCategory.get(cat);
    if (rows && rows.length > 0) sections.push({ header: cat.toUpperCase(), rows });
  }
  if (debugEnabled && debugRows.length > 0) {
    sections.push({ header: "DEBUG", rows: debugRows });
  }
  return sections;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

interface HelpPopupProps {
  debugEnabled?: boolean;
}

export function HelpPopup({ debugEnabled }: HelpPopupProps) {
  useBindings(() => ({ bindings: helpBindings }), []);
  const keymap = useKeymap();
  const sections = useMemo(
    () => buildSections(keymap.getCommandEntries(), !!debugEnabled),
    [keymap, debugEnabled],
  );

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
        {sections.flatMap((section, sIdx) => [
          <text key={`h-${sIdx}`} fg={colors.fgAccent}>
            {`  ${section.header}`}
          </text>,
          ...section.rows.map((row, rIdx) => (
            <text key={`r-${sIdx}-${rIdx}`} fg={colors.fg}>
              {`    ${pad(row.key, KEY_WIDTH)}${row.desc}`}
            </text>
          )),
        ])}
      </scrollbox>
      <text fg={colors.fgDim}> Esc/Enter:Close </text>
    </box>
  );
}
