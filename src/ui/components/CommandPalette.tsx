import { useEffect, useMemo, useState } from "react";
import { useBindings, useKeymap } from "@opentui/keymap/react";
import { formatCommandBindings } from "@opentui/keymap/extras";
import type { CommandEntry } from "@opentui/keymap";
import type { KeyEvent, Renderable } from "@opentui/core";
import { colors } from "../theme";
import { fuzzyMatch } from "../../core/search";
import { useAppStore } from "../store";

type Entry = CommandEntry<Renderable, KeyEvent>;

interface PaletteRow {
  name: string;
  title: string;
  display: string;
}

function rowsFromEntries(entries: readonly Entry[]): PaletteRow[] {
  const rows: PaletteRow[] = [];
  for (const e of entries) {
    if (e.command.group === "modal" || e.command.group === "debug") continue;
    if (e.command.name === "palette.open") continue;
    const title = (e.command.title as string | undefined) ?? e.command.name;
    const display = formatCommandBindings(e.bindings) ?? "";
    rows.push({ name: e.command.name, title, display });
  }
  return rows;
}

function filterRows(rows: PaletteRow[], needle: string): PaletteRow[] {
  if (!needle.trim()) return rows;
  return rows
    .map((r) => ({ r, score: Math.max(fuzzyMatch(needle, r.title), fuzzyMatch(needle, r.name)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.r);
}

export function CommandPalette() {
  const keymap = useKeymap();
  const [needle, setNeedle] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const all = useMemo(() => rowsFromEntries(keymap.getCommandEntries()), [keymap]);
  const filtered = useMemo(() => filterRows(all, needle), [all, needle]);

  const clampedIndex = filtered.length === 0
    ? 0
    : Math.min(selectedIndex, filtered.length - 1);

  useBindings(
    () => ({
      bindings: [
        { key: "escape", cmd: () => useAppStore.getState().hidePalette() },
        {
          key: "return",
          cmd: () => {
            if (filtered.length === 0) return;
            const row = filtered[clampedIndex]!;
            useAppStore.getState().hidePalette();
            queueMicrotask(() => {
              keymap.runCommand(row.name);
            });
          },
        },
        { key: "j",    cmd: () => setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0))) },
        { key: "down", cmd: () => setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0))) },
        { key: "k",    cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "up",   cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        {
          key: "backspace",
          cmd: () => {
            setNeedle((n) => n.slice(0, -1));
            setSelectedIndex(0);
          },
        },
      ],
    }),
    [filtered, clampedIndex, keymap],
  );

  // Printable-char fallthrough: any unbound 1-char press extends the needle.
  useEffect(() => {
    const off = keymap.intercept("key:after", (ctx) => {
      if (ctx.reason !== "no-match") return;
      if (ctx.eventType !== "press") return;
      if (useAppStore.getState().mode !== "palette") return;
      const name = ctx.event.name ?? "";
      if (name.length !== 1) return;
      if (ctx.event.ctrl || ctx.event.meta) return;
      setNeedle((n) => n + name);
      setSelectedIndex(0);
    });
    return off;
  }, [keymap]);

  return (
    <box
      position="absolute"
      left="20%"
      top="15%"
      width="60%"
      height="70%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> Command Palette </text>
      <box flexDirection="row" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}> &gt; </text>
        <text fg={colors.fg}>{needle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
      <scrollbox flexGrow={1}>
        {filtered.length === 0 ? (
          <text fg={colors.fgDim}>   (no matches)</text>
        ) : (
          filtered.map((r, i) => {
            const selected = i === clampedIndex;
            return (
              <text
                key={r.name}
                fg={selected ? colors.fgAccent : colors.fg}
                bg={selected ? colors.bgHighlight : undefined}
              >
                {`${selected ? " ► " : "   "}${r.title.padEnd(40)}  ${r.display}`}
              </text>
            );
          })
        )}
      </scrollbox>
      <text fg={colors.fgDim}> Type:Filter j/k:Navigate Enter:Run Esc:Cancel </text>
    </box>
  );
}
