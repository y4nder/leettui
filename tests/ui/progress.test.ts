import { describe, expect, test } from "bun:test";

import { smoothBar, sweepBar } from "@/ui/progress";

describe("smoothBar", () => {
  test("empty at 0", () => {
    const { filled, empty } = smoothBar(0, 10);
    expect(filled).toBe("");
    expect(empty).toBe("░".repeat(10));
  });

  test("full at 1", () => {
    const { filled, empty } = smoothBar(1, 10);
    expect(filled).toBe("█".repeat(10));
    expect(empty).toBe("");
  });

  test("half fills whole cells", () => {
    const { filled, empty } = smoothBar(0.5, 10);
    expect(filled).toBe("█".repeat(5));
    expect(empty).toBe("░".repeat(5));
  });

  test("draws a fractional trailing cell", () => {
    // 0.3125 * 4 = 1.25 cells → one full block + a 2/8 partial.
    const { filled, empty } = smoothBar(0.3125, 4);
    expect(filled).toBe("█▎");
    expect(empty).toBe("░░");
  });

  test("filled + empty always span the full width (no partial)", () => {
    for (const r of [0, 0.5, 1]) {
      const { filled, empty } = smoothBar(r, 12);
      expect(filled.length + empty.length).toBe(12);
    }
  });

  test("clamps out-of-range and non-finite ratios", () => {
    expect(smoothBar(2, 8).filled).toBe("█".repeat(8));
    expect(smoothBar(-1, 8).filled).toBe("");
    expect(smoothBar(Number.NaN, 8).filled).toBe("");
  });
});

describe("sweepBar", () => {
  test("runs always total the track width", () => {
    for (let tick = 0; tick < 40; tick++) {
      const { pre, block, post } = sweepBar(20, tick);
      expect(pre.length + block.length + post.length).toBe(20);
    }
  });

  test("block starts at the left edge and bounces back", () => {
    const start = sweepBar(20, 0, 4);
    expect(start.pre).toBe("");
    // span = 16, period = 32; tick 16 is the far edge.
    const far = sweepBar(20, 16, 4);
    expect(far.post).toBe("");
    // tick 32 returns to the start.
    expect(sweepBar(20, 32, 4).pre).toBe("");
  });
});
