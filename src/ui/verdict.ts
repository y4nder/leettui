// Pure, never-throws derivations over `submissions.statusDisplay`/`runtime`/`lang` —
// free text sourced from two different unofficial LeetCode API surfaces (live submit
// vs. historical backfill, Phase 1 Pitfall 2). Every helper here must tolerate
// malformed/unexpected input by returning a safe fallback, mirroring
// `core/backfill.ts`'s `mapSubmission()` guards. Feeds `HistoryPanel` (HIST-01/02/03).

import { colors } from "./theme";
import type { ThemeColor } from "./themes";
import type { DbSubmission } from "../db/submissions";

// D-02: verdict → color, substring-matched (not exact `===`) since statusDisplay comes
// from two independently reverse-engineered API surfaces that may not be byte-identical
// for every verdict. Order matters: "Accepted" is checked first. Unmapped strings fall
// through to fgDim rather than throwing or defaulting to an "important-looking" color.
export function verdictColor(statusDisplay: string): ThemeColor {
  if (statusDisplay.includes("Accepted")) return colors.success;
  if (statusDisplay.includes("Wrong Answer")) return colors.error;
  if (statusDisplay.includes("Time Limit")) return colors.warn;
  if (statusDisplay.includes("Memory Limit")) return colors.error;
  if (statusDisplay.includes("Runtime")) return colors.error;
  if (statusDisplay.includes("Compile")) return colors.subtle;
  return colors.fgDim; // known-unmapped fallback — never throws
}

// D-01: the glyph only distinguishes pass vs fail — verdictColor carries the
// per-verdict distinction (WA vs TLE vs CE all render "✗", just differently colored).
export function verdictGlyph(statusDisplay: string): string {
  return statusDisplay.includes("Accepted") ? "✓" : "✗";
}

// Parses the confirmed `"<number> ms"` shape (Phase 1 live spike, e.g. "52 ms").
// Deliberately narrow (ms-only, per RESEARCH A2) — returns null (never NaN, never
// throws) for null/empty input or any unrecognized format, so a malformed/foreign
// unit is excluded from downstream comparisons rather than poisoning them.
export function parseRuntimeMs(runtime: string | null): number | null {
  if (!runtime) return null;
  const m = /^([\d.]+)\s*ms$/.exec(runtime.trim());
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : n;
}

// Display-abbreviation table for the compact History row (D-01's `py3` target) —
// deliberately distinct from `LANGUAGE_EXTENSIONS` (api/types.ts), which maps
// python3 -> "py" (a file extension, the wrong string for this row). Unmapped
// langSlugs fall back to the raw slug rather than throwing.
const LANG_ABBREV: Record<string, string> = {
  python3: "py3",
  python: "py",
  javascript: "js",
  typescript: "ts",
  cpp: "cpp",
  csharp: "cs",
  java: "java",
  c: "c",
  golang: "go",
  rust: "rs",
  kotlin: "kt",
  ruby: "rb",
  swift: "swift",
  scala: "scala",
  php: "php",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  racket: "rkt",
  mysql: "sql",
};

export function langAbbrev(langSlug: string): string {
  return LANG_ABBREV[langSlug] ?? langSlug;
}

// HIST-02/D-05/D-06/D-07: best (fastest PRIOR accepted runtime) vs latest accepted
// runtime, with a direction. `rows` arrive newest-first (getSubmissionsForQuestion).
export interface AcRuntimeSummary {
  bestMs: number;
  latestMs: number;
  direction: "improved" | "regressed" | "matched";
}

export function summarizeAcRuntime(rows: DbSubmission[]): AcRuntimeSummary | null {
  const acMs: number[] = [];
  for (const row of rows) {
    if (!row.statusDisplay.includes("Accepted")) continue;
    const ms = parseRuntimeMs(row.runtime);
    if (ms == null) continue;
    acMs.push(ms);
  }
  // D-06: hidden until 2+ accepted-with-parseable-runtime submissions exist.
  if (acMs.length < 2) return null;

  const latestMs = acMs[0]!; // rows are newest-first, so index 0 is the latest AC
  // "Best" excludes the latest — it's the user's previous best, so the arrow is
  // meaningful (with best = overall-min including latest, latest could never beat it).
  const priorMs = acMs.slice(1);
  const bestMs = Math.min(...priorMs);

  const direction: AcRuntimeSummary["direction"] =
    latestMs < bestMs ? "improved" : latestMs > bestMs ? "regressed" : "matched";

  return { bestMs, latestMs, direction };
}
