# Phase 1: Submission Store & Backfill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 1-Submission Store & Backfill
**Areas discussed:** Trigger & discovery, Progress experience, Refresh after first import, What gets imported

---

## Trigger & Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| Palette + first-run nudge | Always available via Ctrl+P, plus a one-time prompt on the first launch after this update lands. Reuses the changelog-popup / BootFlow onboarding pattern. | ✓ |
| Palette only | Ctrl+P command only, no nudge. Smallest surface but poor discoverability. | |
| Onboarding step | A BootFlow step right after auth (like git-init onboarding). Fires before the user has context. | |

**User's choice:** Palette + first-run nudge
**Notes:** Discovery without front-loading; the one-time nudge must fire once and never re-prompt, mirroring the Stage 18 "What's new" version-change detection.

---

## Progress Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Non-blocking + cancelable | A syncSlice progress bar runs while the user keeps browsing; cancel preserves partial data. Mirrors the existing first-run sync bar; satisfies the never-freeze-render requirement. | ✓ |
| Blocking modal + cancelable | A dedicated overlay owns the screen until done/canceled. Clearer but blocks browsing. | |

**User's choice:** Non-blocking + cancelable
**Notes:** Backfill should feel like a quiet background task the user can ignore and browse through.

---

## Refresh After First Import

| Option | Description | Selected |
|--------|-------------|----------|
| Incremental top-up | Re-run fetches only submissions newer than the cursor and stops early. Cheap and polite. | ✓ |
| Full re-scan every run | Always page through everything; idempotent upsert dedupes. Many more API calls each time. | |

**User's choice:** Incremental top-up
**Notes:** Distinguish a resume cursor (interrupted in-progress run) from a completed-import high-water mark; idempotent upsert on the `submissionId` PK is the safety net either way.

---

## What Gets Imported

| Option | Description | Selected |
|--------|-------------|----------|
| All attempts (AC/WA/TLE/CE) | Every submission with its status. Richer history, accurate attempt counts; matches DATA-02 and Phase 2 needs. | ✓ |
| Accepted-only | Only accepted submissions. Smaller/faster but loses the failed-attempt story. | |

**User's choice:** All attempts (AC/WA/TLE/CE)
**Notes:** The superset every later phase reads; modestly larger row count is acceptable.

---

## Claude's Discretion

- Inter-page delay default + 429 backoff curve — to be validated by the live rate-limit spike (plan 01-02) before locking.
- Failure-hint presentation surface (transient line vs. inline in the progress bar) — must be a clean never-crash hint per DATA-05.
- Exact cancel keybinding and palette command titles.

## Deferred Ideas

- Explicit "full re-import / rebuild" command (force a complete rescan) — not needed for the MVP; revisit for repairing a corrupted/partial store.
- Per-submission percentile enrichment for historical rows via `submissionDetails` — already tracked as v2 PERF-01; out of scope here.
