<div align="center">

# leettui

**Grind LeetCode without leaving your terminal.**

A snappy terminal UI for LeetCode — browse, solve, run, and submit, all from a keyboard-driven TUI.

<img width="1920" height="1080" alt="leettui_splash" src="https://github.com/user-attachments/assets/d996bb2b-3260-43cf-83ef-5eb99997a6a7" />


[![Built with OpenTUI](https://img.shields.io/badge/built%20with-OpenTUI-7aa2f7?style=flat-square)](https://github.com/sst/opentui)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![React](https://img.shields.io/badge/UI-React%2019-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Status: Stable](https://img.shields.io/badge/status-stable-brightgreen?style=flat-square)](#)

</div>

---

## Demo

<!--  https://github.com/user-attachments/assets/414c0e9d-7504-401c-9c5f-ade426ae5614 -->


https://github.com/user-attachments/assets/19f9c07c-33ab-40b3-9083-53e8ae2dd7c8


---

## Why

We're in the era of coding agents. It's never been easier to get code written for you — which makes it all the more important to stay sharp on the fundamentals yourself.

This project exists for two reasons:

1. **Practice building TUIs** — a hands-on way to learn terminal UI architecture, state management, and keybinding systems.
2. **A fun way to touch grass** — a self-contained coding environment that gets you back to thinking about algorithms and data structures without the noise of a browser.

---

## Features

- Browse all LeetCode problems with topic filter navigation
- Fuzzy search by problem title
- Scrollable problem description (Markdown rendered)
- Open solutions in `$EDITOR` with a pre-populated template
- Run solutions against example test cases
- Submit solutions and see runtime/memory percentiles
- Daily challenge shortcut
- Recently viewed history (`h`) — jump back to a question you just looked at
- Command palette (`Ctrl+P`) listing every available action
- "What's new" changelog popup after you update (reopen any time from the palette)
- Version-control your solutions — `Ctrl+g` opens lazygit in your solutions dir, with optional one-step GitHub backup and sync/restore
- Multiple themes (tokyo-night, catppuccin) via config
- [Per-language template overrides](docs/template-overrides.md) — custom solution stubs, harnesses, and manifests

---

## Install

### Prebuilt binary (Linux / macOS)

```sh
curl -fsSL https://raw.githubusercontent.com/y4nder/leettui/main/install.sh | sh
```

Downloads the latest release binary for your platform into `~/.local/bin` (override with `LEETTUI_INSTALL_DIR`). The download is a **gzip-compressed asset** (~40 MB on the wire vs. ~111 MB raw) that the installer decompresses locally, so the installed binary is unchanged — it just transfers in roughly a third of the bytes. No Bun required — the binary is self-contained. Then run `leettui`.

**Windows:** download `leettui-windows-x64.exe` from the [Releases page](https://github.com/y4nder/leettui/releases) and run it.

### Updating

```sh
leettui update          # download the latest release and replace the binary in place
leettui --version       # check the installed version
```

`leettui update` checks the latest GitHub release, skips the download if you're already current (pass `--force` to reinstall anyway), and atomically swaps in the new binary — restart to use it. Like the installer, it fetches the gzip-compressed asset and decompresses it on the fly, so a self-update transfers ~40 MB instead of ~111 MB. Re-running the `install.sh` curl command above also works, and is the way to update on Windows.

After you update, leettui shows a **"What's new"** popup once on the next launch, with the notes for the version you just installed. (A one-line banner separately tells you when a newer release is available.) Reopen the changelog any time from the command palette (`Ctrl+P` → "What's new"), which shows the latest release; press `o` inside it to open the full release page on GitHub.

### From source

Requires [Bun](https://bun.sh) (the OpenTUI runtime) and a LeetCode account.

```sh
git clone https://github.com/y4nder/leettui
cd leettui
bun install
bun src/index.tsx        # run directly
bun run build            # or compile a standalone ./leettui binary
```

---

## First run

Every launch opens with a brief animated splash. The **first** time (binary or from source), it flows into an in-app setup wizard rendered right in the TUI — no terminal prompts to wrestle with:

1. **Sign in.** If you're logged into leetcode.com **in Firefox**, leettui imports your session automatically — nothing to do. Otherwise it opens leetcode.com in your browser and shows a paste field: in DevTools (F12) → Network → click any request to leetcode.com → Headers → Request Headers, copy the whole `Cookie:` value and paste it in. (You can also paste the two tokens one at a time.)
2. **Sync problems.** Tokens are verified against LeetCode before anything is saved — so you never get stuck with credentials that silently don't work — then the full problem list syncs with a progress bar and is cached in SQLite. You land in the problem browser.

Your validated tokens are written to `~/.config/leettui/config.toml`. Returning launches skip the wizard (just the quick splash, then straight to browse); an expired session is detected at startup and re-runs the wizard automatically.

Re-authenticate any time: run `leettui auth` (or `bun src/index.tsx auth` from source), or trigger it from inside the app via the command palette (`Ctrl+P` → "Re-authenticate").

---

## Keybindings

Both the browser and the problem view use a **lazygit-style panel layout** — exactly one panel is focused, and `j`/`k` act on whatever is focused. Cycle focus with `Tab` / `Shift+Tab`, move spatially with `Ctrl+h/l` (and `Ctrl+j/k` in the problem view), or jump straight to a panel with the number keys. Press `?` anywhere for a focus-aware help popup, or `Ctrl+P` for the full command palette.

### Browse

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle panel focus |
| `Ctrl+h` / `Ctrl+l` | Focus panel left / right |
| `1` / `2` | Jump to topics / questions panel |
| `r` | Jump to a random question |
| `h` | Recently viewed questions (history modal) |
| `D` | Cycle difficulty filter (Easy → Medium → Hard → All) |
| `d` | Open today's daily challenge (in the popup, `Enter` opens it in the problem view) |
| `/` | Search (scoped to the focused panel) |
| `?` | Help |
| `Ctrl+P` | Command palette |
| `Ctrl+g` | Open git UI (lazygit) in your solutions dir |
| `W` | Open the whole solutions dir in `$EDITOR` (vs. `w` = one problem's folder) |
| `q` | Quit |

**Topics panel focused** — `j`/`k` or arrows change topic (live-filters questions) · `Enter` focuses the questions panel

**Questions panel focused** — `j`/`k` or arrows navigate · `gg` / `G` jump to first / last · `Enter` open problem view · `e` open in `$EDITOR` · `w` open workspace (whole problem folder) · `R` run · `s` submit · `y` yank URL

### Problem view

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle panel focus |
| `Ctrl+h/j/k/l` | Focus panel left / down / up / right |
| `1` / `2` / `3` / `4` | Jump to description / solutions / result / related |
| `f` | Solution picker (switch language or start a new one) |
| `e` | Open active solution in `$EDITOR` |
| `w` | Open the whole problem folder as a workspace |
| `W` | Open the whole solutions dir in `$EDITOR` (every problem at once) |
| `R` | Run against example test cases |
| `t` | Run against local test cases |
| `s` | Submit |
| `n` | Notes |
| `?` | Help |
| `Esc` / `q` | Close problem view |

**Description / Result panel focused** — `j`/`k` or arrows scroll

**Solutions panel focused** — `j`/`k` cycle the active solution · `Enter` open it in `$EDITOR` · `d` delete the active solution (a `y`/`n` confirm names the language; removes only that language folder, keeping shared notes/tests)

**Related panel focused** — `j`/`k` move the cursor · `Enter` open the related question

### From your editor

leettui also exposes a few headless verbs that infer the problem from the current directory, so you can drive it from inside `$EDITOR` (e.g. `:!leettui test`) without leaving your solution:

| Command | What it does |
|---------|--------------|
| `leettui test` | Run the seeded example cases offline (no LeetCode round-trip) |
| `leettui run` | Run against LeetCode's example cases |
| `leettui submit` | Submit to LeetCode |
| `leettui new <language>` | Scaffold a solution + harness + tests for `<language>` |

`new` is the editor-side companion to the in-app solution picker: open a problem's workspace with `w`, then `:!leettui new rust` (or any language LeetCode offers for the problem) to add that language's `solution.*` + local harness without touching the TUI. It's idempotent — if the solution already exists it just prints the path.

---

## Version control

Your solutions directory is laid out to be git-friendly (one folder per problem, build artifacts already `.gitignore`d), and leettui makes versioning it a one-key affair rather than reimplementing git:

- **`Ctrl+g`** opens [lazygit](https://github.com/jesseduffield/lazygit) in your solutions dir (override the tool with `[git] ui` in your config — any cwd-respecting tool like `gitui`/`tig` works). If the dir isn't a repo yet, leettui offers to `git init` it — with a safe `.gitignore` that keeps local databases/sessions out of version control, plus a first commit — then drops you straight into the git UI. On a genuine first run, right after you pick where solutions live, leettui offers a choice: **start a new repo, clone an existing GitHub backup (restore from another machine), or skip.**
- **Back up to GitHub** from the command palette (`Ctrl+P` → "Back up solutions to GitHub"): name a private repo and leettui runs `gh repo create … --push` for you. This uses the [GitHub CLI](https://cli.github.com/)'s own login (`gh auth login`) — entirely separate from your LeetCode session — and prints the manual `git remote` commands if `gh` isn't installed.
- **Sync from GitHub** from the command palette (`Ctrl+P` → "Sync solutions from GitHub") — the inverse of backup. **On a new machine** the simplest path is the first-run prompt above (pick "clone an existing GitHub backup"); anytime after, point `[paths] solutions` at an empty directory and run this command — leettui `gh repo clone`s your backup into it, restoring every solution. On an **already-tracked** dir it instead fast-forward-pulls the latest (`git pull --ff-only`). A diverged history is never force-merged: leettui surfaces the error and tells you to open lazygit (`Ctrl+g`) to resolve it. Clone uses `gh`'s login; pull is plain git.

Both lazygit and `gh` are optional: leettui shows an install hint instead of crashing when one isn't on your `PATH`.

---

## Configuration

`~/.config/leettui/config.toml`

```toml
# Auth tokens — normally written by the auth flow, not by hand.
csrftoken = "..."
lc_session = "..."

[git]
ui = "lazygit"         # git UI opened by Ctrl+g (default: lazygit)

[theme]
name = "tokyo-night"   # or "catppuccin"
```

### Per-language template overrides

Customize what gets written when you create a solution — your own starter stub, a custom test harness, or extra files like a `Cargo.toml` or build script — per language, by dropping files in `~/.config/leettui/templates/{langSlug}/`. See the [template overrides guide](docs/template-overrides.md).

---

## Architecture

| Layer | Tech |
|-------|------|
| Runtime | Bun |
| UI | OpenTUI + React (`@opentui/react`) |
| State | Zustand slices + React `useReducer` |
| Storage | SQLite via Drizzle ORM on the `bun:sqlite` driver |
| Config | TOML via `smol-toml` |

```
src/
  api/        LeetCode GraphQL + REST client
  config/     Config loading, XDG paths
  core/       Business logic (sync, search, submission, solutions)
  db/         SQLite schema + CRUD (Drizzle)
  ui/         React components, hooks, keymap, theme
  views/      Screen-level orchestration (BrowseView, ...)
```

---

## Tech stack

- [`@opentui/core`](https://github.com/sst/opentui) — terminal rendering primitives
- [`@opentui/react`](https://github.com/sst/opentui) — React bindings for OpenTUI
- [`@opentui/keymap`](https://github.com/sst/opentui) — declarative keybinding layer
- [`drizzle-orm`](https://orm.drizzle.team) — type-safe SQL over `bun:sqlite`
- [`zustand`](https://github.com/pmndrs/zustand) — lightweight state management
- [`smol-toml`](https://github.com/squirrelchat/smol-toml) — TOML config parsing
- [`node-html-markdown`](https://github.com/crosstype/node-html-markdown) — HTML → Markdown for problem descriptions

---

## Acknowledgements

Heavily inspired by [leetcode-tui](https://github.com/akarsh1995/leetcode-tui) by [@akarsh1995](https://github.com/akarsh1995) — a Rust-based LeetCode TUI that sparked the idea for this project.

---

## Disclaimer

This project is not affiliated with LeetCode. It uses their APIs in the same way a logged-in browser session would. Use responsibly and in accordance with LeetCode's terms of service.
