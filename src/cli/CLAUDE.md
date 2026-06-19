# cli/

Headless CLI surface (Stage 8). The editor inner-loop lever: since `e` suspends
the renderer and hands the terminal to `$EDITOR`, leettui can't draw UI inside
the editor — instead the editor shells out to these verbs (`:!leettui test`).
Runs the existing UI-free `core/` engine, no renderer mounted.

## Dispatch

`src/index.tsx` calls `matchCliVerb(process.argv)` (after the `version`/`update`
checks, before creating the renderer). On a match it `await runCli(verb,
process.cwd(), verbArg(argv, verb))` and `process.exit`s with the returned code.
The matcher recognizes every verb so the `index.tsx` seam is wired once — new
verbs only edit `src/cli/`. `matchCliVerb` returns the verb appearing **earliest**
in argv (not first-in-list), so a verb-named positional argument can't shadow the
real verb (`leettui new run` → `new`, not the later `run`). `verbArg(argv, verb)`
pulls the first non-flag token after the verb — the `new` verb's language
argument; the cwd-inferring verbs ignore it.

## Files

- `index.ts` — `matchCliVerb(argv)` (earliest-element argv match) + `verbArg(argv,
  verb)` (the positional language for `new`) + `runCli(verb, cwd?, arg?)`.
  Bootstraps headless (`loadConfig` → `openDatabase`, no TUI), resolves the
  target, runs the verb, prints, returns an exit code. Verbs: `test` (local,
  offline), `run` and `submit` (API), and `new` (scaffold — API) — all implemented.
  - **`new <language>`** (`runNewVerb`) is the headless analogue of the TUI
    solution picker's create path (`handlePickerOpenEditor`): from the problem
    **workspace** dir it scaffolds a solution + harness + seeded `tests/` for a
    language, then prints the created path — it never opens an editor (the user
    is already in one). It resolves at the **problem level** via
    `resolveProblemTarget` (no langSlug from cwd — the language is the argument,
    so it works from the problem-folder cwd *or* a language subfolder, ignoring
    that level's langSlug). It's an **API verb** (shares `bootstrapApiClient` +
    the `AuthError`→exit-2 handling): it fetches the problem's code snippets
    (`fetchEditorData`) — the **same source the picker lists**, so the valid
    `<language>`s are exactly what LeetCode offers here, **no local allowlist** —
    plus `metaData`/`exampleTestcaseList` (`fetchConsolePanelConfig`, best-effort)
    and calls `createSolutionWithHarness` (create-if-absent; an unsupported
    signature yields a plain solution file with **no** harness, never an error —
    the "create the harness *or* solution" contract). **Idempotent**: a
    pre-existing solution prints `already exists: <path>` and exits 0. No
    language, or one LeetCode doesn't offer → the available langSlugs to stderr,
    exit 2. Unlike `run`/`submit` it does **not** seed `problem.md`/`notes.md` —
    those are the `w` workspace-open's job, already done before `new` runs.
  - **API verbs** share `bootstrapApiClient(config?)` + `runApiVerb(header, status, action)`
    (the "API-from-CLI + auth-expiry pattern"; `submit` reuses them verbatim,
    differing only in the action (`submitSolution`, which already persists
    status/stats to the DB itself) and the status message).
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
  `resolveProblemTarget(cwd)` → `{ question } | error` is the **langSlug-optional**
  sibling for `new`: it accepts the problem-folder level (where
  `resolveProblemFromCwd` returns `langSlug: null`) and ignores any langSlug when
  run from a language subfolder, since `new` takes its language as an argument.
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

- `0` — `test`: all cases passed, or ran clean. `run`/`submit`: accepted. `new`:
  the solution was scaffolded (or already existed — both print the path).
- `1` — ran, didn't pass. `test`: any case `fail`/`error`/`timeout`.
  `run`/`submit`: wrong answer or compile/runtime/limit/timeout error
  (`ResultView.kind` in `{wrong, error, loading}`). (`new` never returns 1 — it
  either scaffolds or it couldn't, never "ran but failed".)
- `2` — **couldn't run the verb at all** → message to **stderr**. Target not
  identified (cwd not inside a solution folder, no language subfolder, or unknown
  problem); `test`: `no-harness` (no harness was generated — since Stage 15 the
  designed fallback for an unsupported type like `ListNode`/`TreeNode`, so a
  `leettui test && …` hook reads it as "couldn't run", not a failed test) or a
  `compile-error`; for API verbs also a missing/expired session (→ `run \`leettui
  auth\``) or an unreadable solution file; `new`: no language argument, or a
  language LeetCode doesn't offer for the problem (both list the available
  langSlugs), plus the same auth-expiry family as the other API verbs.

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
getQuestionBySlug), `api/client` (initClient, AuthError), `api/queries`
(fetchEditorData, fetchConsolePanelConfig — the `new` verb's snippet/metaData
fetch), `core/solutions` (resolveProblemFromCwd, plus `createSolutionWithHarness`/
`getSolutionPath`/`solutionExists` for `new`), `core/submission` (runSolution,
SolutionError), `core/testRunner` (runLocalTests), `views/browse/resultView`
(buildLocalRunView, buildResultView, ResultView).
