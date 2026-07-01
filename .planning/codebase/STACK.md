# Technology Stack

**Analysis Date:** 2026-06-25

## Languages

**Primary:**
- TypeScript 5.x - Full codebase (`src/`, `scripts/`, tests)

## Runtime

**Environment:**
- Bun (latest) - Required by OpenTUI; enables `bun:sqlite` and native speed
- Node 18+ - For development tooling (via Bun's runtime compatibility)

**Package Manager:**
- Bun - Project-native (installs, runs scripts, tests, builds)
- Lockfile: `bun.lock` (present, frozen on CI via `--frozen-lockfile`)

## Frameworks

**Core UI:**
- OpenTUI `0.2.16` (`@opentui/core`, `@opentui/react`, `@opentui/keymap`) - React bindings for TUI, tree-sitter syntax highlighting, keybinding framework

**UI State Management:**
- React `19.2.6` - Via `@opentui/react` (functional components, hooks)
- Zustand `5.0.13` - App state store split into domain/UI slices (`src/ui/store/`)

**Testing:**
- Bun test (built-in) - Run with `bun test`
- Unit + integration tests in `*.test.ts` files co-located with source

**Build/Dev:**
- Biome `2.5.0` - Linting + formatting (zero-tolerance warnings via `--error-on-warnings`)
- Drizzle ORM `0.44.4` - SQLite schema + migrations (pinned to match `drizzle-kit`)
- Drizzle Kit `0.31.10` - Migration generation (dev-only)
- Husky `9.1.7` - Git hooks (`pre-commit` → lint+typecheck; `pre-push` → tests)

## Key Dependencies

**Critical:**
- `drizzle-orm` `0.44.4` - SQLite ORM for local questions database (pinned with drizzle-kit 0.31.x)
- `smol-toml` `1.6.1` - Config file parsing (`~/.config/leettui/config.toml`)
- `react` `19.2.6` - Required peer for `@opentui/react`

**Infrastructure:**
- `node-html-markdown` `2.0.0` - HTML → Markdown conversion for LeetCode descriptions
- `opentui-spinner` `0.0.7` - Loading spinner component

**Dev-only:**
- `@types/bun`, `@types/react` - TypeScript definitions
- `typescript` `5.x` - Type checking (peer dependency)

## Configuration

**Environment:**
- `~/.config/leettui/config.toml` - TOML config file (tokens, editor, paths, theme, scroll settings)
  - No `.env` files used
  - Build-time environment variables injected via `--define`:
    - `LEETTUI_VERSION` - Git tag or `git describe` version
    - `LEETTUI_IS_RELEASE` - `"1"` only for official release builds (gates self-update)

**Build:**
- `tsconfig.json` - TypeScript configuration (ESNext target, strict mode, Bun's bundler module resolution)
- `biome.json` - Linting + formatting rules (line width 100, double quotes, zero-tolerance on warnings)
- `drizzle.config.ts` - SQLite dialect, schema path, migrations output dir
- `.github/workflows/ci.yml` - CI gate: lint + typecheck + test
- `.github/workflows/release.yml` - Multi-platform binary release (Linux x64, macOS arm64, Windows x64)

## Platform Requirements

**Development:**
- Bun (any version, latest recommended)
- A POSIX shell for scripts (`scripts/build.ts`, `scripts/smoke.sh`)
- For compiled language support (rust, csharp, java): optional toolchains on PATH (`cargo`, `dotnet`, `javac`)

**Production:**
- Standalone binary (`leettui-{platform}`) - No runtime dependencies
- For local testing with compiled languages: toolchain on PATH (`cargo`, `dotnet`, `javac`)
- For git operations: optional `lazygit` or other git UI tool (gracefully degrades if missing)
- For editor integration: `$EDITOR` or configured command

## Build Process

**Development:**
```bash
bun install                 # Install deps (includes frozen lockfile check on CI)
bun run check              # Full gate: biome + tsc + tests
bun run lint:fix           # Auto-fix linting issues
bun src/index.tsx          # Run from source (VERSION="dev", IS_RELEASE=false)
```

**Production:**
- `scripts/build.ts` - Local production build
  - Stamps binary with `git describe` version
  - Sets `NODE_ENV=production` + minification
  - Refuses self-update (IS_RELEASE unset)
  
- `.github/workflows/release.yml` - Official release build
  - Per-platform runners (Ubuntu x64, macOS arm64, Windows x64)
  - Stamps with git tag (e.g., `v0.2.0`)
  - Sets `IS_RELEASE="1"` (enables in-binary self-update)
  - Bundles OpenTUI's tree-sitter worker + wasm
  - Gzips self-updatable assets (~64% size reduction, 111MB → 40MB)

**Compilation:**
```bash
# Two entry points bundled together:
bun build \
  ./src/index.tsx \
  ./node_modules/@opentui/core/parser.worker.js \
  --compile --production \
  --define 'process.env.LEETTUI_VERSION="..."' \
  --define 'process.env.LEETTUI_IS_RELEASE="1"' \
  --target=bun-linux-x64
```

## Database

- SQLite via `bun:sqlite` (built into Bun)
- Drizzle ORM for typed queries
- Embedded migrations shipped inside compiled binary (`src/db/migrations.ts`)
- Schema: `questions`, `topics`, `question_topics` (join), `recents` (history)
- Location: `~/.local/share/leettui/questions.db` (configurable via `[paths] db`)

## Deployment Artifacts

**Release assets** (GitHub Releases):
- `leettui-linux-x64` + `leettui-linux-x64.gz` (gzip-compressed)
- `leettui-macos-arm64` + `leettui-macos-arm64.gz` (gzip-compressed)
- `leettui-windows-x64.exe` (raw, no gzip on Windows)

**Installation:**
- Linux/macOS: `install.sh` (fetches `.gz` or raw, decompresses, moves to PATH)
- Windows: `install.ps1` (PowerShell, fetches raw `.exe`, moves to `%LOCALAPPDATA%\leettui\bin`)

---

*Stack analysis: 2026-06-25*
