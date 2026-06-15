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
  an exit code. Verbs: `test` (local, offline — implemented); `run`/`submit`
  (API — stubbed → exit 2, filled in by Stage 8 items 3/4).
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
  - `formatTargetError(message)` — branded one-liner for stderr.
  - `exitCodeForLocalRun(report)` — the `test` exit code.
  **Color is gated per stream** (`process.stdout.isTTY`/`stderr.isTTY` &&
  `!NO_COLOR`), so piped output (editor quickfix, git hooks) stays plain.

## Exit codes

- `0` — all cases passed, or ran clean (no expected outputs / nothing to run).
- `1` — any case `fail`/`error`/`timeout`; or `no-harness` (a started solution
  with no runnable harness).
- `2` — couldn't identify the target (cwd not inside a solution folder, no
  language subfolder, or unknown problem) → message to **stderr**.

**The `test` exit code is derived from the raw `LocalRunReport`, not from
`buildLocalRunView`'s `ResultView.kind`.** The view is lossy: its "ran" arm only
counts `pass`/`fail` into the verdict, so `error`/`timeout` cases with no `.out`
(the common case — seeded tests ship inputs only) collapse to kind `"info"`.
Deriving from the report keeps "non-zero on any failure" exact. `present.ts`
stays a shared *renderer*; only the exit-code source differs per verb (the API
verbs in items 3/4 can use `ResultView.kind`, which keeps the verdict for the
`ParsedResponse` path).

## Dependencies

`config/` (loadConfig/getDbPath), `db/` (openDatabase, getQuestionBySlug),
`core/solutions` (resolveProblemFromCwd), `core/testRunner` (runLocalTests),
`views/browse/resultView` (buildLocalRunView, ResultView).
