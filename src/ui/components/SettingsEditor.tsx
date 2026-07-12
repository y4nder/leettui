import { useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { colors, getCurrentThemeName, listThemeNames } from "@/ui/theme";
import { useAppStore } from "@/ui/store";
import { useListMouse } from "@/ui/useListMouse";
import { persistSetting } from "@/config";
import { SETTINGS, type SettingSpec } from "@/config/settings";

// In-TUI settings editor (opened with `,` or the command palette → mode "config").
// A single scrollable list: each row shows a setting's label + current value. On the
// selected row, Enter/Space cycles an enum in place or opens an inline text/number
// edit; the write goes through persistSetting (comment-preserving). The Theme row is a
// launcher: activating it closes this editor and opens the searchable ThemePickerPopup.
//
// Works alongside the live keymap because no key-bearing layer mounts in "config"
// mode — every key falls through to this component's useKeyboard / the <input>, the
// same seam ChangeLocationPrompt relies on in "relocate" mode.
export function SettingsEditor() {
  const { width, height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phase, setPhase] = useState<"list" | "edit">("list");
  const [editError, setEditError] = useState<string | null>(null);
  // Bumped after each write so the list re-renders with the new displayed value
  // (enum cycles change no other state; theme also bumps themeVersion separately).
  const [, setRev] = useState(0);
  const valueRef = useRef(""); // live typed buffer during an edit
  const editInitialRef = useRef(""); // stable initial value for the <input>'s `value`
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // The theme row lives here (not in config/settings.ts) because its option source
  // and live-apply path are ui/ concerns; it leads the list as the most-reached knob.
  const specs = useMemo<SettingSpec[]>(() => {
    const themeSpec: SettingSpec = {
      id: "theme.name",
      section: "theme",
      key: "name",
      label: "Theme",
      kind: "enum",
      options: () => listThemeNames(),
      read: () => getCurrentThemeName(),
      coerce: (raw) => (listThemeNames().includes(raw) ? raw : null),
    };
    return [themeSpec, ...SETTINGS];
  }, []);

  const close = () => useAppStore.getState().hideConfig();

  // The theme row is a launcher for the searchable picker (which supersedes the old
  // in-place cycle now that there are 16+ themes). Close config first, then open the
  // picker on a microtask so the config layer tears down before the picker mounts.
  const openThemePicker = () => {
    close();
    queueMicrotask(() => useAppStore.getState().showThemePicker());
  };

  const applyValue = (spec: SettingSpec, raw: string) => {
    const v = spec.coerce(raw);
    if (v === null) {
      setEditError("Invalid value");
      return;
    }
    persistSetting(spec.section, spec.key, v);
    setEditError(null);
    setPhase("list");
    setRev((r) => r + 1);
  };

  const cycleEnum = (spec: SettingSpec, dir: 1 | -1) => {
    const opts = spec.options?.() ?? [];
    if (opts.length === 0) return;
    const cur = spec.read();
    const idx = Math.max(0, opts.indexOf(cur));
    const next = opts[(idx + dir + opts.length) % opts.length];
    if (next != null) applyValue(spec, next);
  };

  const beginEdit = (spec: SettingSpec) => {
    editInitialRef.current = spec.read();
    valueRef.current = editInitialRef.current;
    setEditError(null);
    setPhase("edit");
  };

  const move = (d: 1 | -1) =>
    setSelectedIndex((i) => Math.max(0, Math.min(i + d, specs.length - 1)));

  const activateRow = (i: number) => {
    const spec = specs[i];
    if (!spec) return;
    setSelectedIndex(i);
    if (spec.id === "theme.name") openThemePicker();
    else if (spec.kind === "enum") cycleEnum(spec, 1);
    else beginEdit(spec);
  };

  useKeyboard((key) => {
    if (phase === "edit") {
      // Typing + Enter (→ onSubmit) flow to the <input>; only Esc is ours (cancel).
      if (key.name === "escape") {
        setPhase("list");
        setEditError(null);
      }
      return;
    }
    const name = key.name;
    if (name === "escape" || name === "q") return close();
    if (name === "j" || name === "down") return move(1);
    if (name === "k" || name === "up") return move(-1);
    const spec = specs[selectedIndex];
    if (!spec) return;
    if (spec.id === "theme.name") {
      if (name === "return" || name === "space" || name === "l" || name === "h")
        return openThemePicker();
      return;
    }
    if (spec.kind === "enum") {
      if (name === "return" || name === "space" || name === "l") cycleEnum(spec, 1);
      else if (name === "h") cycleEnum(spec, -1);
    } else if (name === "return") {
      beginEdit(spec);
    }
  });

  // Click a row to select it, click the selected row again to activate (cycle enum /
  // open edit), wheel to move the cursor. Ignored mid-edit so a stray click can't
  // spawn a second focused <input>. A modal is always focused → pure select/activate.
  const mouse = useListMouse({
    getSelectedIndex: () => selectedIndex,
    select: (i) => {
      if (phaseRef.current === "list") setSelectedIndex(i);
    },
    activate: (i) => {
      if (phaseRef.current === "list") activateRow(i);
    },
    onWheel: (d) => {
      if (phaseRef.current === "list")
        setSelectedIndex((i) => Math.max(0, Math.min(i + d, specs.length - 1)));
    },
  });

  const boxWidth = Math.min(72, Math.max(48, width - 8));
  const selectedSpec = specs[selectedIndex];

  return (
    <box
      position="absolute"
      left="50%"
      top="50%"
      width={boxWidth}
      marginLeft={-Math.floor(boxWidth / 2)}
      marginTop={-Math.floor(Math.min(height - 4, specs.length + 8) / 2)}
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <text fg={colors.fgAccent}>Settings</text>
      <box height={1} />

      <box flexDirection="column" width="100%" {...mouse.containerProps}>
        {specs.map((spec, i) => {
          const sel = i === selectedIndex;
          const editing = sel && phase === "edit";
          return (
            <box
              key={spec.id}
              flexDirection="row"
              width="100%"
              backgroundColor={sel ? colors.bgHighlight : undefined}
              {...mouse.rowProps(i)}
            >
              <text fg={sel ? colors.fgAccent : colors.fg}>
                {sel ? " ► " : "   "}
                {spec.label.padEnd(20)}
              </text>
              {editing ? (
                <input
                  focused
                  value={editInitialRef.current}
                  maxLength={1024}
                  onInput={(v: string) => {
                    valueRef.current = v;
                  }}
                  onSubmit={() => applyValue(spec, valueRef.current)}
                  flexGrow={1}
                />
              ) : (
                <text fg={spec.kind === "enum" ? colors.accent : colors.fg}>
                  {spec.read() || "(unset)"}
                </text>
              )}
            </box>
          );
        })}
      </box>

      <box height={1} />
      {editError ? (
        <text fg={colors.error}>{editError}</text>
      ) : selectedSpec?.hint ? (
        <text fg={colors.fgDim}>{selectedSpec.hint}</text>
      ) : (
        <text fg={colors.fgDim}> </text>
      )}
      <text fg={colors.fgDim}>
        {phase === "edit"
          ? "Enter: save · Esc: cancel"
          : "j/k: Move · Enter/Space: Edit or cycle · Esc: Close"}
      </text>
    </box>
  );
}
