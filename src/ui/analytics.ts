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
function _toLocalDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA");
}

// Build the set of local-day keys on which ≥1 first-time AC occurred.
// NOT exported — internal helper consumed by computeDashboardStats.
export function buildSolveDays(_firstAcs: FirstAcRow[]): Set<string> {
  throw new Error("not implemented");
}

// Compute current and longest streaks from the solve-days set.
// Today-grace: a streak through yesterday stays "current" through end-of-today
// (inject today as a grace day if it has no solve yet), matching LeetCode's own
// streak behavior. YYYY-MM-DD keys sort correctly as strings (lexicographic = chronological).
export function computeStreaks(_solveDays: Set<string>): { current: number; longest: number } {
  throw new Error("not implemented");
}

// Count first-time solves (individual problems, not solve-days) in the 7- and 30-day windows.
export function computeRecentCounts(_firstAcs: FirstAcRow[]): { last7: number; last30: number } {
  throw new Error("not implemented");
}

// Rolling 30-day consistency: count of distinct solve-days inside the trailing 30-day window
// divided by 30. Returns a value in [0, 1].
export function computeConsistency(_solveDays: Set<string>): number {
  throw new Error("not implemented");
}

// Main entry point called by dashboardSlice.loadDashboardStats().
// Accepts the raw DB summary rows and returns all dashboard statistics.
export function computeDashboardStats(_rows: FirstAcSummaryRow[]): DashboardStats {
  throw new Error("not implemented");
}
