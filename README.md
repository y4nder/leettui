# leettui

> **Experimental** — actively being refined. Expect rough edges.

A terminal UI for LeetCode, built with [OpenTUI](https://github.com/max-kazak/opentui) (React bindings) and Bun.

---

## Demo

<!-- TODO: add demo video once recorded -->
<!-- [![leettui demo](docs/demo-thumbnail.png)](docs/demo.mp4) -->

*Demo video coming soon.*

---

## Why

We're in the era of coding agents. It's never been easier to get code written for you — which makes it all the more important to stay sharp on the fundamentals yourself.

This project exists for two reasons:

1. **Practice building TUIs** — a hands-on way to learn terminal UI architecture, state management, and keybinding systems.
2. **A fun way to touch grass** — a self-contained coding environment that gets you back to thinking about algorithms and data structures without the noise of a browser.

---

## Status

Stage 1 (Core MVP) and Stage 2 (Architecture refactor) are complete. Stage 3 refinement items (themes, stats, daily challenge, help screen) are also done. Stage 4 differentiation features are planned.

Current rough edges:
- No offline mode; all problem content fetched live
- Browser cookie auto-import currently covers Firefox only (Chromium is paste-only)
- Some edge cases in run/submit output formatting

---

## Features

- Browse all LeetCode problems with topic filter navigation
- Fuzzy search by problem title
- Scrollable problem description popup (Markdown rendered)
- Open solution in `$EDITOR` with a pre-populated template
- Run solution against example test cases
- Submit solution and see runtime/memory percentile
- Daily challenge shortcut
- Command palette (`Ctrl+P`) listing all available actions
- Multiple themes (tokyo-night, catppuccin) via config

---

## Install

### Prebuilt binary (Linux / macOS)

```sh
curl -fsSL https://raw.githubusercontent.com/y4nder/leettui/main/install.sh | sh
```

Downloads the latest release binary for your platform into `~/.local/bin` (override with `LEETTUI_INSTALL_DIR`). No Bun required — the binary is self-contained. Then run `leettui`.

**Windows:** download `leettui-windows-x64.exe` from the [Releases page](https://github.com/y4nder/leettui/releases) and run it.

### Updating

```sh
leettui update          # download the latest release and replace the binary in place
leettui --version       # check the installed version
```

`leettui update` checks the latest GitHub release, skips the download if you're already current (pass `--force` to reinstall anyway), and atomically swaps in the new binary — restart to use it. Re-running the `install.sh` curl command above also works, and is the way to update on Windows.

### From source

Requires [Bun](https://bun.sh) (the OpenTUI runtime) and a LeetCode account.

```sh
git clone https://github.com/y4nder/leettui
cd leettui
bun install
bun src/index.tsx        # run directly
bun run build            # or compile a standalone ./leettui binary
```

### First run

Every launch opens with a brief animated splash. The **first** time (binary or from source), it flows into an in-app setup wizard rendered right in the TUI — no terminal prompts to wrestle with:

1. **Sign in.** If you're logged into leetcode.com **in Firefox**, leettui imports your session automatically — nothing to do. Otherwise it opens leetcode.com in your browser and shows a paste field: in DevTools (F12) → Network → click any request to leetcode.com → Headers → Request Headers, copy the whole `Cookie:` value and paste it in. (You can also paste the two tokens one at a time.)
2. **Sync problems.** Tokens are verified against LeetCode before anything is saved — so you never get stuck with credentials that silently don't work — then the full problem list syncs with a progress bar and is cached in SQLite. You land in the problem browser.

Your validated tokens are written to `~/.config/leettui/config.toml`. Returning launches skip the wizard (just the quick splash, then straight to browse); an expired session is detected at startup and re-runs the wizard automatically.

Re-authenticate any time: run `leettui auth` (or `bun src/index.tsx auth` from source), or trigger it from inside the app via the command palette (`Ctrl+P` → "Re-authenticate").

---

## Keybindings

| Key | Action |
|-----|--------|
| `j` / `k` or arrows | Navigate problems |
| `t` / `T` | Next / previous topic |
| `Enter` | Open problem description |
| `e` | Open solution in `$EDITOR` |
| `R` | Run solution |
| `s` | Submit solution |
| `/` | Search |
| `d` | Open today's daily challenge |
| `Ctrl+P` | Command palette |
| `h` | Help screen |
| `q` | Quit |

---

## Configuration

`~/.config/leettui/config.toml`

```toml
# Auth tokens — normally written by the auth flow, not by hand.
csrftoken = "..."
lc_session = "..."

[theme]
name = "tokyo-night"   # or "catppuccin"
```

---

## Architecture

| Layer | Tech |
|-------|------|
| Runtime | Bun |
| UI | OpenTUI + React (`@opentui/react`) |
| State | Zustand slices + React `useReducer` |
| Storage | SQLite via `bun:sqlite` |
| Config | TOML via `smol-toml` |

```
src/
  api/        LeetCode GraphQL + REST client
  config/     Config loading, XDG paths
  core/       Business logic (sync, search, submission, solutions)
  db/         SQLite schema + CRUD
  ui/         React components, hooks, keymap, theme
  views/      Screen-level orchestration (BrowseView, ...)
```

---

## Tech stack

- [`@opentui/core`](https://github.com/max-kazak/opentui) — terminal rendering primitives
- [`@opentui/react`](https://github.com/max-kazak/opentui) — React bindings for OpenTUI
- [`@opentui/keymap`](https://github.com/max-kazak/opentui) — declarative keybinding layer
- [`zustand`](https://github.com/pmndrs/zustand) — lightweight state management
- [`smol-toml`](https://github.com/nicolo-ribaudo/smol-toml) — TOML config parsing
- [`node-html-markdown`](https://github.com/crosstype/node-html-markdown) — HTML → Markdown for problem descriptions
- [`bun:sqlite`](https://bun.sh/docs/api/sqlite) — built-in SQLite

---

## Disclaimer

This project is not affiliated with LeetCode. It uses their APIs in the same way a logged-in browser session would. Use responsibly and in accordance with LeetCode's terms of service.
