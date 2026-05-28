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
- Auth requires manually copying browser cookies into config
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

## Requirements

- [Bun](https://bun.sh) (required by OpenTUI)
- A LeetCode account with session cookies

---

## Getting started

```sh
git clone <repo>
cd leettui
bun install
bun src/index.tsx
```

On first run, a config file is created at `~/.config/leettui/config.toml`. Open it and fill in your LeetCode session tokens:

```toml
[auth]
csrftoken = "..."
lc_session = "..."
```

Get these from your browser's DevTools after logging in to leetcode.com (Application → Cookies → leetcode.com).

Restart after saving the config. The problem list syncs from LeetCode on the first authenticated run and is cached in SQLite.

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
[auth]
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
