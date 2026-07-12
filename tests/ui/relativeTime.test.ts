import { describe, expect, test } from "bun:test";
import { formatRelative } from "@/ui/relativeTime";

const NOW = 1_700_000_000_000;
const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("formatRelative", () => {
  test("under a minute reads 'just now'", () => {
    expect(formatRelative(NOW, NOW)).toBe("just now");
    expect(formatRelative(NOW - 59 * SEC, NOW)).toBe("just now");
  });

  test("a future timestamp (clock skew) reads 'just now'", () => {
    expect(formatRelative(NOW + 5 * MIN, NOW)).toBe("just now");
  });

  test("minutes", () => {
    expect(formatRelative(NOW - 1 * MIN, NOW)).toBe("1m ago");
    expect(formatRelative(NOW - 59 * MIN, NOW)).toBe("59m ago");
  });

  test("hours", () => {
    expect(formatRelative(NOW - 1 * HR, NOW)).toBe("1h ago");
    expect(formatRelative(NOW - 23 * HR, NOW)).toBe("23h ago");
  });

  test("days", () => {
    expect(formatRelative(NOW - 1 * DAY, NOW)).toBe("1d ago");
    expect(formatRelative(NOW - 6 * DAY, NOW)).toBe("6d ago");
  });

  test("weeks", () => {
    expect(formatRelative(NOW - 7 * DAY, NOW)).toBe("1w ago");
    expect(formatRelative(NOW - 29 * DAY, NOW)).toBe("4w ago");
  });

  test("months", () => {
    expect(formatRelative(NOW - 30 * DAY, NOW)).toBe("1mo ago");
    expect(formatRelative(NOW - 364 * DAY, NOW)).toBe("12mo ago");
  });

  test("years", () => {
    expect(formatRelative(NOW - 365 * DAY, NOW)).toBe("1y ago");
    expect(formatRelative(NOW - 800 * DAY, NOW)).toBe("2y ago");
  });
});
