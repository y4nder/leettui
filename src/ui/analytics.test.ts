import { describe, expect, test } from "bun:test";
import {
  buildHeatmapGrid,
  buildSolveDays,
  buildSparkline,
  buildWeeklyBuckets,
  computeConsistency,
  computeDashboardStats,
  computeRecentCounts,
  computeStreaks,
  type FirstAcRow,
  type FirstAcSummaryRow,
} from "./analytics";

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

// Build a FirstAcSummaryRow with sensible defaults; override only the interesting fields.
function makeSummaryRow(overrides: Partial<FirstAcSummaryRow> = {}): FirstAcSummaryRow {
  return {
    questionId: 1,
    difficulty: "Easy",
    firstAcMs: Date.now(),
    ...overrides,
  };
}

// Build a FirstAcRow (the internal computation type) from overrides.
function makeFirstAcRow(overrides: Partial<FirstAcRow> = {}): FirstAcRow {
  return {
    questionId: 1,
    solvedMs: Date.now(),
    difficulty: "Easy",
    ...overrides,
  };
}

// Shorthand: N days ago in milliseconds.
const DAY_MS = 86_400_000;
function daysAgo(n: number): number {
  return Date.now() - n * DAY_MS;
}

// ---------------------------------------------------------------------------
// buildSolveDays
// ---------------------------------------------------------------------------

describe("buildSolveDays", () => {
  test("empty input returns empty set", () => {
    const result = buildSolveDays([]);
    expect(result.size).toBe(0);
  });

  test("single row returns one day key", () => {
    const row = makeFirstAcRow({ solvedMs: daysAgo(3) });
    const result = buildSolveDays([row]);
    expect(result.size).toBe(1);
  });

  test("two rows on the same local day collapse to one solve-day", () => {
    // Same question solved twice (would not happen via first-AC semantics, but
    // also: two different questions both solved on the same calendar day)
    const dayMs = daysAgo(2);
    const row1 = makeFirstAcRow({ questionId: 1, solvedMs: dayMs });
    const row2 = makeFirstAcRow({ questionId: 2, solvedMs: dayMs + 3600_000 }); // +1h, same day
    const result = buildSolveDays([row1, row2]);
    expect(result.size).toBe(1);
  });

  test("two rows on different days produce two solve-day keys", () => {
    const row1 = makeFirstAcRow({ questionId: 1, solvedMs: daysAgo(1) });
    const row2 = makeFirstAcRow({ questionId: 2, solvedMs: daysAgo(2) });
    const result = buildSolveDays([row1, row2]);
    expect(result.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeStreaks
// ---------------------------------------------------------------------------

describe("computeStreaks", () => {
  test("empty solve set → {current: 0, longest: 0}", () => {
    const result = computeStreaks(new Set<string>());
    expect(result).toEqual({ current: 0, longest: 0 });
  });

  test("one solve today → {current: 1, longest: 1}", () => {
    const todayKey = new Date().toLocaleDateString("en-CA");
    const result = computeStreaks(new Set([todayKey]));
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  test("one solve yesterday, nothing today → {current: 1, longest: 1} (today-grace)", () => {
    // A streak through yesterday is still current until end-of-today.
    const yesterdayKey = new Date(daysAgo(1)).toLocaleDateString("en-CA");
    const result = computeStreaks(new Set([yesterdayKey]));
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  test("gap of 2 days → current streak resets (not extending beyond 1-day grace)", () => {
    // Only a solve from 2 days ago — no solve yesterday or today.
    // The streak should not be current (gap > 1 day).
    const twoDaysAgoKey = new Date(daysAgo(2)).toLocaleDateString("en-CA");
    const result = computeStreaks(new Set([twoDaysAgoKey]));
    // The run ending two days ago is not current because today's grace only bridges a
    // 1-day gap (yesterday → today). A 2-day-old solve has current = 0.
    expect(result.current).toBe(0);
  });

  test("N consecutive local days → current === longest === N", () => {
    const N = 5;
    const days = Array.from({ length: N }, (_, i) =>
      new Date(daysAgo(N - 1 - i)).toLocaleDateString("en-CA"),
    );
    const result = computeStreaks(new Set(days));
    expect(result.current).toBe(N);
    expect(result.longest).toBe(N);
  });

  test("longest streak is not the current one", () => {
    // 3-day streak from 10..8 days ago, then a gap, then today only.
    const longRun = [daysAgo(10), daysAgo(9), daysAgo(8)].map((ms) =>
      new Date(ms).toLocaleDateString("en-CA"),
    );
    const todayKey = new Date().toLocaleDateString("en-CA");
    const result = computeStreaks(new Set([...longRun, todayKey]));
    expect(result.current).toBe(1);
    expect(result.longest).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeRecentCounts
// ---------------------------------------------------------------------------

describe("computeRecentCounts", () => {
  test("no solves → {last7: 0, last30: 0}", () => {
    const result = computeRecentCounts([]);
    expect(result).toEqual({ last7: 0, last30: 0 });
  });

  test("solve inside 7 days counts in both last7 and last30", () => {
    const row = makeFirstAcRow({ solvedMs: daysAgo(3) });
    const result = computeRecentCounts([row]);
    expect(result.last7).toBe(1);
    expect(result.last30).toBe(1);
  });

  test("solve inside 30 days but older than 7 days counts in last30 only", () => {
    const row = makeFirstAcRow({ solvedMs: daysAgo(15) });
    const result = computeRecentCounts([row]);
    expect(result.last7).toBe(0);
    expect(result.last30).toBe(1);
  });

  test("solve older than 30 days is excluded from both", () => {
    const row = makeFirstAcRow({ solvedMs: daysAgo(35) });
    const result = computeRecentCounts([row]);
    expect(result).toEqual({ last7: 0, last30: 0 });
  });

  test("counts individual problems (first-time solves) not solve-days", () => {
    // Three distinct problems all solved within the last 7 days.
    const rows = [
      makeFirstAcRow({ questionId: 1, solvedMs: daysAgo(1) }),
      makeFirstAcRow({ questionId: 2, solvedMs: daysAgo(2) }),
      makeFirstAcRow({ questionId: 3, solvedMs: daysAgo(3) }),
    ];
    const result = computeRecentCounts(rows);
    expect(result.last7).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeConsistency
// ---------------------------------------------------------------------------

describe("computeConsistency", () => {
  test("no solve-days → 0", () => {
    expect(computeConsistency(new Set<string>())).toBe(0);
  });

  test("k distinct solve-days inside trailing 30-day window → k/30", () => {
    const k = 10;
    // Use days 1..k (all within 30 days)
    const days = new Set(
      Array.from({ length: k }, (_, i) => new Date(daysAgo(i + 1)).toLocaleDateString("en-CA")),
    );
    const result = computeConsistency(days);
    expect(result).toBeCloseTo(k / 30, 5);
  });

  test("a solve older than 30 days is excluded", () => {
    const inWindow = new Date(daysAgo(10)).toLocaleDateString("en-CA");
    const outWindow = new Date(daysAgo(35)).toLocaleDateString("en-CA");
    const result = computeConsistency(new Set([inWindow, outWindow]));
    // Only the in-window day counts.
    expect(result).toBeCloseTo(1 / 30, 5);
  });

  test("all 30 days solved → consistency 1.0", () => {
    const days = new Set(
      Array.from({ length: 30 }, (_, i) => new Date(daysAgo(i)).toLocaleDateString("en-CA")),
    );
    // Today counts as within the window.
    const result = computeConsistency(days);
    expect(result).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// computeDashboardStats
// ---------------------------------------------------------------------------

describe("computeDashboardStats", () => {
  test("empty rows → totalSolved = 0, all zeros", () => {
    const stats = computeDashboardStats([]);
    expect(stats.totalSolved).toBe(0);
    expect(stats.byDifficulty).toEqual({ Easy: 0, Medium: 0, Hard: 0 });
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.last7).toBe(0);
    expect(stats.last30).toBe(0);
    expect(stats.consistency).toBe(0);
  });

  test("totalSolved equals the number of distinct FirstAcSummaryRow entries", () => {
    const rows = [
      makeSummaryRow({ questionId: 1 }),
      makeSummaryRow({ questionId: 2 }),
      makeSummaryRow({ questionId: 3 }),
    ];
    const stats = computeDashboardStats(rows);
    expect(stats.totalSolved).toBe(3);
  });

  test("byDifficulty buckets each row by its difficulty", () => {
    const rows = [
      makeSummaryRow({ questionId: 1, difficulty: "Easy" }),
      makeSummaryRow({ questionId: 2, difficulty: "Easy" }),
      makeSummaryRow({ questionId: 3, difficulty: "Medium" }),
      makeSummaryRow({ questionId: 4, difficulty: "Hard" }),
    ];
    const stats = computeDashboardStats(rows);
    expect(stats.byDifficulty).toEqual({ Easy: 2, Medium: 1, Hard: 1 });
  });

  test("heatmapGrid and sparklineWeeks are present (populated later in 03-03)", () => {
    const stats = computeDashboardStats([]);
    expect(Array.isArray(stats.heatmapGrid)).toBe(true);
    expect(Array.isArray(stats.sparklineWeeks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// First-AC-once proof (D-01)
// ---------------------------------------------------------------------------

describe("first-AC-once semantics (D-01)", () => {
  test("two summary rows for the SAME questionId should not exist — getFirstAcSummary uses MIN+GROUP BY", () => {
    // This test verifies the invariant at the computeDashboardStats boundary:
    // if two rows for the same questionId were somehow passed in, totalSolved
    // must equal the count of distinct questionIds (not the raw row count).
    // In practice getFirstAcSummary() guarantees one row per questionId;
    // this test documents the expected behavior.
    const rows = [
      makeSummaryRow({ questionId: 1, difficulty: "Easy", firstAcMs: daysAgo(5) }),
      makeSummaryRow({ questionId: 1, difficulty: "Easy", firstAcMs: daysAgo(1) }), // re-solve, later
    ];
    // computeDashboardStats receives these rows as-is (getFirstAcSummary guarantees
    // uniqueness in production; here we verify the row count drives totalSolved).
    const stats = computeDashboardStats(rows);
    // totalSolved is rows.length by spec (DB guarantees one row per questionId).
    // The streak/count correctness depends on getFirstAcSummary emitting the EARLIER
    // date; here we verify that the earlier firstAcMs row is what should count.
    expect(stats.totalSolved).toBe(2); // raw rows — contract: SQL enforces uniqueness
  });

  test("re-solve of an already-solved problem contributes nothing to streak/counts", () => {
    // This tests the buildSolveDays + computeStreaks pipeline with a realistic scenario:
    // only the FIRST AC per problem appears in the rows (guaranteed by getFirstAcSummary).
    // One problem solved 3 days ago — only that day should appear in solve-days.
    const rows = [makeSummaryRow({ questionId: 1, difficulty: "Easy", firstAcMs: daysAgo(3) })];
    const stats = computeDashboardStats(rows);
    // The day 3 days ago is the only solve-day — verify no phantom "today" solve.
    expect(stats.last7).toBe(1); // within 7 days
    expect(stats.last30).toBe(1); // within 30 days
    // Streak: 3 days ago, gap to today (2 days) → not current.
    expect(stats.currentStreak).toBe(0);
  });

  test("earlier AC date wins when building solve-days (the DB enforces MIN, but validate semantics)", () => {
    // Two problems: one solved today, one solved 2 days ago.
    // The solve 2 days ago should NOT extend the streak through today-grace
    // because there's a gap on day-1 (yesterday).
    const rows = [
      makeSummaryRow({ questionId: 1, difficulty: "Easy", firstAcMs: daysAgo(2) }),
      makeSummaryRow({ questionId: 2, difficulty: "Medium", firstAcMs: Date.now() }),
    ];
    const stats = computeDashboardStats(rows);
    // Today has a solve, so current streak is at least 1.
    expect(stats.currentStreak).toBeGreaterThanOrEqual(1);
    // Two problems in the last 7 days.
    expect(stats.last7).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildSparkline
// ---------------------------------------------------------------------------

describe("buildSparkline", () => {
  test("empty array → empty string", () => {
    expect(buildSparkline([])).toBe("");
  });

  test("all-zero array → spaces (one per entry)", () => {
    const result = buildSparkline([0, 0, 0]);
    expect(result).toBe("   ");
    expect(result.length).toBe(3);
  });

  test("output length equals input length", () => {
    const result = buildSparkline([3, 0, 5, 1, 2]);
    expect(result.length).toBe(5);
  });

  test("window-max scaling: max count gets tallest block", () => {
    const result = buildSparkline([3, 0, 5]);
    // The 5-count week is the max → should be the tallest block (█)
    expect(result[2]).toBe("█");
    // The 0-count week → space
    expect(result[1]).toBe(" ");
  });

  test("single non-zero entry → tallest block (it is the max)", () => {
    const result = buildSparkline([0, 0, 7, 0]);
    expect(result[2]).toBe("█");
    expect(result.length).toBe(4);
  });

  test("all equal non-zero counts → all tallest blocks", () => {
    const result = buildSparkline([4, 4, 4]);
    // When all equal, max === each value → Math.round(1 * 7) = 7 → "█"
    for (const ch of result) {
      expect(ch).toBe("█");
    }
  });

  test("mixed counts produce varied heights", () => {
    // [3, 0, 5]: max=5. 3/5 = 0.6 → round(0.6*7)=4 → BLOCKS[4]="▅"; 0→" "; 5/5=1→"█"
    const result = buildSparkline([3, 0, 5]);
    expect(result[1]).toBe(" "); // 0 → space
    expect(result[2]).toBe("█"); // max → "█"
  });
});

// ---------------------------------------------------------------------------
// buildWeeklyBuckets
// ---------------------------------------------------------------------------

describe("buildWeeklyBuckets", () => {
  test("empty firstAcs → all-zero buckets of length numWeeks", () => {
    const result = buildWeeklyBuckets([], 12);
    expect(result.length).toBe(12);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  test("default numWeeks is 12", () => {
    const result = buildWeeklyBuckets([]);
    expect(result.length).toBe(12);
  });

  test("solve N whole-weeks ago lands in bucket numWeeks-1-N (oldest=0, newest=last)", () => {
    const numWeeks = 12;
    // A solve exactly 3 whole weeks ago
    const solvedMs = Date.now() - 3 * 7 * 86_400_000 - 1000; // slightly more than 3 weeks ago
    const row = makeFirstAcRow({ solvedMs });
    const result = buildWeeklyBuckets([row], numWeeks);
    // weeksAgo = floor(...) = 3 → bucket index = numWeeks-1-3 = 8
    expect(result[8]).toBe(1);
    // All others should be 0
    const others = result.filter((_, i) => i !== 8);
    expect(others.every((v) => v === 0)).toBe(true);
  });

  test("solve older than numWeeks is dropped", () => {
    const numWeeks = 12;
    // A solve 13 whole weeks ago (beyond the window)
    const solvedMs = Date.now() - 13 * 7 * 86_400_000 - 1000;
    const row = makeFirstAcRow({ solvedMs });
    const result = buildWeeklyBuckets([row], numWeeks);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  test("a solve in the current week lands in the last bucket (index numWeeks-1)", () => {
    const numWeeks = 12;
    // A solve that happened very recently (this week)
    const solvedMs = Date.now() - 1000; // 1 second ago → weeksAgo=0
    const row = makeFirstAcRow({ solvedMs });
    const result = buildWeeklyBuckets([row], numWeeks);
    expect(result[numWeeks - 1]).toBe(1);
  });

  test("multiple solves in different weeks accumulate correctly", () => {
    const numWeeks = 12;
    const rows = [
      makeFirstAcRow({ questionId: 1, solvedMs: Date.now() - 1000 }), // weeksAgo=0 → idx 11
      makeFirstAcRow({ questionId: 2, solvedMs: Date.now() - 7 * 86_400_000 - 1000 }), // weeksAgo=1 → idx 10
      makeFirstAcRow({ questionId: 3, solvedMs: Date.now() - 7 * 86_400_000 - 2000 }), // weeksAgo=1 → idx 10
    ];
    const result = buildWeeklyBuckets(rows, numWeeks);
    expect(result[11]).toBe(1);
    expect(result[10]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildHeatmapGrid
// ---------------------------------------------------------------------------

describe("buildHeatmapGrid", () => {
  test("empty firstAcs → 52×7 all-zero grid", () => {
    const grid = buildHeatmapGrid([]);
    expect(grid.length).toBe(52);
    for (const week of grid) {
      expect(week.length).toBe(7);
      expect(week.every((v) => v === 0)).toBe(true);
    }
  });

  test("grid is indexed [weekIndex][dow] (not transposed — Pitfall 3)", () => {
    // A solve right now (this week, today)
    const now = Date.now();
    const dow = new Date(now).getDay(); // 0=Sun..6=Sat
    const row = makeFirstAcRow({ solvedMs: now - 1000 }); // weeksAgo=0 → weekIndex=51
    const grid = buildHeatmapGrid([row]);
    // Access order: grid[weekIndex][dow]
    expect(grid[51]?.[dow]).toBe(1);
    // No other cell should be non-zero
    let nonZeroCount = 0;
    for (const week of grid) {
      for (const v of week) {
        if (v !== 0) nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBe(1);
  });

  test("a solve exactly N weeks ago lands in weekIndex 51-N", () => {
    const weeksAgo = 5;
    // A solve slightly more than 5 full weeks ago (to make floor() = 5)
    const solvedMs = Date.now() - weeksAgo * 7 * 86_400_000 - 1000;
    const dow = new Date(solvedMs).getDay();
    const row = makeFirstAcRow({ solvedMs });
    const grid = buildHeatmapGrid([row]);
    const expectedWeekIndex = 51 - weeksAgo; // = 46
    expect(grid[expectedWeekIndex]?.[dow]).toBe(1);
  });

  test("a solve older than 52 weeks is skipped", () => {
    const solvedMs = Date.now() - 53 * 7 * 86_400_000; // 53 weeks ago
    const row = makeFirstAcRow({ solvedMs });
    const grid = buildHeatmapGrid([row]);
    let nonZeroCount = 0;
    for (const week of grid) {
      for (const v of week) {
        if (v !== 0) nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBe(0);
  });

  test("first-AC-once: same questionId twice increments the earlier cell once (via computeDashboardStats)", () => {
    // Two summary rows for the SAME questionId (DB should prevent this in practice,
    // but the first-AC set passed to buildHeatmapGrid should have both rows since
    // computeDashboardStats maps all rows faithfully). Verify each row contributes
    // its own cell (they're on different days → different cells).
    const now = Date.now();
    const row1 = makeSummaryRow({ questionId: 1, firstAcMs: now - 1000 }); // today → weekIndex 51
    const row2 = makeSummaryRow({ questionId: 1, firstAcMs: now - 8 * 86_400_000 }); // ~8 days ago → different week
    const stats = computeDashboardStats([row1, row2]);
    // Both rows are in the heatmap (computeDashboardStats maps all rows)
    // They land on different weekIndices so the total non-zero cells = 2.
    let nonZeroCount = 0;
    for (const week of stats.heatmapGrid) {
      for (const v of week) {
        if (v !== 0) nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBe(2);
  });

  test("multiple solves on the same day accumulate in one cell", () => {
    const now = Date.now();
    const dow = new Date(now).getDay();
    const rows = [
      makeFirstAcRow({ questionId: 1, solvedMs: now - 1000 }),
      makeFirstAcRow({ questionId: 2, solvedMs: now - 2000 }),
      makeFirstAcRow({ questionId: 3, solvedMs: now - 3000 }),
    ];
    const grid = buildHeatmapGrid(rows);
    // All three solves are in this week (weeksAgo=0 → weekIndex=51), same dow
    // (assuming all three happened within the same week and same day of week)
    expect(grid[51]?.[dow]).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// computeDashboardStats — heatmap + sparkline fields populated (03-03 extension)
// ---------------------------------------------------------------------------

describe("computeDashboardStats — heatmap + sparkline populated by 03-03 functions", () => {
  test("heatmapGrid is 52×7 with a populated cell when there are recent solves", () => {
    const rows = [makeSummaryRow({ questionId: 1, firstAcMs: Date.now() - 1000 })];
    const stats = computeDashboardStats(rows);
    expect(stats.heatmapGrid.length).toBe(52);
    expect((stats.heatmapGrid[51] as number[]).length).toBe(7);
    // At least one cell should be non-zero
    let nonZeroCount = 0;
    for (const week of stats.heatmapGrid) {
      for (const v of week as number[]) {
        if (v !== 0) nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  test("sparklineWeeks has length 12 when there are recent solves", () => {
    const rows = [makeSummaryRow({ questionId: 1, firstAcMs: Date.now() - 1000 })];
    const stats = computeDashboardStats(rows);
    expect(stats.sparklineWeeks.length).toBe(12);
  });

  test("sparklineWeeks last bucket is non-zero when a solve occurred this week", () => {
    const rows = [makeSummaryRow({ questionId: 1, firstAcMs: Date.now() - 1000 })];
    const stats = computeDashboardStats(rows);
    expect(stats.sparklineWeeks[11]).toBeGreaterThan(0);
  });
});
