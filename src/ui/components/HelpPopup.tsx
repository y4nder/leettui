import { useBindings } from "@opentui/keymap/react";
import type { Binding } from "@opentui/keymap";
import type { KeyEvent, Renderable } from "@opentui/core";
import { colors } from "../theme";
import { describeScope, formatKeys, isScopeEntryVisible, type ScopeBinding } from "../keymap";

const KEY_WIDTH = 16;

interface Row {
  key: string;
  desc: string;
}

interface Section {
  header: string;
  rows: Row[];
}

// One named scope to render: a header plus the raw binding spec for that scope.
// HelpPopup turns each into a section via the shared describeScope/formatKeys seam.
export interface HelpScope {
  header: string;
  bindings: Binding<Renderable, KeyEvent>[];
}

type VisiblePredicate = (b: ScopeBinding, debugEnabled: boolean) => boolean;

function scopeRows(
  bindings: Binding<Renderable, KeyEvent>[],
  visible: VisiblePredicate,
  debugEnabled: boolean,
): Row[] {
  return describeScope(bindings)
    .filter((b: ScopeBinding) => visible(b, debugEnabled))
    .map((b) => ({ key: formatKeys(b.keys), desc: b.title }));
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

interface HelpPopupProps {
  // Ordered scopes (local panel first, then global) — each becomes a section.
  scopes: HelpScope[];
  // The binding layer to mount while open (its close key returns to the right mode:
  // browse help → help.close; problem help → problem.helpClose).
  closeBindings: Binding<Renderable, KeyEvent>[];
  // Visibility filter. Browse hides modal commands (the default); the problem view
  // passes a variant that keeps its all-modal commands. See keymap isScopeEntryVisible.
  visible?: VisiblePredicate;
  debugEnabled?: boolean;
  title?: string;
  footerHint?: string;
}

// Generalized keybindings help popup. Used by both browse (mode === "help") and the
// problem view (problem.help sub-modal); the caller supplies the scopes, the close
// layer, and which visibility filter to apply — HelpPopup is a pure presenter.
export function HelpPopup({
  scopes,
  closeBindings,
  visible = isScopeEntryVisible,
  debugEnabled,
  title = "Keybindings",
  footerHint = "Esc/Enter:Close",
}: HelpPopupProps) {
  useBindings(() => ({ bindings: closeBindings }), [closeBindings]);

  const sections: Section[] = scopes
    .map((s) => ({ header: s.header, rows: scopeRows(s.bindings, visible, !!debugEnabled) }))
    .filter((s) => s.rows.length > 0);

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
      <text fg={colors.fgAccent}>{` ${title} `}</text>
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
      <text fg={colors.fgDim}>{` ${footerHint} `}</text>
    </box>
  );
}
