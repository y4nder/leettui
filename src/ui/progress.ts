// Pure progress-bar geometry shared by the sync UIs (the full-screen `SyncStep`
// and the in-app re-sync `ProgressBar`). Framework-free so it's unit-testable;
// the components color the returned runs with theme tokens.

// Fractional left-aligned block glyphs, 0/8 … 7/8 of a cell.
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

// A determinate bar with sub-cell precision: the trailing partial cell is drawn
// with a fractional block glyph so the fill advances smoothly instead of a whole
// cell at a time. Returns the filled and empty runs separately so each can be
// colored independently (accent fill over a dim track).
export function smoothBar(ratio: number, width: number): { filled: string; empty: string } {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const eighths = Math.round(clamped * width * 8);
  const full = Math.min(Math.floor(eighths / 8), width);
  const rem = eighths % 8;
  let filled = "█".repeat(full);
  let cells = full;
  if (rem > 0 && cells < width) {
    filled += EIGHTHS[rem];
    cells += 1;
  }
  return { filled, empty: "░".repeat(Math.max(0, width - cells)) };
}

// An indeterminate "sweep": a solid block that bounces back and forth across the
// track, used while there's no total yet. Returns the three runs (dim track /
// accent block / dim track) so the caller colors them. `tick` is a monotonic
// frame counter (see `useTick`).
export function sweepBar(
  width: number,
  tick: number,
  blockSize = Math.max(3, Math.round(width / 5)),
): { pre: string; block: string; post: string } {
  const block = Math.min(blockSize, width);
  const span = Math.max(1, width - block);
  const period = span * 2;
  const p = ((tick % period) + period) % period;
  const pos = p <= span ? p : period - p;
  return {
    pre: "░".repeat(pos),
    block: "█".repeat(block),
    post: "░".repeat(Math.max(0, width - block - pos)),
  };
}
