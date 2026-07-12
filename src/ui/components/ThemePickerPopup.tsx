import { useEffect, useMemo, useRef, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useBindings, useKeymap } from "@opentui/keymap/react";
import { colors, getCurrentThemeName, listThemeNames, setTheme } from "@/ui/theme";
import { fuzzyMatch } from "@/core/search";
import { useAppStore } from "@/ui/store";
import { useListMouse } from "@/ui/useListMouse";
import { useScrollableList } from "@/ui/useScrollableList";

// kebab → Title Case: "tokyo-night" → "Tokyo Night", "system" → "System".
function prettyThemeName(name: string): string {
  return name
    .split(/[-_]/)
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function filterNames(names: string[], needle: string): string[] {
  if (!needle.trim()) return names;
  return names
    .map((name) => ({
      name,
      score: Math.max(fuzzyMatch(needle, prettyThemeName(name)), fuzzyMatch(needle, name)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.name);
}

// Searchable theme picker with live preview. Opened from browse (`t`), the command
// palette ("Theme…"), and the Settings editor's Theme row. Type to fuzzy-filter, j/k to
// move — moving the highlight applies the theme live (no persist) so the whole UI repaints
// behind the popup. Enter confirms + persists; Esc reverts to the theme active on open.
// Modeled on RecentPopup (windowed list + local state + useBindings) plus CommandPalette's
// key:after needle intercept. Mounted only while mode === "themePicker".
export function ThemePickerPopup() {
  const keymap = useKeymap();
  const { height } = useTerminalDimensions();
  const hideThemePicker = useAppStore((s) => s.hideThemePicker);
  // Repaint on live-preview theme changes so the popup itself re-reads `colors`.
  useAppStore((s) => s.themeVersion);

  const [needle, setNeedle] = useState("");
  // Start the highlight on the active theme so opening the picker previews the current
  // theme (no jump) rather than the first entry in the list.
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(0, listThemeNames().indexOf(getCurrentThemeName())),
  );

  // Capture the active theme once at mount, before the first preview fires, so Esc/cancel
  // (and the unmount safety net) can revert to it.
  const originalNameRef = useRef(getCurrentThemeName());
  // Set on confirm/cancel so the unmount cleanup doesn't re-revert an intentional choice.
  const committedRef = useRef(false);

  const all = useMemo(() => listThemeNames(), []);
  const filtered = useMemo(() => filterNames(all, needle), [all, needle]);
  const clampedIndex = filtered.length === 0 ? 0 : Math.min(selectedIndex, filtered.length - 1);

  // Live preview: apply the highlighted theme (no persist) whenever the highlight changes.
  // Deps are [filtered, clampedIndex] — NOT themeVersion — or setTheme's version bump would
  // re-trigger this effect in a loop.
  useEffect(() => {
    const name = filtered[clampedIndex];
    if (name) setTheme(name);
  }, [filtered, clampedIndex]);

  // Safety net: revert if the popup is unmounted by any path other than confirm/cancel.
  useEffect(
    () => () => {
      if (!committedRef.current) setTheme(originalNameRef.current);
    },
    [],
  );

  const confirm = (index: number) => {
    const name = filtered[index];
    if (!name) return;
    committedRef.current = true;
    setTheme(name, { persist: true });
    hideThemePicker();
  };

  const cancel = () => {
    committedRef.current = true;
    setTheme(originalNameRef.current);
    hideThemePicker();
  };

  // Navigation is arrow keys + Ctrl+n/p + Ctrl+j/k — NOT bare j/k. This popup filters as
  // you type, so bare letters must reach the needle intercept (else you couldn't search
  // "kanagawa"/"nightowl" etc.). The Ctrl variants keep vim-style nav available; the
  // intercept ignores ctrl-modified keys, so they never leak into the filter.
  const down = () => setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
  const up = () => setSelectedIndex((i) => Math.max(i - 1, 0));
  useBindings(
    () => ({
      bindings: [
        { key: "down", cmd: down },
        { key: "ctrl+n", cmd: down },
        { key: "ctrl+j", cmd: down },
        { key: "up", cmd: up },
        { key: "ctrl+p", cmd: up },
        { key: "ctrl+k", cmd: up },
        { key: "return", cmd: () => confirm(clampedIndex) },
        { key: "escape", cmd: () => cancel() },
        {
          key: "backspace",
          cmd: () => {
            setNeedle((n) => n.slice(0, -1));
            setSelectedIndex(0);
          },
        },
      ],
    }),
    [filtered, clampedIndex, hideThemePicker],
  );

  // Printable-char fallthrough: any unbound 1-char press extends the needle. Gated on the
  // picker mode so it doesn't steal keys once closed. (CommandPalette's intercept pattern.)
  useEffect(() => {
    const off = keymap.intercept("key:after", (ctx) => {
      if (ctx.reason !== "no-match") return;
      if (ctx.eventType !== "press") return;
      if (useAppStore.getState().mode !== "themePicker") return;
      const name = ctx.event.name ?? "";
      const char = name === "space" ? " " : name;
      if (char.length !== 1) return;
      if (ctx.event.ctrl || ctx.event.meta) return;
      setNeedle((n) => n + char);
      setSelectedIndex(0);
    });
    return off;
  }, [keymap]);

  // Window the list like CommandPalette. Popup is 60% tall; reserve border (2) + title (1)
  // + needle row (1) + footer (1).
  const visibleCount = Math.max(1, Math.floor(height * 0.6) - 5);
  const list = useScrollableList(clampedIndex, filtered.length, visibleCount);
  const scrollOffset = list.scrollOffset;
  const visible = filtered.slice(scrollOffset, scrollOffset + visibleCount);

  const mouse = useListMouse({
    getSelectedIndex: () => clampedIndex,
    select: setSelectedIndex,
    activate: confirm,
    onWheel: (d) => {
      const dragged = list.scrollBy(d);
      if (dragged !== null) setSelectedIndex(dragged);
    },
  });

  return (
    <box
      position="absolute"
      left="20%"
      top="20%"
      width="60%"
      height="60%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
      {...mouse.containerProps}
    >
      <text fg={colors.fgAccent} attributes={TextAttributes.BOLD}>
        {` Theme (${filtered.length}) `}
      </text>
      <box flexDirection="row" height={1} backgroundColor={colors.statusBar}>
        <text fg={colors.fgAccent}> &gt; </text>
        <text fg={colors.fg}>{needle}</text>
        <text fg={colors.fgDim}>█</text>
      </box>
      <box flexDirection="column" flexGrow={1}>
        {visible.length === 0 ? (
          <text fg={colors.fgDim}> (no matches)</text>
        ) : (
          visible.map((name, i) => {
            const realIndex = scrollOffset + i;
            const selected = realIndex === clampedIndex;
            const isOriginal = name === originalNameRef.current;
            return (
              <box
                key={name}
                flexDirection="row"
                backgroundColor={selected ? colors.bgHighlight : undefined}
                width="100%"
                {...mouse.rowProps(realIndex)}
              >
                <text fg={selected ? colors.fgAccent : colors.fg}>{selected ? " ► " : "   "}</text>
                <text fg={colors.accent}>{isOriginal ? "● " : "  "}</text>
                <text fg={selected ? colors.fgAccent : colors.fg} flexGrow={1}>
                  {prettyThemeName(name)}
                </text>
              </box>
            );
          })
        )}
      </box>
      <text fg={colors.fgDim}> Type:Filter ↑↓/^n^p:Preview Enter:Apply Esc:Cancel </text>
    </box>
  );
}
