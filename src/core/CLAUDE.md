# core/

Business logic that bridges the API, database, and UI layers.

## Files

- `sync.ts` — `syncQuestions(onProgress?)` fetches all LeetCode problems in 1000-item pages, upserts into SQLite within a transaction. `syncIfEmpty()` only syncs if DB has zero questions (first run).
- `search.ts` — `filterQuestions(questions, needle)` performs fuzzy matching against question title and ID. Returns scored and sorted results. Substring matches score highest.
- `solutions.ts` — Solution file manager for the `~/.local/share/leettui/solutions/` directory:
  - `getSolutionPath(id, slug, langSlug)` — returns path like `0001_two-sum.py`
  - `createSolutionFile(id, slug, langSlug, code)` — writes file only if it doesn't exist
  - `readSolutionFile(id, slug, langSlug)` — reads solution code
  - `findExistingSolutions(id, slug)` — lists all solution files for a problem
  - `listSolutionQuestionIds()` — one `readdir` returning the set of question IDs with any solution file (backs the question-list "solution exists" marker)
- `submission.ts` — `runSolution`/`submitSolution` services. On `submit_accepted` also records `last_runtime`/`last_memory` via `setSubmissionStats`.
- `session.ts` — Persists the last-viewed browse position (`{ topicSlug, questionId }`) to `~/.local/share/leettui/session.json`. `loadSession()` on boot; `saveSession()` is debounced (~400ms) because navigation fires per keypress.
- `clipboard.ts` — `copyToClipboard(text)` via the OSC 52 terminal escape (works over SSH, no external helper); `problemUrl(slug)` builds the canonical problem URL.

## Dependencies

- `sync.ts` depends on `api/queries/` and `db/questions`
- `search.ts` depends on `db/questions` (types only)
- `solutions.ts` depends on `config/` (for solutions dir path) and `api/types` (for language extensions)
