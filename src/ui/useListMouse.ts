// Shared mouse wiring for every list surface: click to select (focusing the panel if
// needed), click the selected row again to activate, wheel to scroll (see onWheel).
// The pure decision logic lives in mouse.ts; this file adapts it to OpenTUI MouseEvents
// and returns prop bags to spread onto the existing elements — rows keep their
// heterogeneous layouts and closure-scoped real indices, so there's no y-coordinate math.

import type { MouseEvent } from "@opentui/core";
import { resolveRowClick, wheelRows } from "./mouse";
import { useAppStore } from "./store";

export interface ListMouseOptions {
  // Live guard evaluated per event (mode / sub-modal checks). Default: always on.
  // Needed because a click outside an open popup still hits the panels behind it.
  enabled?: () => boolean;
  // Whether this list's panel currently holds focus. Default: always true (popups
  // and modals are topmost, so they get pure select/activate semantics).
  isFocused?: () => boolean;
  // Claim panel focus. Runs on "focusAndSelect" and on header/empty-space clicks
  // (via containerProps). Omit for popups — their container clicks stay inert.
  focus?: () => void;
  // Live reads (not captured values) so a click landing between a state change and
  // the re-render can't misroute to a stale index.
  getSelectedIndex: () => number;
  select: (index: number) => void;
  // Optional — HistoryPanel is navigate-only (Enter deliberately unbound, D-10).
  activate?: (index: number) => void;
  // One wheel tick of deltaRows (signed). Windowed lists scroll the VIEWPORT here
  // (useScrollableList.scrollBy — the highlight is dragged along only at the comfort-
  // zone edges); short fully-rendered lists (SolutionsPanel, scrollbox popups) move
  // the cursor instead, where viewport scrolling would be a no-op.
  onWheel: (deltaRows: number) => void;
}

export interface ListMouse {
  rowProps: (index: number) => { onMouseDown: (event: MouseEvent) => void };
  containerProps: {
    onMouseScroll: (event: MouseEvent) => void;
    onMouseDown?: (event: MouseEvent) => void;
  };
}

export function useListMouse(opts: ListMouseOptions): ListMouse {
  const enabled = () => opts.enabled?.() ?? true;

  const rowProps = (index: number) => ({
    onMouseDown: (event: MouseEvent) => {
      if (event.button !== 0 || !enabled()) return;
      // Rows swallow the press so the container's focus-only handler can't double-run.
      event.stopPropagation();
      const action = resolveRowClick({
        clickedIndex: index,
        selectedIndex: opts.getSelectedIndex(),
        panelFocused: opts.isFocused?.() ?? true,
      });
      if (action === "focusAndSelect") {
        opts.focus?.();
        opts.select(index);
      } else if (action === "select") {
        opts.select(index);
      } else {
        // No re-select on activate: for topics, setTopicIndex would reset the
        // question cursor and re-schedule a load the selection already settled.
        opts.activate?.(index);
      }
    },
  });

  const containerProps: ListMouse["containerProps"] = {
    onMouseScroll: (event: MouseEvent) => {
      if (!enabled()) return;
      const rows = wheelRows(event.scroll?.direction, event.scroll?.delta ?? 0);
      if (rows === 0) return;
      // Swallow the event so an enclosing scrollbox can't also content-scroll.
      event.stopPropagation();
      opts.onWheel(rows);
    },
  };
  if (opts.focus) {
    const focus = opts.focus;
    containerProps.onMouseDown = (event: MouseEvent) => {
      // Clicks on the panel's title row, border, or empty space below the last row
      // claim focus only; row presses never bubble here (they stopPropagation).
      if (event.button !== 0 || !enabled()) return;
      focus();
    };
  }

  return { rowProps, containerProps };
}

// Shared enabled() guard for the problem view's mouse surfaces: mirrors the exact
// gating ProblemView applies to its binding layers (no sub-modal open), so a click
// outside an open picker/notes/help/delete-confirm can't reach the panels behind it.
export function problemPanelMouseEnabled(): boolean {
  const s = useAppStore.getState();
  const p = s.problem;
  return (
    s.mode === "problem" &&
    p !== null &&
    !p.solutionPicker &&
    !p.notes &&
    !p.help &&
    !p.deleteConfirm &&
    !p.resultFullscreen
  );
}
