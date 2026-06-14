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
- `markdown.ts` — `htmlToMarkdown(html)`: a single shared, configured `node-html-markdown` converter for LeetCode descriptions. Maps `<sup>`/`<sub>` to `^`/`_` (so exponents like `10^5` survive), drops `<img>`, fences code blocks, normalizes `&nbsp;`. Used by both browse and problem handlers.
- `clipboard.ts` — `copyToClipboard(text)` via the OSC 52 terminal escape (works over SSH, no external helper); `problemUrl(slug)` builds the canonical problem URL.
- `auth/` — Authentication flow (runs on the plain terminal: before the renderer at boot, or inside a `renderer.suspend()` block):
  - `index.ts` — `runAuthFlow()` orchestrates Firefox auto-import → guided paste fallback (opens leetcode.com, accepts a pasted Cookie header / individual tokens). Every candidate is checked by `validateTokens(csrf, session)` — a cheap `globalData { userStatus }` query via the non-singleton `createClient` — before `persistTokens` saves it, so only working credentials are written. Returns `{ csrftoken, lc_session, username }` or `null`.
  - `firefox.ts` — `readFirefoxCookies()` reads `LEETCODE_SESSION`/`csrftoken` from Firefox's plaintext `cookies.sqlite` (copy-to-temp + read-only open to dodge the write lock); scans standard/snap/flatpak/macOS profile roots and keeps the freshest pair that has both tokens.
  - `paste.ts` — `parseCookieInput(raw)`, a pure parser (unit-tested in `paste.test.ts`) accepting a Cookie header, a `document.cookie` dump, or `KEY=VALUE` lines.

## Dependencies

- `sync.ts` depends on `api/queries/` and `db/questions`
- `search.ts` depends on `db/questions` (types only)
- `solutions.ts` depends on `config/` (for solutions dir path) and `api/types` (for language extensions)
- `auth/` depends on `config/` (`persistTokens`) and `api/client` (`createClient`, `AuthError`); `firefox.ts` uses `bun:sqlite`
