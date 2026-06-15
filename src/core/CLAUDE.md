# core/

Business logic that bridges the API, database, and UI layers.

## Files

- `sync.ts` — `syncQuestions(onProgress?)` fetches all LeetCode problems in 1000-item pages, upserts into SQLite within a transaction. `syncIfEmpty()` only syncs if DB has zero questions (first run).
- `search.ts` — `filterQuestions(questions, needle)` performs fuzzy matching against question title and ID. Returns scored and sorted results. Substring matches score highest.
- `solutions.ts` — Solution file manager for the `~/.local/share/leettui/solutions/` directory. **Layout (Stage 7):** `{paddedId}_{slug}/{langSlug}/solution.{ext}`, with shared `notes.md` + `tests/` reserved at the problem-folder level. The **langSlug is a solution's identity** (the directory name) — the filename is always `solution.{ext}`, so callers pass langSlugs, never filenames.
  - `getProblemDir(id, slug)` — `solutions/{paddedId}_{slug}` (no mkdir)
  - `getSolutionPath(id, slug, langSlug)` — `…/{langSlug}/solution.{ext}`; mkdirs the lang subfolder
  - `getNotesPath(id, slug)` / `getTestsDir(id, slug)` — shared problem-level locations (defined now; wired up by later Stage 7 items)
  - `createSolutionFile(id, slug, langSlug, code)` — writes the file only if it doesn't exist
  - `readSolutionFile(id, slug, langSlug)` — reads solution code (no side effects)
  - `findExistingSolutions(id, slug)` — returns the **langSlugs** that have a `solution.*` file (skips the shared `tests/`/`notes.md`); both this and `listSolutionQuestionIds` share one private `langSlugsWithSolution(dir)` predicate so the marker can never disagree with the problem view
  - `listSolutionQuestionIds()` — returns the set of question IDs whose problem folder contains at least one `solution.*` file (backs the question-list "solution exists" marker); a folder holding only `notes.md`/`tests/` is not counted
- `migration.ts` — `migrateSolutionsLayout(dir?)`: one-time, **idempotent**, **collision-safe** migration of legacy flat files (`0001_two-sum.py`) into the folder layout. Skips unknown-extension/non-matching files (loss-free), never overwrites an existing target, and continues past per-file errors. Run once at boot in `BootFlow` after `openDatabase`. Takes an optional dir for testing (`migration.test.ts`).
- `submission.ts` — `runSolution`/`submitSolution` services. On `submit_accepted` also records `last_runtime`/`last_memory` via `setSubmissionStats`.
- `session.ts` — Persists the last-viewed browse position (`{ topicSlug, questionId }`) to `~/.local/share/leettui/session.json`. `loadSession()` on boot; `saveSession()` is debounced (~400ms) because navigation fires per keypress.
- `markdown.ts` — `htmlToMarkdown(html)`: a single shared, configured `node-html-markdown` converter for LeetCode descriptions. Maps `<sup>`/`<sub>` to `^`/`_` (so exponents like `10^5` survive), drops `<img>`, fences code blocks, normalizes `&nbsp;`. Used by both browse and problem handlers.
- `clipboard.ts` — `copyToClipboard(text)` via the OSC 52 terminal escape (works over SSH, no external helper); `problemUrl(slug)` builds the canonical problem URL.
- `treeSitterWorker.ts` — Side-effect-only module imported **first** in `src/index.tsx`. Points OpenTUI at its tree-sitter highlight worker (`OTUI_TREE_SITTER_WORKER_PATH`) so `<markdown>` is actually syntax-highlighted in the compiled binary. **The build must add `node_modules/@opentui/core/parser.worker.js` as a second `--compile` entry point** (see `scripts/build.ts` and `.github/workflows/release.yml`) — that's what bundles the worker *and its `web-tree-sitter` dependency + engine wasm* into the binary; this module only resolves the embedded path (`/$bunfs/root/node_modules/@opentui/core/parser.worker.js`, computed from `import.meta.url` since Bun flattens module paths in the binary). Without both halves the worker can't load, highlighting silently degrades to one flat unstyled chunk, and `buildMarkdownSyntaxStyle()` does nothing. Two failure modes were seen: pre-fix releases threw `ModuleNotFound parser.worker.ts`; the v0.1.7 attempt (raw `type: "file"` embed of the worker) shipped the worker bytes but not its deps, so it threw `Cannot find package 'web-tree-sitter'` on any machine without a stray `node_modules` beside the binary. Dev (`bun src/index.tsx`) always worked — the worker is a real file on disk — which is why this was release-only.
- `auth/` — Authentication helpers. Two front-ends share them: the in-renderer onboarding `AuthWizard` (`ui/components/onboarding/`) handles first-run/boot auth, and `runAuthFlow()` handles mid-session re-auth on the plain terminal inside a `renderer.suspend()` block.
  - `index.ts` — exports the shared pieces: `validateTokens(csrf, session)` (a cheap `globalData { userStatus }` check via the non-singleton `createClient`, returning `ok`/`invalid`/`unknown`), `openInBrowser`, `LOGIN_URL`, `MAX_PASTE_ATTEMPTS`, and `runAuthFlow()` — the plain-terminal flow (Firefox auto-import → guided paste fallback) used by the Ctrl+P "Re-authenticate" command. Every candidate is checked by `validateTokens` before `persistTokens` saves it, so only working credentials are written.
  - `firefox.ts` — `readFirefoxCookies()` reads `LEETCODE_SESSION`/`csrftoken` from Firefox's plaintext `cookies.sqlite` (copy-to-temp + read-only open to dodge the write lock); scans standard/snap/flatpak/macOS profile roots and keeps the freshest pair that has both tokens.
  - `paste.ts` — `parseCookieInput(raw)`, a pure parser (unit-tested in `paste.test.ts`) accepting a Cookie header, a `document.cookie` dump, or `KEY=VALUE` lines.

## Dependencies

- `sync.ts` depends on `api/queries/` and `db/questions`
- `search.ts` depends on `db/questions` (types only)
- `solutions.ts` depends on `config/` (for solutions dir path) and `api/types` (for language extensions)
- `migration.ts` depends on `config/` (solutions dir) and `api/types` (`EXTENSION_TO_LANGSLUG`)
- `auth/` depends on `config/` (`persistTokens`) and `api/client` (`createClient`, `AuthError`); `firefox.ts` uses `bun:sqlite`
