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
- `treeSitterWorker.ts` — Side-effect-only module imported **first** in `src/index.tsx`. Embeds OpenTUI's `parser.worker.js` into the `bun build --compile` binary (via a `type: "file"` import) and points OpenTUI at it through `OTUI_TREE_SITTER_WORKER_PATH`. Without it, release binaries can't spawn the tree-sitter highlight worker (`ModuleNotFound parser.worker.ts` under `/$bunfs/root`), so every `<markdown>` renders as one flat, unstyled chunk and `buildMarkdownSyntaxStyle()` silently does nothing. Dev (`bun src/index.tsx`) is unaffected — the worker is a real file on disk there — which is why the breakage was release-only.
- `auth/` — Authentication helpers. Two front-ends share them: the in-renderer onboarding `AuthWizard` (`ui/components/onboarding/`) handles first-run/boot auth, and `runAuthFlow()` handles mid-session re-auth on the plain terminal inside a `renderer.suspend()` block.
  - `index.ts` — exports the shared pieces: `validateTokens(csrf, session)` (a cheap `globalData { userStatus }` check via the non-singleton `createClient`, returning `ok`/`invalid`/`unknown`), `openInBrowser`, `LOGIN_URL`, `MAX_PASTE_ATTEMPTS`, and `runAuthFlow()` — the plain-terminal flow (Firefox auto-import → guided paste fallback) used by the Ctrl+P "Re-authenticate" command. Every candidate is checked by `validateTokens` before `persistTokens` saves it, so only working credentials are written.
  - `firefox.ts` — `readFirefoxCookies()` reads `LEETCODE_SESSION`/`csrftoken` from Firefox's plaintext `cookies.sqlite` (copy-to-temp + read-only open to dodge the write lock); scans standard/snap/flatpak/macOS profile roots and keeps the freshest pair that has both tokens.
  - `paste.ts` — `parseCookieInput(raw)`, a pure parser (unit-tested in `paste.test.ts`) accepting a Cookie header, a `document.cookie` dump, or `KEY=VALUE` lines.

## Dependencies

- `sync.ts` depends on `api/queries/` and `db/questions`
- `search.ts` depends on `db/questions` (types only)
- `solutions.ts` depends on `config/` (for solutions dir path) and `api/types` (for language extensions)
- `auth/` depends on `config/` (`persistTokens`) and `api/client` (`createClient`, `AuthError`); `firefox.ts` uses `bun:sqlite`
