// Pure analytics engine for the progress dashboard. Framework-free and unit-testable:
// no React, Zustand, or DB imports. The dashboardSlice calls computeDashboardStats(rows)
// with the result of getFirstAcSummary() and stores the returned DashboardStats.
//
// Two locked units (D-01, D-03):
//   - `solvedMs` / `firstAcMs` is unix MILLISECONDS — the DB stores submittedAt already
//     multiplied by 1000 at insert (backfill.ts:100 * 1000; submission.ts: Date.now()).
//     Convert to a local day with `new Date(ms).toLocaleDateString("en-CA")`. Do NOT
//     multiply by 1000 again.
//   - The single counting unit is a first-time distinct problem solve: MIN(submittedAt)
//     per questionId over Accepted rows. Re-solving an already-solved problem contributes
//     nothing to any count, streak, or breakdown (D-01).

// Input row from getFirstAcSummary() — one per solved problem, joined to difficulty.
export interface FirstAcSummaryRow {
  questionId: number;
  difficulty: string;
  firstAcMs: number; // unix milliseconds — MIN(submittedAt) for this questionId, AC only
}

// Internal row type used by the pure computation functions.
export interface FirstAcRow {
  questionId: number;
  solvedMs: number; // unix milliseconds (= firstAcMs renamed for clarity inside the module)
  difficulty: "Easy" | "Medium" | "Hard";
}

// The full stats shape consumed by DashboardView. heatmapGrid and sparklineWeeks are
// declared here for the type contract but populated in plan 03-03; computeDashboardStats
// leaves them empty for now.
export interface DashboardStats {
  totalSolved: number;
  byDifficulty: { Easy: number; Medium: number; Hard: number };
  currentStreak: number;
  longestStreak: number;
  last7: number;
  last30: number;
  consistency: number; // 0..1 (multiply by 100 for display %)
  heatmapGrid: number[][]; // [weekIndex 0..51][dow 0..6] — populated in 03-03
  sparklineWeeks: number[]; // [0..11] problems/week, newest last — populated in 03-03
}

// Convert a unix-millisecond timestamp to a YYYY-MM-DD local day key.
// Uses en-CA locale which always produces ISO 8601 date format.
// NOT exported — only the public surface is exported (mirrors progress.ts).
function toLocalDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA");
}

// Build the set of local-day keys on which ≥1 first-time AC occurred.
// Exported so it can be used by 03-03 heatmap builder; also unit-tested directly.
export function buildSolveDays(firstAcs: FirstAcRow[]): Set<string> {
  const days = new Set<string>();
  for (const row of firstAcs) {
    days.add(toLocalDayKey(row.solvedMs));
  }
  return days;
}

// Compute current and longest streaks from the solve-days set.
// Today-grace: a streak through yesterday stays "current" through end-of-today
// (inject today as a grace day if it has no solve yet), matching LeetCode's own
// streak behavior. YYYY-MM-DD keys sort correctly as strings (lexicographic = chronological).
//
// The grace day is used only to keep a streak from expiring before end-of-today —
// it does NOT increase the count. A streak of N real solve-days reports current = N
// even if injected today bridges it to today.
export function computeStreaks(solveDays: Set<string>): { current: number; longest: number } {
  if (solveDays.size === 0) return { current: 0, longest: 0 };

  // Sort day keys ascending. YYYY-MM-DD lexicographic order equals chronological order.
  const sorted = [...solveDays].sort();
  const todayKey = toLocalDayKey(Date.now());

  // Find runs of consecutive days in the real solve-days (no grace injection here).
  // We need both longest and the run ending at the most recent solve-day.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] as string);
    const curr = new Date(sorted[i] as string);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  // `run` is now the streak length ending at the most recent real solve-day.
  // `longest` is the maximum streak seen.

  // Determine if the current run (ending at the last real solve-day) is still active.
  // Today-grace rule: a run ending at yesterday OR today is considered "current".
  // A run ending 2+ days ago is expired.
  const lastDayKey = sorted[sorted.length - 1] as string;
  const lastDayMs = new Date(lastDayKey).getTime();
  const todayMs = new Date(todayKey).getTime();
  const daysSinceLastSolve = Math.round((todayMs - lastDayMs) / 86_400_000);

  // Current streak: the run ending at lastDayKey, only if it's within today-grace window.
  const current = daysSinceLastSolve <= 1 ? run : 0;

  return { current, longest };
}

// Count first-time solves (individual problems, not solve-days) in the 7- and 30-day windows.
export function computeRecentCounts(firstAcs: FirstAcRow[]): { last7: number; last30: number } {
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 86_400_000;
  const thirtyDaysAgoMs = nowMs - 30 * 86_400_000;
  let last7 = 0;
  let last30 = 0;
  for (const row of firstAcs) {
    if (row.solvedMs >= sevenDaysAgoMs) last7++;
    if (row.solvedMs >= thirtyDaysAgoMs) last30++;
  }
  return { last7, last30 };
}

// Rolling 30-day consistency: count of distinct solve-days inside the trailing 30-day window
// divided by 30. Returns a value in [0, 1].
export function computeConsistency(solveDays: Set<string>): number {
  if (solveDays.size === 0) return 0;
  const todayMs = Date.now();
  const thirtyDaysAgoMs = todayMs - 30 * 86_400_000;
  const todayKey = toLocalDayKey(todayMs);

  let count = 0;
  for (const day of solveDays) {
    // Parse day as UTC midnight — consistent with how keys are built (en-CA → YYYY-MM-DD).
    const dayMs = new Date(day).getTime();
    // Window: [thirtyDaysAgoMs, today] inclusive of today's local day.
    if (dayMs >= thirtyDaysAgoMs && day <= todayKey) {
      count++;
    }
  }
  return count / 30;
}

// Block glyph constants for the sparkline (mirrors progress.ts's EIGHTHS pattern).
// Prefixed with underscore here (stub phase); will become BLOCKS in GREEN implementation.
const _BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

// Build a 52×7 grid of first-solve counts, indexed [weekIndex][dow].
// weekIndex 0 = 52 weeks ago, weekIndex 51 = current week.
// dow: 0=Sunday..6=Saturday (matching Date.prototype.getDay() local time).
// Access pattern for rendering: grid[weekIndex][dow], where weekIndex iterates 0..51
// (left to right = oldest to newest) and dow iterates 0..6 (rows, top to bottom).
// Pitfall 3 guard: the grid is [weekIndex][dow], NOT [dow][weekIndex].
export function buildHeatmapGrid(_firstAcs: FirstAcRow[]): number[][] {
  throw new Error("buildHeatmapGrid: not implemented (03-03 GREEN)");
}

// Build a numWeeks-length array of first-solve counts per week.
// index 0 = oldest week, last index = most recent (current) week.
// Solves older than numWeeks are dropped.
export function buildWeeklyBuckets(_firstAcs: FirstAcRow[], _numWeeks = 12): number[] {
  throw new Error("buildWeeklyBuckets: not implemented (03-03 GREEN)");
}

// Convert weekly counts to a sparkline string of Unicode block glyphs.
// Empty array → "". 0-count week → space " ". Max-count week → tallest block "█".
// Output length always equals input length (one glyph per week).
export function buildSparkline(_weeklyCounts: number[]): string {
  throw new Error("buildSparkline: not implemented (03-03 GREEN)");
}

// Main entry point called by dashboardSlice.loadDashboardStats().
// Accepts the raw DB summary rows and returns all dashboard statistics.
export function computeDashboardStats(rows: FirstAcSummaryRow[]): DashboardStats {
  // 1. Total + difficulty breakdown
  const totalSolved = rows.length;
  const byDifficulty = { Easy: 0, Medium: 0, Hard: 0 };
  for (const r of rows) {
    const d = r.difficulty as keyof typeof byDifficulty;
    if (d in byDifficulty) byDifficulty[d]++;
  }

  // 2. Map to FirstAcRow[] (rename firstAcMs → solvedMs, narrow difficulty type)
  const firstAcs: FirstAcRow[] = rows.map((r) => ({
    questionId: r.questionId,
    solvedMs: r.firstAcMs,
    difficulty: (r.difficulty as FirstAcRow["difficulty"]) ?? "Easy",
  }));

  // 3. Build solve-days set
  const solveDays = buildSolveDays(firstAcs);

  // 4. Streak
  const { current: currentStreak, longest: longestStreak } = computeStreaks(solveDays);

  // 5. Recent counts
  const { last7, last30 } = computeRecentCounts(firstAcs);

  // 6. Consistency
  const consistency = computeConsistency(solveDays);

  // heatmapGrid and sparklineWeeks are populated in plan 03-03.
  return {
    totalSolved,
    byDifficulty,
    currentStreak,
    longestStreak,
    last7,
    last30,
    consistency,
    heatmapGrid: [],
    sparklineWeeks: [],
  };
}
