# cli/

Headless CLI surface (Stage 8). The editor inner-loop lever: since `e` suspends
the renderer and hands the terminal to `$EDITOR`, leettui can't draw UI inside
the editor — instead the editor shells out to these verbs (`:!leettui test`).
Runs the existing UI-free `core/` engine, no renderer mounted.

## Dispatch

`src/index.tsx` calls `matchCliVerb(process.argv)` (after the `version`/`update`
checks, before creating the renderer). On a match it `await runCli(verb)` and
`process.exit`s with the returned code. The matcher recognizes all three planned
verbs so the `index.tsx` seam is wired once — items 3/4 only edit `src/cli/`.

## Files

- `index.ts` — `matchCliVerb(argv)` (exact-element argv match, like the other
  subcommands) + `runCli(verb, cwd?)`. Bootstraps headless (`loadConfig` →
  `openDatabase`, no TUI), resolves the target, runs the verb, prints, returns
  an exit code. Verbs: `test` (local, offline) and `run` (API) — implemented;
  `submit` (API — stubbed → exit 2, filled in by Stage 8 item 4).
  - **API verbs** share `bootstrapApiClient(config?)` + `runApiVerb(header, action)`
    (the "API-from-CLI + auth-expiry pattern" — item 4's `submit` reuses them
    verbatim; `submitSolution` already persists status/stats itself).
    `bootstrapApiClient` initializes the singleton client from saved tokens or
    returns `AUTH_HINT` (config injectable, so the missing-session branch is
    unit-tested without the real config/network). `runApiVerb` runs the action,
    prints the `ParsedResponse` via `presentResultView(buildResultView(...))`
    (same presenter as `test`), and exits via `exitCodeForResultView`. **A
    non-TTY child never launches the interactive Firefox-import/paste flow** — a
    missing session (no tokens) *or* a caught `AuthError` (401/403) both print a
    `run \`leettui auth\`` hint to stderr and exit 2. `AuthError`'s own message
    carries a TUI "Ctrl+P" hint, so the catch substitutes a CLI-oriented string
    rather than leaking it.
- `target.ts` — `resolveTarget(cwd)` → `{ question, langSlug } | error`. Feeds
  `cwd` to `resolveProblemFromCwd` (the Stage 8 item 1 path parser) then does the
  DB lookup (`getQuestionBySlug`) the resolver leaves to its caller. Three
  distinct errors: not-in-tree / no-langSlug (problem-folder level) / unknown-slug.
- `present.ts` — the stdout parallel to OpenTUI's `ResultBody`, sharing the same
  `ResultView` and the same color *semantics* (success→green, error→red,
  subtle→dim, info→cyan) and glyphs (`✓`/`✗`/`!`/`·`). It can't reuse
  `ResultBody` (an OpenTUI widget; the CLI has no renderer) and uses the 16-color
  ANSI palette rather than converting theme RGBA tokens — that honors the user's
  terminal colorscheme, the same intent as the `system` theme. Exports:
  - `brandHeader({ verb, question, langSlug })` — the consistent CLI wordmark
    ("tagged lines" style): a single dot-separated context line — `leettui`
    brand tag + `<verb>` + the resolved problem/language (reassuring, since the
    target is inferred from cwd), no rule. Always printed; only color is gated.
  - `presentResultView(view)` — body: colored title, dim metrics, per-case rows
    with indented Expected/Your-Output/Error/Output sections on fail/error/ran
    (mirrors `ResultBody`'s `Section`). Generic over every `ResultView` field, so
    items 3/4's run/submit diffs+outputs render unchanged.
  - `formatTargetError(message)` — branded one-liner for stderr (also used for
    the API verbs' auth/infra failures).
  - `startStatus(message)` — transient progress feedback for the API verbs while
    they wait on the network + result polling (so the terminal isn't silent for
    seconds). Writes to **stderr** (piped stdout stays clean); a spinner that
    erases itself on a TTY, one plain line otherwise. Returns an idempotent
    `stop()` called when the result arrives.
  - `exitCodeForLocalRun(report)` — the `test` exit code (from the raw report).
  - `exitCodeForResultView(view)` — the API-verb exit code (from `ResultView.kind`).
  **Color is gated per stream** (`process.stdout.isTTY`/`stderr.isTTY` &&
  `!NO_COLOR`), so piped output (editor quickfix, git hooks) stays plain.

## Exit codes

- `0` — `test`: all cases passed, or ran clean. `run`/`submit`: accepted.
- `1` — ran, didn't pass. `test`: any case `fail`/`error`/`timeout`, or
  `no-harness` (a started solution with no runnable harness). `run`/`submit`:
  wrong answer or compile/runtime/limit/timeout error (`ResultView.kind` in
  `{wrong, error, pending}`).
- `2` — **couldn't run the verb at all** → message to **stderr**. Target not
  identified (cwd not inside a solution folder, no language subfolder, or unknown
  problem); for API verbs also a missing/expired session (→ `run \`leettui
  auth\``) or an unreadable solution file.

**The `test` exit code is derived from the raw `LocalRunReport`, not from
`buildLocalRunView`'s `ResultView.kind`.** The view is lossy: its "ran" arm only
counts `pass`/`fail` into the verdict, so `error`/`timeout` cases with no `.out`
(the common case — seeded tests ship inputs only) collapse to kind `"info"`.
Deriving from the report keeps "non-zero on any failure" exact. **The API verbs
(`run`/`submit`) *do* derive from `ResultView.kind`** (`exitCodeForResultView`):
`buildResultView` is not lossy — nothing maps a real failure to `accepted` — so
`kind` is an exact verdict there. `present.ts` stays a shared *renderer*; only
the exit-code source differs per verb.

## Dependencies

`config/` (loadConfig/getDbPath/hasTokens, `Config` type), `db/` (openDatabase,
getQuestionBySlug), `api/client` (initClient, AuthError), `core/solutions`
(resolveProblemFromCwd), `core/submission` (runSolution, SolutionError),
`core/testRunner` (runLocalTests), `views/browse/resultView` (buildLocalRunView,
buildResultView, ResultView).
