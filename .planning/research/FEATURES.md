# Feature Research

**Domain:** Submission history & progress analytics for a single-user LeetCode TUI
**Researched:** 2026-06-26
**Confidence:** MEDIUM (LeetCode API fields verified via LeetCode-Query GraphQL source;
analytics UX patterns cross-checked against LeetCode profiles, GitHub contribution graph,
Anki stats, Duolingo streak research, and several open-source LeetCode stat tools)

---

## API Data Inventory

Understanding what LeetCode returns for free is the foundation for every complexity
rating below. This is HIGH-confidence (GraphQL source verified at
github.com/JacobLinCool/LeetCode-Query).

### `submissionList` (paginated, one call per page)

Fields per submission row: `id`, `lang`, `time`, `timestamp`, `statusDisplay`, `runtime`,
`memory`, `url`, `isPending`, `title`, `titleSlug`. Pagination via `hasNext`/`offset`.

**Implication:** A full history backfill is a paginated loop over this query. Every field
the dashboard and per-problem history panel needs — status, language, timestamp,
runtime, memory, and problem slug — is here. No per-submission detail call needed for
the core analytics layer.

### `submissionDetails` (one call per submission ID, expensive)

Adds: `runtimePercentile`, `runtimeDistribution`, `memoryPercentile`,
`memoryDistribution`, `code`, `topicTags`, error output, test case detail.

**Implication:** Fetching percentiles for every historical submission is prohibitively
expensive (N API calls for N submissions). The right strategy: skip percentile on bulk
backfill; capture it from the existing `/submissions/detail/{id}/check/` response that
leettui already polls on submit (the `CheckResponse` in `api/types.ts` already contains
`runtime_percentile` and `memory_percentile`). Going-forward submissions get percentile
for free. Historical AC submissions can optionally get a lazy single `submissionDetails`
call on first view.

### Existing leettui `CheckResponse` fields (already captured on submit)

`status_code`, `status_msg`, `status_runtime`, `status_memory`, `memory`,
`elapsed_time`, `runtime_percentile`, `memory_percentile`, `lang`, `submission_id`,
`question_id`, `compile_error`, `runtime_error`.

**Implication:** The append path (new submissions via leettui) gets richer data than the
backfill path with zero extra API calls. The schema should accommodate both levels of
richness.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Data Available | Notes |
|---------|--------------|------------|----------------|-------|
| Total solved count + by difficulty (Easy / Medium / Hard) | Every LeetCode stat card, profile, and widget shows this; users quote it constantly | LOW | `submissionList.statusDisplay` + problem difficulty from existing `questions` table | Already partially tracked via `questions.status`; needs proper solved-count query across difficulties |
| Current streak (consecutive solve days) | GitHub contribution graph, Duolingo, Anki all train this expectation; users ask "did I solve today?" | LOW | `submissionList.timestamp` (epoch) | Streak = days with ≥1 AC submission; gapless consecutive-day run ending today or yesterday |
| Longest streak | Natural companion to current streak; users want the high-water mark | LOW | Same timestamps | Simple max-run computation over sorted daily solve flags |
| Recent solve counts (last 7 days, last 30 days) | Expected on any dashboard; gives quick "am I active?" answer | LOW | Timestamps + statusDisplay | COUNT with WHERE timestamp > epoch_offset; trivial SQL |
| Per-problem submission attempt list (AC/WA/TLE/CE + runtime + memory + timestamp) | When a user opens a problem they've attempted before, the history must be visible — otherwise leettui is blind to prior work | MEDIUM | `submissionList` per problem (titleSlug filter) or stored locally | Surfaces in ProblemView alongside the existing ResultBody; recents modal is the closest UI analogue |
| Best (fastest AC runtime) vs latest AC runtime per problem | Users want to know if they improved on a re-solve | LOW | Stored from submission rows; MIN(runtime) WHERE status=AC | Cheap SQL aggregation; feeds a "personal best" badge-free indicator |
| Solved breakdown by language | Users who solve in multiple languages want to see their distribution | LOW | `submissionList.lang` | GROUP BY lang; already stored in submission row |
| Activity heatmap (calendar / contribution graph) | GitHub contribution graph has made this the canonical "consistency at a glance" visual; all LeetCode stat tools include it | HIGH | Timestamps → daily solve counts | Hardest table-stakes item. In a TUI it renders as Unicode block chars (▁▂▃▄▅▆▇█ or ░▒▓) in a 52-week × 7-day grid with color intensity. Requires OpenTUI color + custom layout component. |
| "Solved today" indicator in BrowseView | User wants to know at a glance whether they've hit their daily target before quitting | LOW | Timestamp of today's AC submissions | A single line in the status bar or header; computed from local DB |

### Differentiators (Competitive Advantage)

Features that set leettui apart from browser-based stat cards and online dashboards.
North star: "am I improving and keeping it up?" — consistency & trajectory, not rank.

| Feature | Value Proposition | Complexity | Data Available | Notes |
|---------|-------------------|------------|----------------|-------|
| Offline-owned, git-backupable history | Browser stat pages need the network; leettui's analytics work on a plane. History is yours permanently, not dependent on LeetCode's availability or future API breakage. Consistent with the existing git-backup ethos. | LOW (architectural, not UI) | All data in local SQLite | Zero additional complexity — this is a property of the design, not a separate feature to build. Mention it in UI copy. |
| Problems-over-time trend (weekly/monthly solve counts as sparkline) | Shows trajectory: "I solved 2/week in January, 5/week in March" — answers "am I improving?" directly | MEDIUM | Timestamps + status; GROUP BY week/month | A sparkline (▁▃▅▇) or simple bar chart fits naturally in the TUI dashboard. Weeks are more granular than months and easier to scan. |
| By-topic attempt + AC breakdown | "Where am I weak?" — which topics have many attempts but low AC rate | MEDIUM | `submissionList.titleSlug` → join to `question_topics`; GROUP BY topic | Requires the join via the existing `questionTopics` table. Shows topics sorted by attempt count or AC rate. Directly answers the "am I improving at DP?" question. |
| Consistency score (single opinionated metric) | A streak is binary (you either maintained it or broke it). A consistency score — e.g. problems solved in last 30 days / 30 — is kinder and more informative. Inspired by Duolingo's insight that rigid streaks cause churn; a percentage-based measure survives a missed day. | LOW | Count of solve days in rolling window / window size | Simple ratio. Show alongside streak, not instead. Label it clearly (e.g. "28-day consistency: 71%"). |
| Per-problem history panel integrated in ProblemView | No context switch to a browser. Open a problem, see your full attempt history right there. Best AC runtime, when you first solved it, how many attempts it took. | MEDIUM | Stored submissions filtered by titleSlug | Extends the existing ProblemView layout; the Solutions panel side already shows solutions. A new "History" tab or scroll section. |
| Percentile stored but surfaced only on request | Percentile data is captured on every submission going forward (already in CheckResponse). It lives in the DB and can be shown per-attempt. But it is NOT the dashboard's headline number — respects the project's anti-percentile-chasing stance while still making the data accessible. | LOW (storage); MEDIUM (UI placement) | `runtime_percentile`/`memory_percentile` from CheckResponse | Store it always. Surface it in the per-attempt row in ProblemView history, collapsed behind a keypress or shown inline but not prominent. |
| Language usage mix over time | Multi-language solvers (python for speed, rust for challenge) can see their mix shift. Shows growth in a new language. | LOW | GROUP BY lang + month/week from submission timestamps | A small breakdown table or bar; low effort, visible value for multi-lang users. |
| "Solved this problem before" indicator on question list | Browse view shows a ✓ or attempt-count badge on problems the user has previously submitted, even if status isn't AC. Richer than LeetCode's binary "solved/attempted". | LOW | JOIN questions to submissions GROUP BY titleSlug | Requires that question status in DB is kept in sync with submission history. |

### Anti-Features (Deliberately Do NOT Build)

| Anti-Feature | Why Requested | Why It Doesn't Belong Here | What to Do Instead |
|--------------|---------------|---------------------------|-------------------|
| Cross-user leaderboards / social comparison | "Am I doing better than my friends?" is a natural question | leettui is a single-user local tool; a leaderboard requires a backend, user accounts, and privacy considerations — antithetical to offline-first, locally-owned design | Store rank from LeetCode's data if it appears, but don't make it actionable or visible in the dashboard |
| Percentile as dashboard headline | Runtime percentile is the most visible number on LeetCode's own result page; users are conditioned to it | Project.md explicitly states the north star is "consistency & trajectory, not competitive perf chasing"; foregrounding percentile contradicts that and creates anxiety over the wrong signal | Store percentile per submission; show it in the per-attempt history row (available but not prominent); never show it on the dashboard overview |
| Real-time / background sync or streaming | Keeping history always-current feels desirable | leettui has a firm no-background-timers invariant (git auto-commit is explicitly out of scope for the same reason); a background sync process would require IPC, crash recovery, and battery/resource concerns | Backfill is on-demand (user-initiated); new submissions append at submit time; user can re-run backfill to pick up website submissions |
| AI / weak-topic recommendation engine | "Tell me what to practice next" is the obvious follow-on to "here are my weak topics" | Out of scope for this milestone per PROJECT.md; the by-topic breakdown surfaces the raw data a user needs to make that decision themselves | Surface by-topic data cleanly; defer recommendations to a future milestone |
| Badge / achievement gamification system | Badges (e.g. "100 problems solved", "7-day streak") are satisfying and common on Duolingo/GitHub | Badges distract from the core "consistency & trajectory" signal; they create a completionist dynamic that isn't aligned with genuine skill growth; Duolingo's research shows badges boost short-term engagement but can shift motivation from learning to badge-hunting | Use the streak count and consistency score as the motivational anchor; they are already meaningful without artificial wrapping |
| Solve-time tracking during active session | Measuring minutes spent on a problem is a natural feature adjacent to submission history | leettui does not track time spent editing (editor is suspended/resumed, no IDE-level instrumentation); implementing this would require a new timing seam and does not come from LeetCode's API | A future enhancement if editors like Neovim expose timing; not for this milestone |
| Browser companion or web dashboard | Some users might want to view their stats in a browser | Contradicts the terminal-native, offline-first value proposition; adds a web server, port management, and a whole new UI surface | The TUI dashboard IS the dashboard; the data is SQLite and fully inspectable with any tool the user chooses (`bun run db:studio` already exists) |
| Automated daily notification / reminder | "Remind me to solve a problem" keeps streak alive | Requires a background daemon or OS-level notification integration; out of leettui's scope; and leaning on external pressure shifts motivation from intrinsic to extrinsic | The "solved today?" indicator in BrowseView is the correct in-session reminder — visible when the user opens leettui, not pushed |

---

## Feature Dependencies

```
[Submission Store (backfill + append)]
    ├──enables──> [Total solved counts by difficulty]
    ├──enables──> [Current & longest streak]
    ├──enables──> [Recent solve counts (7d / 30d)]
    ├──enables──> [Problems-over-time trend / sparkline]
    ├──enables──> [Consistency score]
    ├──enables──> [Language usage mix]
    ├──enables──> [Activity heatmap]
    ├──enables──> [Per-problem history panel in ProblemView]
    │                 └──enhances──> [Best vs latest AC runtime]
    │                 └──enhances──> [Percentile stored, shown per-attempt]
    └──enables──> ["Solved before" indicator in BrowseView]

[Submission Store] + [questions.question_topics join]
    └──enables──> [By-topic attempt + AC breakdown]

[Activity heatmap]
    └──enhances──> [Current / longest streak]  (heatmap is the visual; streak is the number)

[Dashboard view (new TUI top-level view)]
    ├──aggregates──> [Total solved + difficulty breakdown]
    ├──aggregates──> [Streak + consistency score]
    ├──aggregates──> [Recent counts]
    ├──aggregates──> [Trend sparkline]
    └──aggregates──> [Activity heatmap]
```

### Dependency Notes

- **Everything requires the Submission Store first.** The backfill + append layer is
  Phase 1; no dashboard or history feature is buildable without it. This is the hard
  sequencing constraint.
- **Activity heatmap is independent of streak numerics** but they are natural
  companions in the dashboard layout — the heatmap makes the streak visible, the
  streak number makes the heatmap legible.
- **Topic breakdown requires the questions DB** (already built) in addition to
  submissions — it's a JOIN, not a new data fetch.
- **Percentile capture requires no backfill changes** — it flows through the existing
  `pollResult` → `CheckResponse` path already. It just needs a new column in the
  submission table and a write in the submit handler.
- **The "solved before" indicator in BrowseView** is the lightest touch: it reuses the
  existing `questions.status` pattern and can be a late-phase polish item.

---

## MVP Definition

### Launch With (v1) — the milestone deliverables

- [ ] **Submission store (schema + backfill + append)** — the foundation; nothing else
  ships without it. Backfill via paginated `submissionList`; append on submit.
- [ ] **Per-problem history panel in ProblemView** — the most immediately useful
  surface; a user opens a problem and sees their attempts. Closest analogue to the
  recents modal already built.
- [ ] **Dashboard view: streak + recent counts + total/difficulty breakdown** — the
  "opened and immediately understood" experience. Three numbers and a streak count.
- [ ] **Dashboard: activity heatmap** — the highest-complexity table-stakes item.
  Needs to ship with the dashboard, not after, because users expect the calendar
  visual as part of any progress view.
- [ ] **Graceful degradation on backfill failure** — per PROJECT.md constraints: never
  crash, show a clean hint, be resumable.

### Add After Validation (v1.x)

- [ ] **Trend sparkline (problems/week over 12 weeks)** — add once the dashboard is
  live and users confirm "trajectory" is their question; data is already there.
- [ ] **Topic breakdown panel** — add once per-problem history is stable; requires
  the submissions → question_topics join.
- [ ] **Consistency score** — add once streak is live; it's one extra computed field
  on the same query.
- [ ] **"Solved before" indicator in BrowseView** — low complexity, nice polish; add
  after core dashboard is validated.

### Future Consideration (v2+)

- [ ] **Language mix over time** — only meaningful for multi-language power users;
  defer until user feedback confirms demand.
- [ ] **Per-submission lazy percentile load** (submissionDetails call on first view)
  — adds API call per problem open; defer until users request it.
- [ ] **Weak-topic recommendation engine** — explicitly out of scope for this
  milestone; belongs to a future analytics milestone.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Submission store: backfill + append | HIGH | MEDIUM | P1 — foundation |
| Per-problem history panel (ProblemView) | HIGH | MEDIUM | P1 — core loop |
| Dashboard: streak + recent counts | HIGH | LOW | P1 — north star metric |
| Dashboard: total solved + difficulty breakdown | HIGH | LOW | P1 — table stakes |
| Dashboard: activity heatmap | HIGH | HIGH | P1 — visual anchor |
| Backfill graceful degradation | HIGH | LOW | P1 — safety |
| Trend sparkline (weekly counts) | MEDIUM | LOW | P2 |
| By-topic attempt + AC breakdown | MEDIUM | MEDIUM | P2 |
| Consistency score | MEDIUM | LOW | P2 |
| "Solved before" indicator in browse | LOW | LOW | P2 |
| Percentile stored + shown per-attempt | MEDIUM | LOW | P2 |
| Language usage mix | LOW | LOW | P3 |
| Per-submission lazy percentile (submissionDetails) | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Ships with this milestone
- P2: Add after core dashboard is validated
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | LeetCode profile (browser) | GitHub contribution graph | Anki stats | leettui approach |
|---------|---------------------------|--------------------------|------------|------------------|
| Streak | Current streak count + calendar display | N/A (contribution count, not streak) | "Days studied" streak | Current + longest streak, calendar heatmap |
| Activity calendar | Year-view heatmap (intensity = submissions/day) | Year-view heatmap (intensity = commits/day) | Heatmap add-on, not built-in | Built-in heatmap in dashboard; offline, git-backed |
| Total solved + difficulty | Yes — prominently | N/A | N/A | Yes — header of dashboard |
| Per-problem history | Yes — browser submission tab per problem | N/A | Per-card review history | Integrated in ProblemView (no browser switch) |
| Runtime/memory percentile | Yes — prominent on result | N/A | Retention rate % | Stored, available on request; not the headline |
| Trend over time | Limited (calendar implies it) | Contribution count by week | Cards due / reviews per day | Trend sparkline (problems/week) |
| By-topic breakdown | Yes — on profile | N/A | By deck / tag | By-topic AC rate breakdown |
| Offline / owned data | No — online only | No — GitHub-hosted | Yes — local DB | Yes — SQLite, git-backable |
| Social comparison | Yes — global rank, percentile | Yes — profile public | No | No — explicitly out of scope |

---

## Implementation Notes for This Codebase

**Schema additions needed** (new Drizzle migration):

```
submissions(
  id TEXT PK,               -- LeetCode submission ID
  question_id INT → questions.id,
  lang TEXT,                -- langSlug
  status TEXT,              -- statusDisplay: "Accepted", "Wrong Answer", etc.
  runtime_ms INT,           -- parsed from runtime string, nullable
  memory_kb INT,            -- parsed from memory string, nullable
  runtime_percentile REAL,  -- from CheckResponse or submissionDetails, nullable
  memory_percentile REAL,   -- nullable
  submitted_at INT          -- epoch millis (timestamp field from submissionList)
)
```

**Backfill strategy**: paginate `submissionList(offset, limit=20)` until `hasNext=false`.
Rate-limit between pages (e.g. 500ms delay). Track last-fetched offset in a config or
`__backfill_state` table so it is resumable. Only store final (non-pending) submissions.
Percentile is left NULL for backfilled rows; the append path captures it from CheckResponse.

**Append path**: the existing `handleRunSolution` / submit handler in
`views/problem/handlers.ts` already calls `pollResult` which returns `CheckResponse`.
Add a `recordSubmission(result: CheckResponse)` call there — same never-throws pattern
as `core/git.ts`.

**Dashboard view**: new top-level mode alongside browse/problem in `app.tsx`. Activated
by a global keybinding (e.g. `p` for progress, or `S` for stats). Follows the same
mode-switch pattern as `enterProblemView`. Dashboard has its own Zustand domain slice
and a dedicated view handler for computing/fetching aggregates from SQLite.

**Activity heatmap in OpenTUI**: render as a 52-column × 7-row grid of colored `<text>`
blocks. Map daily solve count to a 5-tier color scale (0 = background, 1-4 = shades of
accent color). Week columns run left-to-right (oldest left); rows are Mon–Sun. This is a
pure layout + color challenge, no external library needed.

**Per-problem history panel**: fits as a new tab or scrollable section inside the existing
ProblemView right column (currently shows Solutions + Result). The `j/k` and `Enter`
keys in that column would need an additional pane; the `SelectPopup` pattern (already used
for recents modal) is the closest reusable idiom.

---

## Sources

- LeetCode-Query GraphQL source (submissionList + submissionDetails fields verified):
  github.com/JacobLinCool/LeetCode-Query
- LeetCode profile stats and submission calendar feature set:
  apps.apple.com/us/app/leetstats-leetcode-analytics, github.com/JacobLinCool/LeetCode-Stats-Card
- Duolingo streak design (loss aversion, streak freeze psychology, 21% churn reduction):
  blog.duolingo.com/how-duolingo-streak-builds-habit, apptitude.io/blog/how-duolingos-streak-mechanic-actually-works
- GitHub contribution graph UX principles (Gestalt, consistency heatmap):
  starfolio.dev/blog/green-square-effect-github-activity-heatmap, thehoneapp.com/blog/consistency-heatmap-measuring-what-predicts-success
- Anki stats features (retention rate, heatmap add-ons, review counts):
  ankiweb.net/shared/info/1771074083, github.com/glutanimate/review-heatmap
- WakaTime developer analytics (daily/weekly breakdowns, language mix, goal tracking):
  wakatime.com
- LeetCode CLI with solve-time tracking (terminal analytics precedent):
  dev.to/night_slayer/i-built-a-leetcode-cli-that-tracks-your-solve-time
- leettui codebase: src/api/types.ts (CheckResponse fields), src/db/schema.ts,
  .planning/PROJECT.md, .planning/codebase/ARCHITECTURE.md

---

*Feature research for: submission history & progress analytics layer in leettui*
*Researched: 2026-06-26*
