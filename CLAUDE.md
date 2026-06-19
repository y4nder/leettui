# leettui

LeetCode TUI built with OpenTUI (React bindings) and Bun.

## Quick start

```sh
cd leettui
bun install
bun src/index.tsx
```

## Checks (run before every PR)

`bun run check` is the full gate: Biome (lint + format check), `tsc --noEmit`, and `bun test`. CI (`.github/workflows/ci.yml`) runs that full script on every PR and push to `main`. Locally the gate is **split across two Husky hooks** (installed by the `prepare` script on `bun install`) so committing stays fast:

- **pre-commit** (`.husky/pre-commit`) → `bun run lint && bun run typecheck` (the fast half).
- **pre-push** (`.husky/pre-push`) → `bun test` (so broken tests can't reach the remote).

Bypass either in a pinch with `git commit --no-verify` / `git push --no-verify`. Keep `package.json`'s `lint` / `typecheck` / `test` / `check` scripts as the single source of truth so the hooks and CI never drift.

```sh
bun run check      # the full gate (lint + typecheck + test)
bun run lint:fix   # auto-fix Biome lint + formatting
bun run format     # format only
```

Biome config is `biome.json`. The gate runs with `--error-on-warnings`, so it is **zero-tolerance** — any lint finding (warning or error) fails it; keep the tree clean. The only relaxed rule is `noNonNullAssertion` (off — used deliberately with strict index access). A handful of intentional cases carry inline `// biome-ignore <rule>: <reason>` suppressions (e.g. static, never-reordered render lists keyed by index; the `useMemo(..., [themeVersion])` theme cache-bust pattern); add a justification when you suppress. `bun.lock` pins Biome — run installs with `--frozen-lockfile`.

On first run, leettui runs an auth flow that imports your LeetCode session from Firefox (if logged in) or guides you through a one-time cookie paste, validates it, and writes it to `~/.config/leettui/config.toml`. Re-run any time with `bun src/index.tsx auth`.

### Subcommands

These are matched as argv tokens in `src/index.tsx` before the TUI starts:

- `auth` — force the authentication flow.
- `update` — self-update: download the latest release binary for the platform and atomically replace the running executable (`src/core/update.ts`). Pass `--force` to reinstall even when already current. Refuses unless `IS_RELEASE` (only official release-workflow binaries self-update — a from-source build is never overwritten by an older published release). **Stage 19:** prefers the gzip-compressed release asset (`{asset}.gz`, ~40 MB on the wire vs. ~111 MB raw — the runtime binary is unchanged, only the download is compressed), decompressing it into the atomic-swap temp file; falls back to the raw asset on a tag published before Stage 19. `install.sh` does the same on first install. **Transition caveat:** releases keep shipping the raw asset alongside the `.gz` so pre-Stage-19 clients (whose `update.ts` only knows the raw asset name) keep self-updating; the raw asset can be retired in a later stage once `.gz`-aware clients dominate. Windows stays a raw manual `.exe` download (no install/self-update path).
- `--version` / `version` — print the embedded version and exit.

**Headless cwd-aware verbs** (Stage 8; `new` = Stage 22) infer the problem from the current dir so they work from inside an editor's `:!` (`src/cli/`, no renderer): `test` (run the seeded cases offline), `run`/`submit` (LeetCode API), and `new <language>` (scaffold a solution + harness + tests for a language — the headless analogue of the TUI solution picker). Unlike the cwd-only verbs, `new` resolves at the **problem** level (run it from the problem **workspace** dir) and takes the language as an argument, so the typical flow is: enter a problem → `w` to open the workspace → `:!leettui new rust` to add a language without leaving the editor. Valid languages are exactly what LeetCode offers for the problem; an unsupported signature scaffolds a plain solution with no harness (never an error); it's idempotent (a pre-existing solution just prints its path). See `src/cli/CLAUDE.md`.

Version metadata lives in `src/core/version.ts`, inlined at build time via `--define`:
- `VERSION` (`process.env.LEETTUI_VERSION`) — the pushed git tag from the release workflow; `git describe` for local `bun run build` (see `scripts/build.ts`); `dev` for `bun src/index.tsx`.
- `IS_RELEASE` (`process.env.LEETTUI_IS_RELEASE === "1"`) — set only by the release workflow; gates `update`.

## Architecture

- **Runtime**: Bun (required by OpenTUI)
- **UI Framework**: OpenTUI with React bindings (`@opentui/core`, `@opentui/react`, `@opentui/keymap`)
- **Storage**: SQLite via Drizzle ORM on the `bun:sqlite` driver; versioned migrations in `drizzle/` (`bun run db:generate` to add one)
- **Config**: TOML via `smol-toml` at `~/.config/leettui/config.toml`

### Directory layout

- `src/config/` — Config loading (TOML), XDG path resolution
- `src/api/` — LeetCode API client (GraphQL + REST), response types
- `src/db/` — SQLite database, schema, CRUD operations
- `src/core/` — Business logic (sync, fuzzy search, solution file management)
- `src/ui/` — React components, hooks, theme, keymap

### Key patterns

- **JSX**: Uses `@opentui/react` intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<markdown>`)
- **State**: Zustand store split into ui/domain slices (`src/ui/store/`); `mode` field drives conditional rendering of popups, which in turn mount/unmount their `useBindings` layers
- **Keymap**: `@opentui/keymap` — global command catalog registered at boot in `src/ui/keymap/` (a barrel module: `command`/`runtime`/`commands/`/`bindings`/`scopes`/`format`), per-scope binding-only layers attached via `useBindings` from the components that own each scope
- **API auth**: Cookie-based (`LEETCODE_SESSION` + `csrftoken`). Acquired by `src/core/auth/` (Firefox cookie import → guided paste fallback), validated against LeetCode, then persisted to config. Boot validates the saved session and re-prompts on expiry; an in-app "Re-authenticate" command (Ctrl+P) recovers mid-session
- **DB sync**: Paginated fetch of all LeetCode problems on first run, stored in SQLite
- **Local test harness**: Each solution gets an auto-generated harness (`src/core/harness/`) so `t` (problem view) and `leettui test` run the seeded example cases **offline**, no LeetCode round-trip. Interpreted langs (`python3`/`node`/`bun`) run the harness script per case; the **compiled** langs **compile once** before the case loop: **rust** (Stage 14) scaffolds a `cargo` + `serde_json` project (`Cargo.toml` + `main.rs` + `.gitignore`; `main.rs` pulls in `solution.rs` as a **real module** — `mod solution;` — and `solution.rs` carries a `#[cfg(feature = "harness")] struct Solution;` so it stays submittable verbatim yet rust-analyzer gives it completions, **Stage 21**; the old `include!` gave 0 completions on the edited file), and **csharp** (Stage 17) scaffolds a `.csproj` + `System.Text.Json` project (`main.csproj` + `main.cs` + `.gitignore`, with the bare `public class Solution` byte-for-byte submittable in `solution.cs`, co-compiled into one assembly). Running tests needs the language's toolchain on PATH — rust the Rust toolchain (`cargo`/`rustc`, via rustup), csharp the .NET SDK (`dotnet`); a missing one surfaces as a clean, per-language compile-error hint, never a crash. Harness coverage is **demand-driven** (see `docs/scratchpad/notes.md` "Harness type-support strategy"): a problem whose signature uses a type the harness doesn't support locally yet (e.g. `ListNode`/`TreeNode`) generates **no** harness and shows a clear "use `R`/`s`" message instead of crashing — support for a `(type, language)` cell is added when a real problem actually needs it. **Caveat + fix (Stage 16):** that graceful refusal only covers **newly created** solutions; a harness written *before* the fallback landed (a broken `main.py`/`main.rs` passthrough for a `ListNode`/`TreeNode` problem) is a **stale on-disk artifact** that still crashes on `t` until it's removed — the in-TUI **delete-solution** action (`d` from the focused Solutions panel + a confirm modal) clears the whole language folder so it can be re-created clean (or abandoned). See `src/core/CLAUDE.md` for the generator + runner internals.

### LeetCode API

- GraphQL: `https://leetcode.com/graphql` (problemsetQuestionList, questionContent, questionEditorData, consolePanelConfig)
- Run: `POST /problems/{slug}/interpret_solution/`
- Submit: `POST /problems/{slug}/submit/`
- Poll: `GET /submissions/detail/{id}/check/`

### Key bindings (browse mode)

Browse uses lazygit-style focusable panels (Stage 11): exactly one panel is focused.
Tab / Shift+Tab: cycle focus | Ctrl+h/Ctrl+l: focus left/right | [1]/[2]: jump to topics/questions panel
Topics focused — j/k: change topic (live-filters questions) | gg/G: jump first/last | Ctrl+d/Ctrl+u: scroll jump (distance configurable via [scroll] jump_rows) | Enter: focus questions
Questions focused — j/k or arrows: navigate | gg/G: jump first/last | Ctrl+d/Ctrl+u: scroll jump (distance configurable via [scroll] jump_rows) | Enter: view problem
  e: Open in editor (single solution file) | w: Open workspace (whole problem folder) | R: Run | s: Submit | y: Yank URL
Global (any panel) — d: Daily challenge | h: Recently viewed (history modal) | D: Cycle difficulty | /: Search | ?: Help | q: Quit
Daily challenge popup — Enter: open in problem view | j/k: scroll | Esc: close

`e` opens the single `solution.{ext}` with cwd = the language folder (so `leettui test` cwd-inference + per-language LSP work); `w` opens the whole problem folder (`$EDITOR {problemDir}`) as a workspace so `problem.md`, `notes.md`, and every language subfolder are in the editor's file tree at once. `w` works in problem view too. Opening a workspace generates `problem.md` (the description, create-if-absent) and `notes.md` if absent.

A **recently-viewed history modal** (Stage 20) opens with `h` from browse (plain `h` is free — only `Ctrl+h` traverses panels). It lists the questions you've opened, newest first, in a `SelectPopup`-style overlay (`j/k` navigate, `Enter` jumps to the question, `Esc`/`h` close). A question is recorded as "viewed" at the moment of intent — opening the problem detail popup (daily challenge) or entering `ProblemView` — never on cursor scroll. The data lives in a capped (~50) SQLite `recents` table (`src/db/recents.ts`): `recordRecent(id)` upserts-and-bumps so re-viewing moves a row to the top, `getRecents()` joins back to `questions` recency-ordered. The always-visible `[topics][questions][recent]` panel was deliberately deferred — the modal reuses the established popup pattern, and the data layer makes a panel a cheap later re-skin.

A **"What's new" changelog popup** (Stage 18) auto-appears once on the first launch **after you update** — showing the notes of the version you just installed (fetched from that release's GitHub notes). A fresh install doesn't pop (it's seeded "caught up"); only a genuine version change triggers it. Reopen the changelog anytime from the command palette (`Ctrl+P` → "What's new"), which shows the **latest** release; inside the popup `o` opens the full release page on GitHub, `j/k` scroll, `Esc`/`q` close. The palette command works on dev/from-source builds too; the auto-popup only fires on official release builds.

### Config file (`~/.config/leettui/config.toml`)

`csrftoken` and `lc_session` are normally written by the auth flow (`src/core/auth/`), not by hand — Firefox auto-import or a guided, validated paste. `bun src/index.tsx auth` re-runs it.

`[scroll] jump_rows` (default `10`) sets how many rows `Ctrl+d`/`Ctrl+u` jump. Read via `getScrollJumpRows()`; a below-1/NaN/non-number value falls back to the default and a fractional value is floored. There's no upper bound — an oversized count just overshoots the list end, which the cursor clamp pins back into range.
