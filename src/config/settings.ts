// The metadata table behind the in-TUI settings editor (SettingsEditor.tsx): one
// SettingSpec per user-editable `[section] key`, describing how to read the current
// value, what kind of editor it needs (cycle an enum vs inline text/number entry),
// and how to validate/coerce a raw string into the value to persist.
//
// Pure and dependency-light (config's "None" dependency invariant): it imports only
// sibling config accessors/coercers and inlines the language list rather than
// reaching into api/. The `theme.name` row is deliberately NOT here — its option
// source (listThemeNames) and live-apply path (setTheme) live in the ui/ layer, so
// the SettingsEditor component assembles that row itself and splices it in.

import {
  clampJumpRows,
  coerceEditorDetach,
  getDefaultLanguage,
  getEditorDetach,
  getGitUiCommand,
  getScrollJumpRows,
  loadConfig,
} from "./index";

export type SettingKind = "enum" | "text" | "number";

export interface SettingSpec {
  id: string; // stable React key, e.g. "scroll.jump_rows"
  section: string; // TOML [section]
  key: string; // TOML key
  label: string; // list label
  kind: SettingKind;
  options?: () => string[]; // enum only; lazy so live lists stay fresh
  read: () => string; // current value AS DISPLAYED (always a string)
  // Validate + coerce a raw string into the value to persist, or null to reject
  // (the editor shows an "Invalid value" hint and keeps the edit open).
  coerce: (raw: string) => string | number | boolean | null;
  hint?: string; // optional dim help shown under the edit input
}

// Curated default-language options. Inlined (not imported from api/types.ts) to
// keep config/ a dependency-free leaf; the common languages lead, and it's the
// *default* selector only (not a runnable-harness gate), so a broad list is fine.
export const LANGUAGE_SLUGS: string[] = [
  "python3",
  "cpp",
  "java",
  "javascript",
  "typescript",
  "rust",
  "csharp",
  "golang",
  "c",
  "kotlin",
  "swift",
  "ruby",
  "scala",
  "php",
  "elixir",
  "erlang",
  "dart",
  "racket",
];

// The five non-theme settings. `read` goes through the coercing accessors, so a
// garbage on-disk value displays as its safe coerced form and any edit overwrites it.
export const SETTINGS: SettingSpec[] = [
  {
    id: "editor.command",
    section: "editor",
    key: "command",
    label: "Editor command",
    kind: "text",
    // The RAW config value, not getEditorArgv() (which resolves $EDITOR/platform
    // defaults) — so "unset" reads as empty rather than a resolved fallback.
    read: () => loadConfig().editor?.command ?? "",
    coerce: (raw) => raw.trim(), // empty is legitimate = fall back to $EDITOR
    hint: "Leave empty to fall back to $EDITOR. Args allowed, e.g. code --wait",
  },
  {
    id: "editor.detach",
    section: "editor",
    key: "detach",
    label: "Editor detach mode",
    kind: "enum",
    options: () => ["auto", "true", "false"],
    read: () => String(getEditorDetach()),
    coerce: (raw) => coerceEditorDetach(raw),
  },
  {
    id: "git.ui",
    section: "git",
    key: "ui",
    label: "Git UI command",
    kind: "text",
    read: () => getGitUiCommand(),
    coerce: (raw) => raw.trim(), // empty is legitimate = fall back to lazygit
    hint: "The git UI launched by Ctrl+g. Empty falls back to lazygit.",
  },
  {
    id: "language.default",
    section: "language",
    key: "default",
    label: "Default language",
    kind: "enum",
    options: () => LANGUAGE_SLUGS,
    read: () => getDefaultLanguage(),
    coerce: (raw) => (LANGUAGE_SLUGS.includes(raw) ? raw : null),
  },
  {
    id: "scroll.jump_rows",
    section: "scroll",
    key: "jump_rows",
    label: "Scroll jump rows",
    kind: "number",
    read: () => String(getScrollJumpRows()),
    // Reject non-digits so the editor can flag a typo; a valid count is clamped
    // (≥1) exactly as the accessor would, and persisted as a bare TOML integer.
    coerce: (raw) => (/^\d+$/.test(raw.trim()) ? clampJumpRows(Number(raw.trim())) : null),
    hint: "How many rows Ctrl+d/Ctrl+u jump (a positive integer).",
  },
];
