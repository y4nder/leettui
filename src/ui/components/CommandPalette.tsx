import { useEffect, useMemo, useState } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { useBindings, useKeymap } from "@opentui/keymap/react";
import { formatCommandBindings } from "@opentui/keymap/extras";
import type { CommandEntry } from "@opentui/keymap";
import type { KeyEvent, Renderable } from "@opentui/core";
import { colors } from "../theme";
import { fuzzyMatch } from "../../core/search";
import { useAppStore } from "../store";
import { useListMouse } from "../useListMouse";
import { useScrollableList } from "../useScrollableList";

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
  const { height } = useTerminalDimensions();
  const [needle, setNeedle] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const all = useMemo(() => rowsFromEntries(keymap.getCommandEntries()), [keymap]);
  const filtered = useMemo(() => filterRows(all, needle), [all, needle]);

  const clampedIndex = filtered.length === 0 ? 0 : Math.min(selectedIndex, filtered.length - 1);

  // Window the list like RecentPopup so the selection always stays in view — the full
  // command catalog overflows the popup, and a scrollbox doesn't follow a cursor.
  // Popup is 70% tall; reserve border (2) + title (1) + needle row (1) + footer (1).
  const visibleCount = Math.max(1, Math.floor(height * 0.7) - 5);
  const list = useScrollableList(clampedIndex, filtered.length, visibleCount);
  const scrollOffset = list.scrollOffset;
  const visible = filtered.slice(scrollOffset, scrollOffset + visibleCount);

  // Shared by the Enter binding and the mouse activate: close first, then run on a
  // microtask so the command executes against the restored (palette-free) mode.
  const runRow = (index: number) => {
    const row = filtered[index];
    if (!row) return;
    useAppStore.getState().hidePalette();
    queueMicrotask(() => {
      keymap.runCommand(row.name);
    });
  };

  useBindings(
    () => ({
      bindings: [
        { key: "escape", cmd: () => useAppStore.getState().hidePalette() },
        { key: "return", cmd: () => runRow(clampedIndex) },
        {
          key: "down",
          cmd: () => setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0))),
        },
        { key: "up", cmd: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
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

  // Click to select, click the selected command again to run it (≡ Enter), wheel to
  // scroll the viewport (the highlight is dragged along only when it would leave the
  // window). Indices always refer to the currently rendered `filtered` array, so
  // filter churn can't misroute a click.
  const mouse = useListMouse({
    getSelectedIndex: () => clampedIndex,
    select: setSelectedIndex,
    activate: runRow,
    onWheel: (d) => {
      const dragged = list.scrollBy(d);
      if (dragged !== null) setSelectedIndex(dragged);
    },
  });

  // Printable-char fallthrough: any unbound 1-char press extends the needle.
  useEffect(() => {
    const off = keymap.intercept("key:after", (ctx) => {
      if (ctx.reason !== "no-match") return;
      if (ctx.eventType !== "press") return;
      if (useAppStore.getState().mode !== "palette") return;
      const name = ctx.event.name ?? "";
      // The space key arrives as name "space" (not " "); map it back to a literal space.
      const char = name === "space" ? " " : name;
      if (char.length !== 1) return;
      if (ctx.event.ctrl || ctx.event.meta) return;
      setNeedle((n) => n + char);
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
      {...mouse.containerProps}
    >
      <text fg={colors.fgAccent}> Command Palette </text>
      <box flexDirection="row" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}> &gt; </text>
        <text fg={colors.fg}>{needle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
      {/* A plain column, not a scrollbox: the list is windowed (useScrollableList
          slices to visibleCount), so the content never overflows — and the wheel
          drives our viewport. Container props sit on the popup box so the wheel
          works anywhere over the modal. */}
      <box flexDirection="column" flexGrow={1}>
        {visible.length === 0 ? (
          <text fg={colors.fgDim}> (no matches)</text>
        ) : (
          visible.map((r, i) => {
            const realIndex = scrollOffset + i;
            const selected = realIndex === clampedIndex;
            return (
              <text
                key={r.name}
                fg={selected ? colors.fgAccent : colors.fg}
                bg={selected ? colors.bgHighlight : undefined}
                {...mouse.rowProps(realIndex)}
              >
                {`${selected ? " ► " : "   "}${r.title.padEnd(40)}  ${r.display}`}
              </text>
            );
          })
        )}
      </box>
      <text fg={colors.fgDim}> Type:Filter ↑↓:Navigate Enter:Run Esc:Cancel</text>
    </box>
  );
}
