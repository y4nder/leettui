# 🧩 Per-language template overrides

By default, when you create a solution, leettui writes two files into the language folder:

- `solution.{ext}` — LeetCode's starter snippet
- `main.{ext}` — an auto-generated local test harness (for `python3`, `javascript`, `typescript`)

**Template overrides** let you customize what gets written, per language: ship your own solution stub, swap in a custom harness, or add extra files like a `Cargo.toml`, a build script, or helper modules — automatically, on every new solution.

If you never create a template, nothing changes — you get the bundled defaults as before.

---

## Where templates live

```
~/.config/leettui/templates/{langSlug}/
```

One subfolder per language, named by its LeetCode **langSlug** — the same id leettui uses for the solution subfolder.

| Language | langSlug | Language | langSlug |
|----------|----------|----------|----------|
| Python | `python3` | C++ | `cpp` |
| JavaScript | `javascript` | C | `c` |
| TypeScript | `typescript` | C# | `csharp` |
| Rust | `rust` | Go | `golang` |
| Java | `java` | Kotlin | `kotlin` |

(Any langSlug LeetCode supports works; this is just a sampler.)

Example layout:

```
~/.config/leettui/templates/
├── rust/
│   ├── Cargo.toml
│   └── solution.rs
└── python3/
    └── main.py
```

---

## How a template file behaves — the filename rule

What a template file *does* depends entirely on its **name**:

| Template filename | Effect |
|-------------------|--------|
| `solution.{ext}` (e.g. `solution.rs`, `solution.py`) | **Replaces** the LeetCode starter snippet |
| `main.py` / `main.js` / `main.ts` | **Replaces** the auto-generated harness |
| anything else (`Cargo.toml`, `build.rs`, `helpers.py`, …) | **Added** alongside, purely additive |

> Only **top-level files** in the template folder are used — subdirectories are not recursed. Put files directly in `templates/{langSlug}/` (so `.cargo/config.toml` won't work, but a flat `Cargo.toml` will).

---

## Placeholders

Inside any template file, two placeholders are filled in when the solution is created:

| Placeholder | Replaced with | Example |
|-------------|---------------|---------|
| `{{functionName}}` | the problem's function name (from LeetCode metadata) | `twoSum` |
| `{{titleSlug}}` | the problem slug | `two-sum` |

Inner whitespace is allowed: `{{ titleSlug }}` works too. If a problem has no metadata, `{{functionName}}` renders to an empty string rather than failing.

---

## Examples

### Pin Cargo dependencies for Rust

```sh
mkdir -p ~/.config/leettui/templates/rust
cat > ~/.config/leettui/templates/rust/Cargo.toml <<'EOF'
[package]
name = "{{titleSlug}}"
version = "0.1.0"
edition = "2021"

[dependencies]
itertools = "0.13"
EOF
```

Every new Rust solution now gets a `Cargo.toml` next to `solution.rs`, with the slug filled in (`name = "two-sum"`). Nothing else about Rust changes.

### Use your own Python solution stub

```sh
mkdir -p ~/.config/leettui/templates/python3
cat > ~/.config/leettui/templates/python3/solution.py <<'EOF'
from typing import List, Optional

class Solution:
    def {{functionName}}(self):
        pass
EOF
```

This **replaces** LeetCode's snippet. `{{functionName}}` becomes the real function name (e.g. `twoSum`). The generated `main.py` harness is still written, since you only overrode the solution.

### Bring your own test harness

```sh
cat > ~/.config/leettui/templates/python3/main.py <<'EOF'
# Custom harness for {{functionName}}
import sys, json
from solution import Solution
# ... your own driver ...
EOF
```

Named `main.py`, this **takes over** from the auto-generated harness.

---

## Using it

Create a solution the normal way:

- press `e` in the problem browser, or
- press `o` / `Enter` in the solution picker.

leettui copies your template files in (with substitution), then fills any gaps with its defaults, then seeds the example test cases. Open the language folder and your customizations are there.

---

## Good to know

- **Create-if-absent.** Templates only apply when the target file doesn't exist yet. Re-opening an existing solution never re-applies them, and **your edits are never overwritten.**
- **No restart or config edit needed.** The `templates/` folder isn't part of `config.toml` — leettui reads it directly each time it creates a solution. Drop a file in and the next solution picks it up.
- **Per language.** `templates/python3/` only affects Python solutions, `templates/rust/` only Rust, and so on.
- **A bad template can't break solution creation** — an unreadable file is skipped silently.
