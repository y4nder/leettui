# External Integrations

**Analysis Date:** 2026-06-25

## APIs & External Services

**LeetCode:**
- GraphQL API: `https://leetcode.com/graphql`
  - SDK/Client: Custom fetch-based client in `src/api/client.ts`
  - Queries:
    - `problemsetQuestionList` - Paginated problem list (1000 items/page)
    - `questionContent` - Problem description (HTML, cached 5min)
    - `questionEditorData` - Code snippets per language (cached 5min)
    - `consolePanelConfig` - Example test cases + solution signature metadata (cached 5min)
    - `activeDailyCodingChallengeQuestion` - Daily challenge
    - `similarQuestionList` - Related problems for a question
  
- REST API: `https://leetcode.com`
  - `POST /problems/{slug}/interpret_solution/` - Run solution against test cases
  - `POST /problems/{slug}/submit/` - Submit solution for verdict
  - `GET /submissions/detail/{id}/check/` - Poll submission result (500ms interval, 60 polls max = 30s timeout)
  - Auth: Cookie-based (`LEETCODE_SESSION` + `csrftoken`)

## Data Storage

**Databases:**
- SQLite (local, `~/.local/share/leettui/questions.db`)
  - Driver: `bun:sqlite`
  - ORM: Drizzle ORM `0.44.4`
  - Schema: Questions, topics, mappings, recently-viewed history
  - Migrations: Embedded in binary via `src/db/migrations.ts`

**File Storage:**
- Local filesystem only
  - Solutions: `~/.local/share/leettui/solutions/{id}_{slug}/{langSlug}/`
  - Config: `~/.config/leettui/config.toml`
  - Session state: `~/.local/share/leettui/session.json`
  - Templates (optional): `~/.config/leettui/templates/{langSlug}/`

**Caching:**
- In-memory GraphQL cache (5min TTL, 20 entry LRU) in `src/api/graphql.ts`
- Session persistence (debounced write ~400ms to `session.json`)

## Authentication & Identity

**Auth Provider:**
- Custom implementation (cookie-based)
  - Method: LeetCode session cookies (`LEETCODE_SESSION` + `csrftoken`)
  - Acquisition:
    - Auto-import from Firefox cookies (`src/core/auth/firefox.ts`)
    - Manual paste guide (DevTools → Network tab)
    - Browser: `LOGIN_URL = "https://leetcode.com/accounts/login/"`
  - Validation: GraphQL `globalData { userStatus { isSignedIn, username } }` query
  - Persistence: `~/.config/leettui/config.toml` (top-level `csrftoken` + `lc_session`)
  - Expiry handling: Mid-session re-auth command (Ctrl+P) via `src/core/auth/index.ts`
  - Firefox integration: Reads from `~/.mozilla/firefox/*/cookies.sqlite` (and snap/flatpak variants)

## Monitoring & Observability

**Error Tracking:**
- Not implemented; errors printed to stderr/console

**Logs:**
- Console logs only (e.g., auth status, sync progress)
- Session state written to `~/.local/share/leettui/session.json` for position/history persistence

## CI/CD & Deployment

**Hosting:**
- GitHub (source repository)

**CI Pipeline:**
- `.github/workflows/ci.yml` - Runs on push to main + PRs
  - Gate: `bun run check` (biome lint + tsc typecheck + bun test)
  - Node version: Latest (via oven-sh/setup-bun)

**Release Workflow:**
- `.github/workflows/release.yml` - Triggered on git tag push (`v*`)
  - Builds: Ubuntu (linux-x64), macOS 14 (darwin-arm64), Windows (windows-x64)
  - Artifacts:
    - Linux/macOS: Raw binary + gzip-compressed sibling
    - Windows: Raw `.exe` only (no compression; no in-place self-update on Windows)
  - Release: Publishes to GitHub Releases with auto-generated notes (`softprops/action-gh-release`)

## Environment Configuration

**Required env vars:**
- None at runtime (configuration is entirely TOML-based)
- Build-time (set by CI workflow):
  - `LEETTUI_VERSION` - Git tag or version string
  - `LEETTUI_IS_RELEASE` - `"1"` for official builds only

**Optional env vars:**
- `XDG_CONFIG_HOME` - Override config dir (default `~/.config`)
- `XDG_DATA_HOME` - Override data dir (default `~/.local/share`)
- `EDITOR` - Fallback editor for solution editing (overrideable in config)
- `NO_COLOR` - Disable ANSI colors in terminal output

**Secrets location:**
- `~/.config/leettui/config.toml` - Contains LeetCode session tokens (plaintext, user-owned file)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- GitHub API (`gh` CLI):
  - Create repo: `gh repo create {name} --source=. --remote=origin --push` (optional backup wizard)
  - Clone repo: `gh repo clone {repo} {dir}` (optional restore from backup)
  - Auth status: `gh auth login` (separate from LeetCode auth)

**Browser Integration:**
- Opens LeetCode login page via system browser (`xdg-open` on Linux, `open` on macOS, `cmd /c start` on Windows)
- Also used for GitHub release page in changelog popup (`o` key)

## Code Execution & Testing

**Local Test Harness:**
- Interpreted languages (Python, JavaScript, TypeScript, Node):
  - Generated harness file (`main.py`, `main.js`, `main.ts`)
  - Runs via interpreter on each test case
  - Toolchain: `python3`, `node`, `bun`

- Compiled languages (Rust, C#, Java):
  - Generated manifest + harness files
  - One compile step, then runs binary per case
  - Rust: `cargo build` (fetches `serde_json`), runs `./target/debug/main`
  - C#: `dotnet build -o out`, runs `./out/main`
  - Java: `javac solution.java main.java`, runs `java -cp . Main`
  - Toolchain required: `cargo`/`rustc`, `dotnet`, `javac`/`java`

**Editor Integration:**
- Spawns configured editor (Ctrl+e) or workspace (Ctrl+w)
- Editor: `[editor] command` in config → `$EDITOR` → platform default (vim/code --wait/notepad)
- Cwd awareness: Solution file opened from lang folder; workspace from problem folder
- Renderer suspend/resume via `Bun.spawn(..., { stdin: "ignore" })`

## Git Integration

**Git Delegation:**
- `Ctrl+g` spawns configured git UI (default `lazygit`) in solutions dir
- Git operations (`src/core/git.ts`):
  - `ensureSolutionsRepo()` - Init + defensive `.gitignore` (secrets: `*.db`, `session.json`, `config.toml`)
  - `ghCreateArgv()` / `ghCloneArgv()` - Pure argv builders for `gh repo create` / `gh repo clone`
  - `hasRemote()` / `gitPull()` - Non-interactive remote sync (Stage 24)
  - Environment: `GIT_TERMINAL_PROMPT=0` (prevents prompts from hanging TUI)
  - Fallback: Manual git commands printed if `lazygit` or `gh` missing

## Executable Tools

**Required (if using local test harness):**
- Language interpreters/compilers on PATH:
  - `python3` - Python problems
  - `node` - JavaScript problems
  - `bun` - TypeScript problems
  - `cargo` + `rustc` - Rust problems (via rustup)
  - `dotnet` - C# problems (the .NET SDK)
  - `javac` + `java` - Java problems (a JDK)

**Optional (graceful degradation):**
- `lazygit` - Git UI (falls back to `gitui`/`tig`/`git` or manual)
- `gh` - GitHub CLI (for remote backup/restore)
- Editor tools for syntax highlighting (built into editor, no dep on leettui)

## External Release Assets

**GitHub Release:**
- Download location: `https://github.com/y4nder/leettui/releases/latest`
- Assets published on version tag
- Compressed (`.gz`) sibling preferred for bandwidth (~64% reduction)
- Self-update in-app: `leettui update` (official builds only, refuses if IS_RELEASE unset)
- Changelog fetched from release notes (displayed in "What's new" popup)

## Network & Connectivity

**API Clients:**
- Fetch API (native to Bun)
- Authenticated headers: `Cookie`, `x-csrftoken`, `Content-Type: application/json`
- Polling: 500ms interval, 60-poll timeout (30s max for run/submit results)
- Caching: 5min TTL for GraphQL queries (problem content, signatures, daily challenge)

**Network Errors:**
- Validation queries timeout → treated as "unknown" (online verification skipped, session assumed valid)
- Submit/run timeouts → clear "submission timed out" message
- No retry logic (failures are terminal; user can retry via `R`/`s` keys)
- Network-related tools (Firefox cookie read, GitHub clone/push) use `GIT_TERMINAL_PROMPT=0` + `BatchMode=yes` to prevent hangs

---

*Integration audit: 2026-06-25*
