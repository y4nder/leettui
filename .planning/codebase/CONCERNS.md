# Concerns: Tech Debt, Risks & Fragile Areas

**Analysis Date:** 2026-06-25

> Overall the codebase is **healthy**: zero stray `TODO`/`FIXME`/`HACK` markers in
> source, a zero-tolerance Biome gate (`--error-on-warnings`), strict TypeScript,
> 29 co-located test files, and per-directory `CLAUDE.md` docs. The items below are
> genuine risks and constraints, ranked by likely impact — not evidence of neglect.

## High — External Dependency Fragility

### Unofficial LeetCode API surface
- **Where:** `src/api/graphql.ts`, `src/api/queries/*`, `src/api/rest/*`.
- **Risk:** The entire app depends on LeetCode's **undocumented** GraphQL +
  internal REST endpoints (`interpret_solution`, `submit`, `submissions/detail`)
  and cookie auth. A LeetCode-side schema/endpoint/anti-bot change breaks sync,
  run, and submit with no warning. There is no API contract or versioning.
- **Mitigation today:** the local SQLite mirror + offline harness mean *browsing
  and local testing* survive an API outage; only run/submit/sync need the network.

### Cookie session auth stored in plaintext
- **Where:** `~/.config/leettui/config.toml` (`lc_session`, `csrftoken`), written
  by `src/core/auth/`.
- **Risk:** A long-lived session cookie sits in a plaintext TOML file. It is
  defensively excluded from the solutions git repo (root `.gitignore` covers
  `config.toml`), but it is not encrypted at rest. Sessions also silently expire,
  forcing a re-auth flow.

## Medium — Known Caveats Documented in the Code

### Stale harness artifacts crash `t` (Stage 16 caveat)
- **Where:** `src/core/harness/`, `src/core/solutions/`.
- **Issue:** The graceful "no harness for unsupported type" fallback only covers
  **newly created** solutions. A harness written *before* the fallback landed
  (a passthrough `main.py`/`main.rs` for a `ListNode`/`TreeNode` problem) is a
  stale on-disk artifact that still crashes on `t` until the language folder is
  deleted (the in-TUI `d` action). Users with older solution folders can still hit
  this.

### Demand-driven harness type coverage
- **Where:** `src/core/harness/` (see `docs/scratchpad/notes.md` strategy).
- **Issue:** Local-test support for a `(type, language)` cell is added only when a
  real problem needs it. Common types like `ListNode`/`TreeNode` are **not**
  supported locally — those problems generate no harness and must use `R`/`s`
  (network). This is intentional, but it means `t` coverage is partial and grows
  ad hoc.

### Solution files are no longer always byte-identical to LeetCode
- **Where:** `prepareSolutionSnippet` (rust shim seam; java `import java.util.*;`).
- **Issue:** To make snippets compile locally, java solutions get a redundant
  import prepended, so `solution.java` is no longer byte-for-byte the submitted
  source (still legal/submittable). Rust uses a `#[cfg(feature = "harness")]`
  shim with the same caveat. A future LeetCode strictness change or a confused
  user diffing local-vs-submitted could be surprised.

### Self-update transition coupling
- **Where:** `src/core/update.ts`, release workflow.
- **Issue:** Releases must keep shipping the **raw** asset alongside the `.gz` so
  pre-Stage-19 clients keep self-updating. Retiring the raw asset too early breaks
  older clients. This is a standing cross-version compatibility obligation, not a
  one-time migration.

## Medium — Platform & Tooling Gaps

### Windows has no in-place self-update
- **Where:** `src/core/update.ts` (refuses on `win32`), `install.ps1`.
- **Issue:** You can't rename over a running, file-locked `.exe`, so `leettui
  update` refuses on Windows — updating means re-running `install.ps1`. The
  Windows `.exe` also ships raw (no `.gz` sibling). Easy to forget; users may run
  stale Windows builds.

### Optional external toolchains degrade features silently-by-design
- **Where:** `src/core/git.ts`, `src/core/harness/{rust,csharp,java}.ts`.
- **Issue:** lazygit, `gh`, and the rust/.NET/JDK toolchains are optional. Missing
  ones produce clean hints rather than crashes (good), but it means a large slice
  of functionality (git backup, compiled-language local testing) is unavailable
  unless the user has installed the right tools. Behavior is environment-dependent
  and not fully exercisable in any single test run.

## Low — Internal Structure & Maintainability

### `mode` co-ownership between two store slices
- **Where:** `src/ui/store/slices/uiSlice.ts` and `problemSlice.ts`.
- **Issue:** Both slices write the shared `mode` field (legal because `set` is
  typed over the whole `AppStore`). It works, but split ownership of a single
  state field is a subtle coupling that a future contributor could violate.

### Larger files concentrating logic
- **Where (non-test):** `src/views/problem/handlers.ts` (433), `src/ui/keymap/
  commands/problem.ts` (344), `src/ui/store/slices/problemSlice.ts` (296),
  `src/core/update.ts` (292), `src/core/testRunner.ts` (286).
- **Issue:** Nothing alarming, but the ProblemView surface (handlers + commands +
  slice) is the densest area and the most likely to benefit from further
  decomposition as it grows — mirroring the already-completed browse-handlers
  barrel split.

### No enforced test coverage threshold
- **Where:** `package.json` / `bunfig.toml` (none configured).
- **Issue:** Coverage is good on pure logic and gated for toolchains, but there is
  no floor. UI components and view composition (`*.tsx`) are largely untested by
  nature of a TUI; regressions there rely on manual `smoke.sh` / `bun src/index.tsx`.

## Notes for Future Work

- The `[scroll] jump_rows` config has **no upper bound** (deliberate — the cursor
  clamp pins overshoot back into range); not a bug, but worth knowing.
- Git network ops correctly use `GIT_TERMINAL_PROMPT=0` + SSH `BatchMode` to avoid
  hanging the TUI on a credential prompt — preserve this whenever adding git calls.
- The **security invariant** (every push routes through `ensureSolutionsRepo` so
  the defensive `.gitignore` precedes `git add`) must be upheld by any new code
  path that could push to a remote.

---

*Concerns analysis: 2026-06-25*
