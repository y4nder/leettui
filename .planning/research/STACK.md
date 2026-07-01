# Technology Stack

**Project:** leettui — submission history & analytics milestone
**Researched:** 2026-06-26
**Scope:** Additive only — fits into the existing Bun/OpenTUI/SQLite/Drizzle stack; nothing here is a new parallel stack

---

## Existing Stack (Non-Negotiable)

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Bun | latest | OpenTUI requires Bun |
| UI framework | OpenTUI + React | 0.2.16 / 19.2.6 | `<box>`, `<text>`, `<scrollbox>`, `<markdown>` |
| State | Zustand | 5.0.13 | UI/domain slice split |
| DB | SQLite via Drizzle on `bun:sqlite` | 0.44.4 / 0.31.10 | Migrations in `drizzle/`, embedded in binary |
| Config | smol-toml | 1.6.1 | TOML at `~/.config/leettui/config.toml` |
| API | Custom fetch-based client | — | `src/api/client.ts`, cookie auth |

**No new runtime dependencies are needed for this milestone.** All features can be built using the primitives already on the stack.

---

## 1. LeetCode Submission History API Surface

**Confidence: MEDIUM** — verified against JacobLinCool/LeetCode-Query raw `.graphql` source files, which are the most-cited unofficial reference for LeetCode's GraphQL schema. LeetCode has no official API documentation; schema can change without notice.

### submissionList GraphQL Query

```graphql
query ($offset: Int!, $limit: Int!, $slug: String) {
    submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
        hasNext
        submissions {
            id
            lang
            time
            timestamp
            statusDisplay
            runtime
            url
            isPending
            title
            memory
            titleSlug
        }
    }
}
```

**Variable semantics:**
- `offset: Int!` — starting index (0-based); increment by 20 per page
- `limit: Int!` — items per page; **LeetCode enforces a maximum of 20**; do not request more
- `questionSlug: String` (optional) — filter to one problem; omit for all submissions

**Response fields (all present on every submission row):**

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (numeric) | LeetCode submission ID — stable PK; use as local DB PK |
| `lang` | string | Language slug: `"python3"`, `"rust"`, `"cpp"`, etc. (same slugs as `LANGUAGE_EXTENSIONS` in `src/api/types.ts`) |
| `time` | string | Human-readable elapsed time, e.g. `"2 months ago"` — **not a parseable timestamp; ignore for storage** |
| `timestamp` | string (numeric) | Unix epoch **seconds** as a string — cast to integer for DB storage |
| `statusDisplay` | string | Human-readable verdict: `"Accepted"`, `"Wrong Answer"`, `"Time Limit Exceeded"`, `"Runtime Error"`, `"Compile Error"`, `"Memory Limit Exceeded"` |
| `runtime` | string | e.g. `"48 ms"` or `"N/A"` |
| `memory` | string | e.g. `"16.4 MB"` or `"N/A"` |
| `url` | string | Relative path: `/submissions/detail/12345/` |
| `isPending` | string | `"Not Pending"` for completed; other values for pending (rare in history) |
| `title` | string | Problem title |
| `titleSlug` | string | Problem slug — use to join against local `questions` table |

**Pagination model:**
```
offset=0,  limit=20 → page 1 (submissions 1–20)
offset=20, limit=20 → page 2 (submissions 21–40)
...
stop when hasNext === false
```

**There is no `lastKey` cursor.** Pagination is pure offset-based. `hasNext: boolean` is the only stop signal.

**Backfill loop pseudocode:**
```typescript
let offset = 0;
while (true) {
  const { submissionList } = await gqlQuery(SUBMISSION_LIST_QUERY, { offset, limit: 20 });
  await db.insert(submissions)
    .values(submissionList.submissions.map(toDbSubmission))
    .onConflictDoNothing(); // idempotent — re-running backfill is safe
  if (!submissionList.hasNext) break;
  offset += 20;
  await sleep(300); // ~300ms between pages; see rate-limit section
}
```

### submissionDetails GraphQL Query

Per-submission query for runtime/memory **percentile** data. One call per submission ID.

**Key fields returned:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Same ID as from submissionList |
| `runtime` | number | Raw milliseconds |
| `runtimeDisplay` | string | Human-readable, e.g. `"48 ms"` |
| `runtimePercentile` | number (float) | e.g. `87.45` — beats 87.45% of submissions |
| `runtimeDistribution` | string (JSON) | Distribution histogram; store raw if needed |
| `memory` | number | Raw kilobytes |
| `memoryDisplay` | string | Human-readable |
| `memoryPercentile` | number (float) | e.g. `62.3` |
| `memoryDistribution` | string (JSON) | Distribution histogram |
| `statusCode` | number | Numeric verdict code (10 = Accepted, matches `parseCheckResponse`) |
| `lang` | object | `{ name, verboseName }` |
| `question` | object | `{ questionId, titleSlug }` |
| `code` | string | Full solution code — **do not store** (large, not needed for analytics) |
| `timestamp` | number | Unix epoch seconds |

**Usage guidance:** Do NOT batch-fetch `submissionDetails` for all submissions during backfill. At 1 call per submission, a user with 2,000 submissions = 2,000 serial HTTP requests — prohibitively slow (~10+ minutes) and high anti-bot risk. Fetch `submissionDetails` lazily:
- When the user opens a specific past submission to view it in ProblemView
- Or for the most recent 20 accepted submissions per problem (enriches the per-problem history panel with percentile data without a full sweep)

### Rate Limits and Anti-Bot Realities

**Confidence: LOW** — no official LeetCode rate-limit documentation; inferred from community libraries and reports.

- LeetCode uses Cloudflare and its own anti-bot layer. Aggressive programmatic requests can trigger 429 responses or session invalidation.
- The unofficial community consensus (JacobLinCool's library default): **20 requests per 10 seconds** as a safe ceiling.
- **Recommended backfill cadence**: 300ms delay between submissionList pages. At 20 items/page and 300ms/page: 100 pages (2,000 submissions) ≈ 30 seconds. Acceptable for a one-time background backfill.
- **Do not add exponential retry** in the backfill hot path — keep to the never-throws pattern (`core/git.ts` analog): on HTTP 429 or any network error, stop the current backfill, record progress (last successfully stored offset), and surface a clean message so the user can retry. Resumable backfill is essential.
- **Incremental sync** (post-backfill append): after the initial backfill, only fetch `submissionList` without `questionSlug` from `offset=0` until reaching a submission ID already in the local DB. This is fast (typically 1–2 pages for daily usage).

### Alignment with Existing Client Code

Add `submissionList` and `submissionDetails` queries to `src/api/queries/` following the exact pattern of `src/api/queries/problemset-question-list.ts`:
- Export a typed `fetchSubmissionList(offset, limit, slug?)` function
- Export a typed `fetchSubmissionDetails(id)` function
- Both call `gqlQuery<T>()` from `src/api/graphql.ts`
- Do NOT use caching for these (history changes; pass `useCache = false` or omit the flag)

The existing `src/api/types.ts` already defines the `LANGUAGE_EXTENSIONS` map and the `lang` slugs the `submissionList.lang` field returns — no new mapping needed.

---

## 2. SQLite/Drizzle Schema for Submissions

**Confidence: HIGH** — directly derived from the existing codebase; `recents.ts` and `schema.ts` are the canonical analogs.

### New Table Definition (add to `src/db/schema.ts`)

```typescript
// Submission history (this milestone). One row per LeetCode submission.
// Append-only — rows are never updated after insert; percentile columns start
// null and can be backfilled lazily (submissionDetails fetch on demand).
// `id` is the LeetCode submission ID (stable, globally unique).
export const submissions = sqliteTable(
  "submissions",
  {
    id: integer("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    statusDisplay: text("status_display").notNull(),   // "Accepted", "Wrong Answer", …
    lang: text("lang").notNull(),                      // langSlug: "python3", "rust", …
    runtime: text("runtime"),                          // "48 ms" or null
    memory: text("memory"),                            // "16.4 MB" or null
    timestamp: integer("timestamp").notNull(),          // Unix epoch seconds
    url: text("url"),                                  // "/submissions/detail/12345/"
    isPending: text("is_pending"),                     // "Not Pending" when done
    runtimePercentile: real("runtime_percentile"),     // null until fetched via submissionDetails
    memoryPercentile: real("memory_percentile"),       // null until fetched via submissionDetails
  },
  (t) => [
    index("idx_submissions_question").on(t.questionId),    // per-problem history lookups
    index("idx_submissions_timestamp").on(t.timestamp),    // time-series / streak queries
    index("idx_submissions_status").on(t.statusDisplay),   // "Accepted" filter for dashboard
  ],
);
```

**Why this shape:**
- `id` as integer PK (LeetCode submission IDs are integers) — `onConflictDoNothing` on insert makes backfill idempotent
- `timestamp` as integer epoch seconds (matches what LeetCode returns in `submissionList.timestamp` — cast from string to integer at ingest time)
- `runtimePercentile` / `memoryPercentile` start null; populated lazily via a follow-up `submissionDetails` call — avoids the expensive-per-submission fetch during bulk backfill
- No `code` column — full solution code is large, already on disk in `solutions/`, not needed for analytics
- Indexes: `idx_submissions_question` backs per-problem history panel; `idx_submissions_timestamp` backs the streak / time-series dashboard queries; `idx_submissions_status` backs the "accepted count" filter on the dashboard

### Analytics Queries (Pure SQL via Drizzle)

**Streak calculation** — accepted submissions grouped by local calendar date:
```sql
-- Raw SQL seam (use db.run(sql`...`) for complex analytics)
SELECT date(timestamp, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
FROM submissions
WHERE status_display = 'Accepted'
GROUP BY day
ORDER BY day DESC;
```
Then compute streak in TypeScript from the sorted date list (see Section 4).

**Difficulty breakdown** — join to `questions`:
```sql
SELECT q.difficulty, COUNT(DISTINCT s.question_id) AS solved
FROM submissions s
JOIN questions q ON s.question_id = q.id
WHERE s.status_display = 'Accepted'
GROUP BY q.difficulty;
```

**Problems over time** — weekly counts:
```sql
SELECT strftime('%Y-W%W', timestamp, 'unixepoch', 'localtime') AS week, COUNT(DISTINCT question_id) AS problems
FROM submissions
WHERE status_display = 'Accepted'
GROUP BY week
ORDER BY week DESC
LIMIT 52;
```

Use `db.run(sql`...`)` for these complex aggregations — Drizzle's query builder is verbose for multi-join aggregates; raw SQL with `sql` template tag is idiomatic for analytics (see `recents.ts`'s `DELETE FROM ... NOT IN ...` pattern).

### Migration Workflow

Follow the **mandatory 3-step process** documented in `src/db/CLAUDE.md`:

1. Edit `src/db/schema.ts` to add the `submissions` table.
2. Run `bun run db:generate` → generates `drizzle/0002_<name>.sql` and updates `drizzle/meta/_journal.json`.
3. In `src/db/migrations.ts`, add:
   ```typescript
   import m0002 from "../../drizzle/0002_<name>.sql" with { type: "text" };
   // and in SQL_BY_TAG:
   "0002_<name>": m0002,
   ```

The import must be a **static literal path** (Bun bundles it into the compiled binary). The `embeddedMigrations()` function throws at startup if any journal entry has no `SQL_BY_TAG` entry, so a missed embed fails fast in dev — it will not silently skip in a compiled binary.

**Verify both modes before shipping:** `bun src/index.tsx` (dev mode applies migration) and `bun run build && ./leettui` (confirms the embed travels in the binary).

### CRUD Module (`src/db/submissions.ts`)

Model after `src/db/recents.ts`. Key exports:
- `insertSubmissions(rows[])` — batch insert with `onConflictDoNothing` (idempotent)
- `getSubmissionsForQuestion(questionId)` — ordered by timestamp DESC
- `getRecentAccepted(limit)` — most-recent accepted, any question (feeds incremental sync: stop when all rows already exist in DB)
- `getAcceptedDates()` — returns `string[]` of `YYYY-MM-DD` local dates for all accepted submissions (streak input)
- `updatePercentiles(id, runtimePct, memoryPct)` — backfill after a `submissionDetails` call
- `getSubmissionStats()` — aggregate counts for the dashboard (total accepted, by difficulty, by topic)

---

## 3. Terminal Rendering for Analytics

**Confidence: HIGH** — derived directly from the existing codebase (`progress.ts`, `ProgressBar.tsx`, `ResultBody.tsx`).

### Available OpenTUI Primitives

| Primitive | Props | Used For |
|-----------|-------|---------|
| `<box>` | `flexDirection`, `width`, `height`, `backgroundColor`, `borderStyle`, `borderColor`, `padding*`, `margin*`, `flexGrow`, `flexShrink` | Layout containers, colored cells |
| `<text>` | `fg`, `bg` | Colored text, glyphs, labels |
| `<scrollbox>` | (wraps children) | Scrollable analytics panels |
| `<markdown>` | `content`, `syntaxStyle` | Not used for analytics |

**Color values:** either a hex string (`"#ff8800"`) or an `RGBA` object (from `@opentui/core`). Theme tokens come from the `colors` proxy in `src/ui/theme.ts` — always use theme tokens, never hardcode hex in components.

### Dependency-Free Analytics Rendering

Follow the established `progress.ts` pattern: **pure functions return string segments; components color them with theme tokens.**

**Sparkline (bar chart for problems-over-time):**
```typescript
// src/ui/analytics.ts — pure, framework-free, unit-testable
const BAR_GLYPHS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values: number[], width: number): string {
  const max = Math.max(...values, 1);
  return values
    .slice(-width) // keep the rightmost `width` data points
    .map((v) => BAR_GLYPHS[Math.round((v / max) * 8)])
    .join("");
}
```

Usage in a component:
```tsx
<text fg={colors.accent}>{sparkline(weeklySubmissions, 26)}</text>
```

**Calendar heatmap (contribution-style grid):**
Each day is a single-character cell rendered as a `<text>` with a `backgroundColor` from a 4-step color ramp (none → low → medium → high), using the theme's semantic tokens. Width: 1 char per day, 7 rows (Mon–Sun) × 52 columns (weeks) = a 52-wide × 7-tall grid. Each cell is a `<text bg={heatColor}> </text>` (a space with background). The grid is built as a pure function that returns a 2D array of `{ count, color }` cells.

```typescript
// Pure function: returns the 7×N grid of cells for the last N weeks
export function buildHeatmapGrid(
  acceptedDates: string[], // YYYY-MM-DD, any order
  weeks = 26,
): HeatCell[][] { ... }
```

In the component, render as nested `<box flexDirection="column">` of `<box flexDirection="row">` of `<text>` cells.

**Stat counters (streak, counts):**
Plain `<text>` with `fg={colors.accent}` for the number, `fg={colors.fgDim}` for labels. No special library.

**Difficulty breakdown:**
```
Easy:   ████████████░░░░  48  (60%)
Medium: ████████░░░░░░░░  32  (40%)
Hard:   ████░░░░░░░░░░░░  16  (20%)
```
Reuse `smoothBar(ratio, width)` from `src/ui/progress.ts` (already exported, unit-tested). The filled/empty strings are colored with `colors.success`/`colors.warn`/`colors.error` for Easy/Medium/Hard.

**NO new dependencies needed.** The codebase already has:
- `smoothBar` + `sweepBar` in `progress.ts` — reuse for bars
- Block glyphs (`█`, `▂`–`▇`, `░`) — Unicode, no dep
- Theme color tokens — already live in `colors` proxy

### New `DashboardView` Component

Add as a third top-level view alongside `BrowseView` and `ProblemView`. Route from `src/app.tsx` on `mode === "dashboard"`. Pattern: a `<scrollbox>` containing sections (streak header, heatmap, sparkline, breakdown bars). Owns its own `useBindings` layer for navigation (j/k scroll, Esc/q exit to browse).

---

## 4. Streak and Date Computation

**Confidence: MEDIUM** — derived from platform-standard `Date`/`Intl` APIs + cross-checked against the trophy.so DST guide. No library needed.

### Correct Approach: Local Calendar Dates

```typescript
// Pure, injectable — lives in src/ui/analytics.ts or src/core/submissionStats.ts

function toLocalDate(epochSeconds: number): string {
  // toLocaleDateString('en-CA') returns YYYY-MM-DD in the LOCAL timezone.
  // 'en-CA' is chosen purely for the ISO date format; the TZ comes from the platform.
  // Handles DST correctly because it uses the TZ rules for that specific instant.
  return new Date(epochSeconds * 1000).toLocaleDateString("en-CA");
}

export function computeStreak(
  acceptedTimestamps: number[], // epoch seconds
  todayEpochSeconds: number = Math.floor(Date.now() / 1000),
): { current: number; longest: number } {
  const today = toLocalDate(todayEpochSeconds);
  // Deduplicate to one entry per day, then sort descending
  const days = [...new Set(acceptedTimestamps.map(toLocalDate))].sort().reverse();
  if (days.length === 0) return { current: 0, longest: 0 };

  // Current streak: consecutive days ending on today or yesterday
  let current = 0;
  let prev = today;
  for (const day of days) {
    const diffDays = daysBetween(day, prev);
    if (diffDays === 0) continue; // same day as prev
    if (diffDays === 1) { current++; prev = day; }
    else break;
  }
  if (days[0] !== today) current = 0; // broke today

  // Longest streak: full pass
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i], days[i - 1]) === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }
  return { current, longest };
}

function daysBetween(earlier: string, later: string): number {
  const a = new Date(earlier + "T00:00:00").getTime();
  const b = new Date(later + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}
```

**Why `toLocaleDateString('en-CA')`:**
- Returns `YYYY-MM-DD` (ISO date format) in the **user's local timezone** — no explicit TZ parameter needed for the user's own submissions
- Handles DST: uses platform TZ rules for each specific instant (23-hour spring and 25-hour fall days are both handled correctly)
- Zero dependencies: standard `Date` API available in every JS runtime

**Why NOT `date-fns-tz` / `luxon` / `moment-timezone`:**
- Adds a dependency for ~5 lines of logic
- Violates leettui's lean-deps ethos (no dep for things the platform provides)
- `moment.js` is officially deprecated/maintenance mode

**Store timestamps as:** Unix epoch seconds (integer) in the DB — same unit `submissionList.timestamp` returns. The `toLocalDate` function handles the ×1000 conversion.

---

## 5. New Dependencies

**None required.** The entire milestone fits within the existing stack.

| Capability | Solution | Why Not Add a Lib |
|------------|----------|-------------------|
| Sparklines / bar charts | Pure function + Unicode block glyphs in `src/ui/analytics.ts` | No charting lib exists for OpenTUI; rolling one is 20 lines |
| Calendar heatmap | `<box>/<text>` grid with `backgroundColor` | Colored cell grid needs no lib |
| Date/streak math | `Date.toLocaleDateString('en-CA')` + arithmetic | Platform API sufficient; DST handled |
| submissionList fetch | New `src/api/queries/submission-list.ts` | Copy the `fetchQuestionList` pattern, 30 lines |
| submissionDetails fetch | New `src/api/queries/submission-details.ts` | Same pattern |
| Backfill resumption state | Store `lastBackfilledOffset` in `session.json` via `src/core/session.ts` | Reuse session persistence; no new file needed |

---

## 6. What NOT to Use

| Candidate | Verdict | Reason |
|-----------|---------|--------|
| `leetcode-query` npm package | Do NOT add | Redundant with the existing custom client in `src/api/`. Would require a second authenticated client, add a dependency, and duplicate the GraphQL queries already present. The raw queries are trivially portable (30 lines each). |
| `blessed-contrib` / `terminal-kit` charting | Do NOT add | OpenTUI has its own renderer; third-party TUI charting libs assume a different rendering model and will not work inside `@opentui/react` |
| `date-fns` / `date-fns-tz` / `luxon` / `moment` | Do NOT add | `Date.toLocaleDateString('en-CA')` covers the streak/heatmap use case with zero deps; moment is deprecated |
| `drizzle-orm` upgrade | Do NOT bump | Pinned to 0.44.4 to match drizzle-kit 0.31.x; 0.45.x produced corrupt generated SQL with this kit version (documented in `src/db/CLAUDE.md`) |
| Background sync timer | Do NOT add | Violates leettui's no-background-timers invariant (documented in PROJECT.md "Out of Scope"). Backfill is on-demand only. |
| Storing submission code | Do NOT store | Full code is large (~10KB/submission), already on disk in `solutions/`, not needed for analytics. Omit from the DB schema. |
| Per-submission `submissionDetails` bulk fetch during backfill | Do NOT do | At 1 req/submission, 2,000 submissions = 2,000 serial HTTP calls (~10 min, high 429 risk). Fetch lazily/on-demand only. |
| `lastKey` cursor pagination | Does not exist | LeetCode's `submissionList` is offset-based. Do not implement cursor logic. |

---

## 7. Confidence Assessment

| Area | Confidence | Basis | Caveats |
|------|------------|-------|---------|
| submissionList field names | MEDIUM | Verified against JacobLinCool/LeetCode-Query raw `.graphql` source files (most-cited unofficial reference) | LeetCode is undocumented; schema can change without notice |
| submissionList pagination model (offset/hasNext, max 20/page) | MEDIUM | Confirmed via library implementation source code and community libraries | Server-side hard limit not officially documented |
| submissionDetails field names (runtimePercentile, etc.) | MEDIUM | Confirmed via raw source file from same library | Same caveat |
| Rate limits (300ms delay recommendation) | LOW | Community convention; no official docs | Real threshold unknown; 300ms is conservative |
| Drizzle schema + migration workflow | HIGH | Directly from codebase (`schema.ts`, `migrations.ts`, `src/db/CLAUDE.md`) | None |
| OpenTUI rendering primitives | HIGH | Directly from codebase (`progress.ts`, `ProgressBar.tsx`, `ResultBody.tsx`, `src/ui/CLAUDE.md`) | None |
| Streak/date computation | MEDIUM | Standard platform APIs + cross-checked with DST guide; unit-testable | Unusual TZ configurations (e.g. server-side with TZ=UTC) need explicit `en-CA` test |

---

## Sources

- [JacobLinCool/LeetCode-Query raw submissions.graphql](https://raw.githubusercontent.com/JacobLinCool/LeetCode-Query/main/src/graphql/submissions.graphql) — submissionList field names and pagination (MEDIUM confidence)
- [JacobLinCool/LeetCode-Query raw submission-detail.graphql](https://raw.githubusercontent.com/JacobLinCool/LeetCode-Query/main/src/graphql/submission-detail.graphql) — submissionDetails percentile fields (MEDIUM confidence)
- [JacobLinCool/LeetCode-Query leetcode.ts](https://github.com/JacobLinCool/LeetCode-Query/blob/main/src/leetcode.ts) — pagination loop, 20-item hard limit, rate limiter (MEDIUM confidence)
- [trophy.so streak DST handling guide](https://trophy.so/blog/streak-timezone-dst-handling) — timezone-correct streak implementation (MEDIUM confidence)
- `src/db/schema.ts`, `src/db/migrations.ts`, `src/db/CLAUDE.md` — migration workflow (HIGH confidence — primary source)
- `src/ui/progress.ts`, `src/ui/components/ProgressBar.tsx` — OpenTUI rendering pattern for analytics (HIGH confidence — primary source)

---

*Stack research: 2026-06-26*
