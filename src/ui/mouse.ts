// Pure decision helpers for list mouse support — no React/OpenTUI imports, unit-tested
// (the progress.ts precedent). The stateful wiring lives in useListMouse.ts.

/** What a left-button press on a list row should do. */
export type RowClickAction = "focusAndSelect" | "select" | "activate";

// lazygit-style two-step: a click on an unfocused panel only claims focus (+ moves the
// highlight) — even on the panel's already-selected row — so a stray click can never run
// a row action (e.g. open $EDITOR) the user hasn't seen highlighted in a focused panel.
// Activation requires the panel focused AND the row already selected at press time.
export function resolveRowClick(opts: {
  clickedIndex: number;
  selectedIndex: number;
  panelFocused: boolean;
}): RowClickAction {
  if (!opts.panelFocused) return "focusAndSelect";
  if (opts.clickedIndex !== opts.selectedIndex) return "select";
  return "activate";
}

// Rows the cursor moves per wheel event. Terminals emit one SGR event per wheel tick
// (delta is 1 in practice), so 1 row per event is exact j/k parity.
export const WHEEL_ROWS = 1;

/** Signed cursor delta for a wheel event; 0 for horizontal/unknown directions. */
export function wheelRows(direction: string | undefined, delta: number): number {
  if (direction === "up") return -delta * WHEEL_ROWS;
  if (direction === "down") return delta * WHEEL_ROWS;
  return 0;
}
