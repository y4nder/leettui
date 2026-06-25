# Pitfalls Research

**Domain:** Unofficial-API bulk backfill + terminal analytics (LeetCode submission history + progress dashboard in leettui)
**Researched:** 2026-06-26
**Confidence:** MEDIUM — web findings cross-checked against leettui codebase; LeetCode API is undocumented so specifics are community-observed, not contractual

---

## Critical Pitfalls

### Pitfall 1: N+1 per-submission detail call for percentile data

**What goes wrong:**
The `submissionList` GraphQL query returns list-level fields (`id`, `titleSlug`, `statusDisplay`, `lang`, `runtime`, `memory`, `timestamp`, `isPending`, `url`) but does NOT return percentile values. `runtimePercentile` / `memoryPercentile` only appear in the live submit/check result (the `/submissions/detail/{id}/check/` response leettui already uses) and in a separate `submissionDetails` per-submission GraphQL call. A full history backfill that fetches percentile for every historical submission requires one extra API call per record — O(N) additional requests on top of the O(N/pageSize) pagination calls.

**Why it happens:**
Developers see percentile in the live submission result and assume it is available in the history list too. It is not. The N+1 pattern is then baked into the backfill loop before anyone measures the API cost.

**How to avoid:**
Decouple percentile storage from the backfill. Store `runtimePercentile` / `memoryPercentile` only for submissions made through leettui going forward (already available from the live check response). For the historical backfill, skip percentile entirely and store `null`. Optionally add a lazy per-problem detail enrichment that users can opt into separately, but never make it part of the initial backfill. Document explicitly that historical percentile will be null.

**Warning signs:**
- Backfill loop contains a nested API call per submission
- Backfill of 500 submissions takes minutes and triggers 429 errors
- Code that awaits `fetchSubmissionDetails(id)` inside the same loop that paginates `submissionList`

**Phase to address:**
Data model phase (schema + backfill design). Decide upfront what fields populate from `submissionList` vs. what comes from the live submit path. Lock this as a schema comment before writing any backfill code.

---

### Pitfall 2: Rate limiting / soft-ban from hammering the unofficial API

**What goes wrong:**
LeetCode's unofficial API enforces rate limits but does not document them. Community reports show 429 responses after roughly 60 rapid consecutive requests. The existing leettui API client (`src/api/client.ts`) has no throttle: it fires requests immediately. A naive backfill loop that pages through `submissionList` with no delay between pages will hit 429 within seconds for any user with more than ~60 pages of history. Worse, aggressive hammering can trigger soft account-level bans (temporary API block distinct from a cookie expiry).

**Why it happens:**
The current client was designed for interactive use (one request per user action). Backfill is the first bulk / automated use case. No rate limiter was needed before, so none was added.

**How to avoid:**
Implement a simple sequential page-fetch loop with an explicit inter-request delay (minimum 500 ms between page requests, matching the existing poll interval in `check.ts`; 1–2 s is safer). Do not parallelize page fetches. Cap maximum pages per session (e.g., 100 pages = up to 2000–3000 submissions, covering most users). Implement exponential backoff on 429: wait 5 s, retry once, then abort gracefully with a "Rate limited — resume later" message. Store the last successfully fetched offset in the database so the next run resumes where it stopped (see Pitfall 3).

**Warning signs:**
- No `await Bun.sleep(...)` between page fetch calls in the backfill loop
- Backfill progress shows sudden stop or silent error after 50–100 pages
- 429 status logged mid-backfill
- User reports their LeetCode account being temporarily blocked

**Phase to address:**
Backfill implementation phase. The throttle must be present in the first cut of the backfill loop, not added later as a hotfix. Treat it as a correctness requirement, not an optimization.

---

### Pitfall 3: Non-resumable backfill that re-fetches from the beginning on interruption

**What goes wrong:**
A backfill that starts fresh every time wastes quota and frustrates users with large histories. More dangerously: a backfill that re-inserts already-stored submissions without idempotency protection will either duplicate rows (wrong counts) or silently overwrite good data with stale re-fetched data. Session expiry mid-backfill (see Pitfall 5) is a near-certainty for users with hundreds of pages of history.

**Why it happens:**
Storing a "resume cursor" is one extra concern developers defer until after the happy path works. Idempotency is assumed because "we just started fresh", which is only true on the very first run.

**How to avoid:**
Use `submissionId` as PRIMARY KEY with `INSERT OR IGNORE` (or Drizzle's `onConflictDoNothing`). This makes every insert idempotent: re-running the backfill from page 0 adds only genuinely new records and skips duplicates without any extra logic. Persist a `backfill_cursor` (last successful offset + total fetched) in the DB or in `session.json` so the next run continues from where it stopped. On abort, commit whatever was fetched so far — partial data is valid, not corrupt.

**Warning signs:**
- No UNIQUE or PRIMARY KEY constraint on `submissionId` in the schema
- Backfill always starts with `offset: 0`, ignoring prior runs
- Duplicate submission counts in the dashboard after a re-run
- Schema uses an auto-increment ID instead of the LeetCode submission ID as the unique key

**Phase to address:**
Data model phase (schema migration). The `submissionId` uniqueness constraint must be in the migration, not added later. Add a `backfill_cursor` record (could be a row in a `metadata` table or a field on the submissions table itself) in the same migration.

---

### Pitfall 4: Timezone off-by-one breaking streaks and heatmap dates

**What goes wrong:**
LeetCode `timestamp` fields are UTC Unix epoch (seconds). "Today" and "this week" for a streak are user-local dates, not UTC dates. A submission at 11 PM UTC on June 25 is "June 26" for a user in UTC+1, and "June 24" for a user in UTC-5 if it is past midnight UTC but before midnight local. Converting `timestamp * 1000` to a `Date` and then calling `getDate()` / `getMonth()` / `getFullYear()` returns local-time values, but comparing against `Date.now()` truncated to UTC midnight crosses the boundary incorrectly. DST makes this worse: when clocks spring forward, a 23-hour day can falsely break a streak that should be intact.

**Why it happens:**
JavaScript `Date` internally stores UTC but `.getDate()` etc. return local time. Developers mix UTC-based comparisons (`Math.floor(Date.now() / 86400000)`) with local-time comparisons (`date.getDate()`) in the same streak function. The test suite runs on CI in UTC, so timezone bugs never surface there.

**How to avoid:**
Pick one canonical timezone representation and use it everywhere. Recommended: store `timestamp` as-is (UTC epoch seconds) in SQLite, and compute "local date string" at query/render time by converting to local date via `new Date(ts * 1000).toLocaleDateString('en-CA')` (yields `YYYY-MM-DD` in local time, `'en-CA'` locale is stable). All streak and heatmap bucketing uses these local date strings, never raw epoch arithmetic. Test streak logic with timestamps that straddle midnight in both UTC+X and UTC-X timezones. Do not store a pre-computed "date" string in the DB — the user's timezone can change between runs.

**Warning signs:**
- Streak calculation code that does `Math.floor(Date.now() / 86400000)` for "today"
- Tests that only run in UTC (check `TZ` env in CI)
- Heatmap cells showing submissions on the wrong day for users in non-UTC timezones
- A user who submits at 11:30 PM sees the submission counted on a different day than expected

**Phase to address:**
Analytics / dashboard phase. Write streak and date bucketing logic as a pure, unit-tested module before it goes into any UI. Test suite must explicitly test timezone-boundary cases (pass artificial timestamps and expected local dates).

---

### Pitfall 5: Cookie session expiring silently mid-backfill

**What goes wrong:**
A multi-page backfill for a user with large submission history can take minutes. LeetCode sessions expire asynchronously and silently: there is no pre-expiry warning, and the expiry surface is a 401 or 403 from the API (same as `AuthError` in `client.ts`). If the backfill loop does not catch `AuthError` specifically, the unhandled throw propagates up and crashes the TUI or leaves the backfill in an unknown state. An unrecognized 403 from anti-bot protection (distinct from a session expiry 401) also surfaces on the same code path.

**Why it happens:**
The existing `AuthError` in `client.ts` is propagated upward and caught by interactive handlers (`handleRunSolution`, etc.) which immediately prompt the user to re-auth. The backfill loop is not an interactive handler — it is a background async sequence — and catching `AuthError` mid-loop requires a different UX response (pause, explain, offer to re-auth, then resume).

**How to avoid:**
Wrap the backfill page-fetch in a `try/catch` that specifically handles `AuthError`. On `AuthError`, commit the progress so far, write the resume cursor, surface a clear "Session expired — re-authenticate (Ctrl+P) then restart backfill" message, and abort the loop cleanly. Do not attempt automatic re-auth inside the backfill (that would require embedding the auth wizard flow inside a background operation — too complex). For 429, see Pitfall 2. For any other error, log it and surface a "partial backfill — resume later" hint, not a crash.

**Warning signs:**
- Backfill loop has a bare `await fetchSubmissionsPage(...)` without try/catch
- The TUI freezes or goes blank after a session expiry during backfill
- `AuthError` is caught only at the top-level handler that calls `handleBackfill`, not inside the pagination loop

**Phase to address:**
Backfill implementation phase. Error handling inside the loop is not optional polish — it is part of the leettui "never-crash on missing/optional capability" invariant. Pattern: mirror the `testRunner.ts` / `git.ts` style — catch all errors, return a discriminated result, let the caller decide what to display.

---

### Pitfall 6: Backfill blocking the TUI render loop

**What goes wrong:**
Placing the backfill loop directly in a synchronous call path or forgetting that `async/await` in an OpenTUI component still runs on the same JS event loop causes the TUI to freeze or drop frames during the multi-second backfill. Long `await` chains with no yielding points between them — especially if a batch of page fetches is parallelized with `Promise.all` — can starve the renderer's re-draw interval.

**Why it happens:**
`withSuspendedRenderer` (the pattern for spawning external editors and lazygit) suspends and restores the terminal. Developers see it as "the async pattern" and try to reuse it for in-process backfill. But `withSuspendedRenderer` completely hands off the terminal to another process — it is not for in-process async work. The correct pattern for in-process progress is the `syncSlice` model already used for the initial problem sync in `BootFlow`.

**How to avoid:**
Model backfill after `syncSlice` / `syncIfEmpty`: run the backfill as an async function, update a Zustand store slice with progress (pages fetched, total estimated, current status), render a non-blocking progress indicator from that slice, and let the React re-render cycle handle display. Never use `withSuspendedRenderer` for the backfill. Never `await Promise.all([...allPages])` to fetch the whole history in one burst — fetch pages sequentially with delays (see Pitfall 2). Since leettui has no background timers, the backfill must be explicitly user-initiated and show clear in-TUI progress.

**Warning signs:**
- `withSuspendedRenderer` imported and used inside the backfill handler
- A `Promise.all` that maps over all estimated pages
- The TUI stops responding to keypresses during backfill
- No Zustand store field tracking backfill progress

**Phase to address:**
Backfill implementation phase, specifically the UI integration step. Model and test against the `syncSlice` pattern before wiring the backfill to any UI.

---

### Pitfall 7: Corrupt or inconsistent data model from partial-schema migration

**What goes wrong:**
Drizzle on `bun:sqlite` uses embedded migrations in `src/db/migrations.ts`. If the new submissions table migration does not run (e.g., a dev tests against an old DB), queries against the missing table throw SQLite errors that propagate up and crash the dashboard view. Worse: if the migration runs but the schema is missing an index, aggregation queries for streaks and heatmaps over thousands of rows run a full-table scan and cause the dashboard to render with a multi-second delay on every open.

**Why it happens:**
Missing index is easy to overlook because the dashboard works fine in dev with 50 test submissions. Full-table scans only become visible at real user scale (500+ submissions). Migration ordering bugs (a migration that references a column added in a later migration) are caught immediately; missing performance indexes are caught only in production.

**How to avoid:**
The new `submissions` migration must include: (1) `submissionId` as the PRIMARY KEY for idempotency, (2) a composite index on `(questionId, submittedAt)` for per-problem history queries, (3) an index on `submittedAt` alone for streak / heatmap date-range queries. Run `EXPLAIN QUERY PLAN` on the key analytics queries in a test with 1000+ synthetic rows before shipping. Wrap dashboard queries in the same never-throw pattern as `testRunner.ts`: a query failure returns empty data + a visible indicator, never a TUI crash.

**Warning signs:**
- No index on `submittedAt` in the migration
- Dashboard opens noticeably slower after importing a real user's history
- Unguarded `db.select(...).from(submissions)` calls without a `try/catch` in the dashboard query layer

**Phase to address:**
Data model phase (Drizzle migration design). Index design is part of the migration, not a performance optimization added later. Also: the dashboard query layer must follow the never-throw pattern in the first cut.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip percentile for historical submissions | Eliminates N+1 API cost; much safer backfill | Dashboard shows "—" for historical percentile; may disappoint users who care about it | Acceptable for initial milestone; document the gap explicitly in the UI |
| Store all submissions in `questions.db` (no separate DB) | Reuses existing Drizzle setup, one fewer file to gitignore | DB file grows with history; may affect questions-browse performance if vacuum is never run | Acceptable — SQLite handles millions of rows; measure before splitting |
| Fixed per-page delay (500 ms) instead of adaptive rate limiting | Simple to implement, predictable | Slower than necessary for users with small histories; may still hit limits on rapid re-runs | Acceptable for v1; add exponential backoff in a follow-up |
| No percentile enrichment for historical submissions | Avoids N+1 API calls | Historical per-problem view shows `null` percentile for past attempts | Acceptable — document clearly; add lazy enrichment UI later |
| Cap backfill at a page limit (e.g., 100 pages) | Prevents runaway quota usage | Power users with 3000+ submissions get a partial initial backfill | Acceptable — the cap should be configurable and the progress indicator must show it clearly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LeetCode `submissionList` GraphQL | Assuming `runtime_percentile` / `memory_percentile` are in the list response | These fields are absent from `submissionList`; they come from the live check response or a per-submission `submissionDetails` call — skip for history |
| LeetCode cookie session | Assuming the session stays valid for the duration of a long backfill | Sessions expire asynchronously; catch `AuthError` inside the pagination loop and abort with a "re-auth needed" message and the resume cursor persisted |
| LeetCode 429 handling | Treating a 429 as a fatal error | 429 is transient; implement exponential backoff (5 s, 30 s) with one retry before aborting gracefully |
| Drizzle `bun:sqlite` migrations | Adding analytics tables in ad hoc `db.run()` calls | All schema changes must go through the numbered migration files in `drizzle/` via `bun run db:generate`; the binary embeds these at build time |
| `questions.db` gitignore | Creating a separate `submissions.db` and forgetting to gitignore it | The existing `ROOT_GITIGNORE` in `git.ts` covers `*.db` — any `*.db` file in the solutions dir is already excluded; the submissions table must live in `questions.db` to inherit this protection automatically |
| OpenTUI renderer | Using `withSuspendedRenderer` for in-process async work | `withSuspendedRenderer` is for external process handoff (editor, lazygit); use the `syncSlice` Zustand pattern for in-TUI async progress |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-table scan on `submissions` for streak | Dashboard takes 2–5 s to open; gets slower as history grows | Index on `submittedAt` (see Pitfall 7) | After ~500 submissions |
| Parallel page fetches (`Promise.all`) | TUI freeze + 429 rate limit errors | Sequential page fetch loop with 500 ms–1 s delay | Immediately |
| Recomputing streak on every dashboard open | Same symptoms as above | Memoize or cache streak result in the Zustand store; invalidate on new submission write | After ~200 submissions |
| N+1 percentile calls in backfill | Backfill takes 10+ minutes; triggers 429 | Skip percentile for historical records (see Pitfall 1) | Any history > 20 submissions |
| Re-running backfill from offset 0 every session | Wastes API quota; doubles data if upsert is wrong | Persist resume cursor; use `INSERT OR IGNORE` | On any re-run |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Creating a separate `submissions.db` outside the existing gitignore coverage | User's full submission history (problem IDs, timestamps, language) pushed to their public solutions repo | Store submissions in the existing `questions.db`; the `ROOT_GITIGNORE` `*.db` pattern already covers it |
| Logging raw session cookies in backfill error output | Session token exposed in terminal scrollback or a crash log | Never include `lc_session` / `csrftoken` values in error messages; `client.ts` already handles this — ensure backfill error surfacing follows the same pattern |
| Storing submission `code` content in the analytics table | User's submitted solution code in the DB (possible privacy concern; also bloats the DB significantly) | The analytics use case does not need code content — store only metadata (id, status, lang, runtime, memory, timestamp, questionId); leave code retrieval to a separate `submissionDetails` call if ever needed |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dashboard shows "No data" with no explanation on first open before backfill | User thinks the feature is broken | Show a clear "Run backfill to populate history" empty state with the keybind/command |
| Dashboard shows partial data after an interrupted backfill without indicating incompleteness | User makes decisions (e.g., "I'm on a 30-day streak") based on a 50%-complete dataset | Display a "Backfill incomplete — data may be partial" indicator whenever `backfill_cursor.done !== true` |
| Long backfill with no progress indicator | TUI appears frozen; user Ctrl+C's and loses progress | Show per-page progress: "Fetching history… page 12 of ~45" using the `syncSlice` pattern |
| "Streak broken" shown when backfill is mid-run | User sees a 0-day streak during backfill and panics | Suppress streak display until backfill reports complete (or explicitly label it "based on partial history") |
| Backfill triggered automatically on every startup | Re-fetches already-known history on every launch; wastes API quota | Backfill is on-demand (user-initiated), consistent with leettui's no-background-timers invariant; only the append (new submissions) is automatic |

---

## "Looks Done But Isn't" Checklist

- [ ] **Backfill idempotency:** After running the backfill twice, submission counts are identical — verify with `SELECT COUNT(*) FROM submissions` before and after second run
- [ ] **Resume on interrupt:** Terminate the backfill mid-run, restart leettui, confirm backfill offers to resume from the cursor rather than re-starting
- [ ] **Session expiry handling:** With an expired cookie, the backfill loop surfaces a clean "re-auth needed" message and does NOT crash the TUI or leave it in a broken state
- [ ] **Rate limit handling:** Confirm the backfill loop has an inter-page delay and a 429 backoff path; confirm `Promise.all` across all pages is NOT used
- [ ] **Streak timezone correctness:** Test streak calculation with a submission timestamp that is 11:30 PM UTC (crosses day boundary for UTC+X users) — verify the submission counts on the correct local day
- [ ] **DB gitignore:** Confirm `questions.db` (the submissions table's home) is NOT present in any committed git history in the solutions repo
- [ ] **Dashboard query never crashes TUI:** Force a schema error (rename the table in dev) and confirm the dashboard shows an empty/error state rather than killing the renderer
- [ ] **Percentile gap documented:** Per-problem history view clearly shows "—" for historical percentile rather than a confusing "0" or "null"

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate rows from non-idempotent backfill | MEDIUM | Add the UNIQUE constraint via a new Drizzle migration; deduplicate with `DELETE FROM submissions WHERE rowid NOT IN (SELECT MIN(rowid) FROM submissions GROUP BY submissionId)` |
| Soft account ban from hammering the API | LOW–MEDIUM | Wait 24h for LeetCode to lift the temporary block; no leettui change needed for the ban itself, but add throttle before re-running |
| Corrupt backfill state (wrong resume cursor) | LOW | Add a "reset backfill" command that clears the cursor and all submission rows, then re-runs from scratch; safe because history is always re-fetchable |
| TUI freeze from blocking event loop | HIGH (requires refactor) | Restructure backfill to use the `syncSlice` Zustand pattern; cannot be patched without moving the async work out of synchronous component lifecycle |
| Wrong streak due to timezone bug | MEDIUM | Fix the date bucketing function; run a migration that re-computes derived "local date" fields if any were pre-stored |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| N+1 percentile detail call | Data model / schema design phase | Schema comment documents that `runtimePercentile` is NULL for historical rows; no `submissionDetails` call in backfill loop |
| Rate limiting / soft ban | Backfill implementation phase | Code review confirms inter-page delay; 429 path returns a discriminated error, not a throw |
| Non-resumable backfill | Data model / schema design phase | `submissionId` PRIMARY KEY in migration; `backfill_cursor` persisted; second-run COUNT unchanged |
| Timezone streak off-by-one | Analytics / dashboard phase | Unit tests with UTC+5 and UTC-5 boundary timestamps; streak function is a pure module |
| Session expiry mid-backfill | Backfill implementation phase | Forced 403 in test confirms clean abort with cursor persisted |
| TUI render loop blocking | Backfill UI integration phase | Keypress responsiveness during backfill manually verified; no `withSuspendedRenderer` in backfill path |
| Missing DB index / query crash | Data model / schema design phase | `EXPLAIN QUERY PLAN` on streak query shows index use; 1000-row synthetic dataset benchmarked |
| DB accidentally committed to git | Data model / schema design phase | `ROOT_GITIGNORE` in `git.ts` already covers `*.db`; verify new DB file is in the same path or same extension pattern |

---

## Sources

- Leettui codebase analysis: `src/api/client.ts` (AuthError, no throttle), `src/api/rest/check.ts` (500 ms poll interval), `src/core/git.ts` (ROOT_GITIGNORE, never-throws pattern), `.planning/codebase/CONCERNS.md` (unofficial API fragility, plaintext session risk), `.planning/codebase/INTEGRATIONS.md` (existing API endpoints + polling behavior) — **HIGH confidence** (direct code reading)
- Rate limiting: [leetcode-query npm](https://www.npmjs.com/package/leetcode-query) (default 20 req/10 sec), [leetcode-downloader issue #4](https://github.com/yangshun/leetcode-downloader/issues/4) (~60-request threshold before 429) — **MEDIUM confidence** (cross-checked multiple community sources)
- submissionList schema: [leetcode-graphql-queries](https://github.com/akarsh1995/leetcode-graphql-queries), community query collections showing offset/limit/hasNext — **MEDIUM confidence** (multiple independent sources agree)
- Percentile from submit result vs. history: [leetcode-cli PR #158](https://github.com/skygragon/leetcode-cli/pull/158/files) shows `runtime_percentile` / `memory_percentile` are inline in the check result, not in the list query — **MEDIUM confidence**
- Timezone off-by-one: [MDN Date docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date), [DEV.to guide](https://dev.to/zachgoll/a-complete-guide-to-javascript-dates-and-why-your-date-is-off-by-1-day-fi1) — **HIGH confidence** (well-documented JS behavior)
- SQLite window functions for streak: [SQLite window functions docs](https://sqlite.org/windowfunctions.html) — **HIGH confidence** (official documentation)
- Session expiry: [leetcode.nvim issue #194](https://github.com/kawre/leetcode.nvim/issues/194), [leetcode-cli issue #196](https://github.com/skygragon/leetcode-cli/issues/196) — **MEDIUM confidence** (community-observed behavior)
- DB gitignore: `src/core/git.ts` `ROOT_GITIGNORE` constant (covers `*.db`) — **HIGH confidence** (direct code reading)

---
*Pitfalls research for: LeetCode submission history backfill + terminal analytics dashboard in leettui*
*Researched: 2026-06-26*
