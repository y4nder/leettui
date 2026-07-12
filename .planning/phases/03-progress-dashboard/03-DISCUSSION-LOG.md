# Phase 3: Progress Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 3-Progress Dashboard
**Areas discussed:** "Solve" semantics, Layout & hierarchy, Interactivity model, Heatmap & empty-data

---

## "Solve" Semantics

### Total solved count (DASH-02)
| Option | Description | Selected |
|--------|-------------|----------|
| Distinct problems AC'd | Count each problem once, on first AC — matches LeetCode's solved number | ✓ |
| Every AC submission | Count every accepted submission; re-solves inflate the total | |

### Solve-day definition (streak / consistency / heatmap)
| Option | Description | Selected |
|--------|-------------|----------|
| Any AC that day | A day counts if you got any AC, including re-solving an old problem | |
| Only a new problem | A day counts only if you solved a problem for the first time that day | ✓ |

### What drives heatmap intensity / 7-30d counts / sparkline
| Option | Description | Selected |
|--------|-------------|----------|
| AC solves per day | Accepted submissions per day; failed-only days empty | ✓ |
| All submissions per day | Every submission incl. WA/TLE — shows effort but mixes units | |

### Reconciliation — a re-solve-only day (no new problems)
| Option | Description | Selected |
|--------|-------------|----------|
| Empty / zero everywhere | One unit: first-time solves. Re-solve-only day blank everywhere | ✓ |
| Lit on heatmap, but no streak | Heatmap counts any AC; streak needs a new problem (two units) | |

**User's choice:** The entire dashboard measures **first-time distinct problem
solves**. A problem counts once, on its first-AC date; re-solves never count
toward total, streak, counts, heatmap, or consistency.
**Notes:** The three initial answers had a latent tension ("only a new problem"
solve-day vs "AC solves per day" intensity); the reconciling question resolved it
to a single consistent unit — a re-solve-only day is blank/zero everywhere.

---

## Layout & Hierarchy

### Arrangement
| Option | Description | Selected |
|--------|-------------|----------|
| Summary cards → heatmap → trend | Headline numbers first (streak leads), calendar middle, sparkline bottom | ✓ |
| Heatmap-led | 52-week calendar dominates top; numbers in a strip below | |
| Labeled stacked sections | Each metric its own labeled list-style row | |

### Overflow on a short terminal
| Option | Description | Selected |
|--------|-------------|----------|
| Scroll (j/k) | Scrollable viewport; reuses the popup-scroller pattern | ✓ |
| Static fit, degrade gracefully | Fixed layout; trim/hide low-priority widgets when short | |

**User's choice:** Summary cards (streak leads) → heatmap → trend, in a
scrollable viewport.
**Notes:** Approved the ASCII layout preview verbatim.

---

## Interactivity Model

### Interaction level
| Option | Description | Selected |
|--------|-------------|----------|
| Read-only (scroll + exit) | j/k + Ctrl+d/u scroll, Esc/q exit; nothing focusable | ✓ |
| Focusable + drill-down | Focusable panels; Enter filters browse / opens a day's solves | |

### Open key
| Option | Description | Selected |
|--------|-------------|----------|
| p (progress) | Mnemonic for progress; free in browse | ✓ |
| a (analytics) | Mnemonic for analytics/activity | |
| P (shift-p) | Capital P, deliberate "big view" key | |

### Open scope
| Option | Description | Selected |
|--------|-------------|----------|
| Browse + problem view | Truly global — one extra binding in problemGlobalBindings | ✓ |
| Browse only | Simpler, one binding, less global | |

### Return target (opened from a problem, then Esc)
| Option | Description | Selected |
|--------|-------------|----------|
| Back where you opened it | Esc pops back to the problem (state intact); browse→browse | ✓ |
| Always back to browse | Literal DASH-01 wording; drops you out of the problem | |

**User's choice:** Read-only; opens with `p` from both browse and problem view;
Esc returns to the origin mode (back to the problem when opened from one).
**Notes:** Drill-down deferred. Return-to-origin extends DASH-01's literal
"returns to browse" so problem context isn't lost.

---

## Heatmap & Empty-Data

### Cell intensity encoding
| Option | Description | Selected |
|--------|-------------|----------|
| Color-ramp cells | Same glyph, color ramps dim→bright over theme accent/success | ✓ |
| Unicode density glyphs | Intensity by glyph (· ░ ▒ ▓ █), single color | |

### Empty state (zero submissions)
| Option | Description | Selected |
|--------|-------------|----------|
| CTA when empty, normal when sparse | Empty → "run backfill" message; any data → real render | ✓ |
| Always render the grid | Always draw zeros/blank heatmap, no special message | |

**User's choice:** Color-ramp cells over the theme accent/success family
(~4 levels + empty); empty-state CTA pointing at backfill when
`hasAnySubmissions()` is false, real render when sparse.
**Notes:** Approved the color-ramp preview.

---

## Claude's Discretion

- Heatmap intensity bucketing (fixed thresholds vs quantiles).
- Exact theme tokens for the 4-step color ramp and streak/consistency accents.
- Sparkline scaling (window-max vs fixed cap) and the exact block glyph set.
- Exact stat-card wording/glyphs and summary-column layout.
- Streak "today-grace" edge case (timezone correctness itself is locked via
  `toLocaleDateString('en-CA')`).
- The exact new aggregate queries in `src/db/submissions.ts`.

## Deferred Ideas

- Dashboard drill-down / focusable widgets (Enter on a difficulty → filtered
  browse; Enter on a heatmap day → that day's solves).
- Per-topic breakdown / weak-topic view (PROJECT.md scopes this as a possible
  later milestone).
- An "activity" (all-submissions) heatmap variant/toggle alongside the
  first-time-solve heatmap.
