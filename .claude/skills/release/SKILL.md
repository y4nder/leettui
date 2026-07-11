---
name: release
description: Cut a leettui release by tagging an existing main commit with a new semver tag, which triggers the GitHub Actions release workflow to build and publish platform binaries. Use when the user asks to "cut a release", "ship a version", "tag a release", "publish v...", or "make a new release".
---

# Cut a leettui release

Tagging `vX.Y.Z` and pushing it triggers `.github/workflows/release.yml`, which
builds standalone binaries on native runners and publishes a GitHub Release with
the assets the `install.sh` one-liner pulls from.

## Hard constraints (this repo)

- **`main` is PR-protected** — you cannot push commits to `main`. A release only
  *tags an existing commit already on `main`*. If the user wants new code in the
  release, that must land via a merged PR first; do not try to push to `main`.
- **`v*` tags are immutable** — a ruleset blocks deleting or moving version tags.
  Every release must use a brand-new version number. Never attempt to re-point or
  delete an existing tag; if a release is broken, cut the next patch instead.
- The repo must be **public** for the published binaries / installer to be
  fetchable.

## Inputs

The skill argument may be an explicit version (`v0.2.0` / `0.2.0`) or a bump
level (`patch` | `minor` | `major`). If absent, propose a **patch** bump from the
latest tag and confirm with the user before tagging.

## Procedure

1. **Preconditions** — run and verify all pass:
   ```sh
   git rev-parse --abbrev-ref HEAD          # must be main
   git status --porcelain                   # must be empty (clean tree)
   git fetch origin && git rev-parse HEAD origin/main   # local main == origin/main
   gh repo view --json visibility --jq .visibility      # must be PUBLIC
   ```
   If any fails, stop and tell the user what to fix (e.g. merge the PR, sync main).

2. **Determine the version**:
   ```sh
   git tag --sort=-v:refname | head -5      # latest is first
   ```
   Compute the next version from the latest tag + the requested bump (or use the
   explicit version given). Ensure the chosen tag does **not** already exist
   (immutability) — if it does, stop and pick the next free version.

3. **Confirm with the user** the exact tag about to be pushed. Tagging triggers a
   public release, so always confirm before pushing unless the user already gave
   an explicit version in the request.

4. **Tag and push**:
   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. **Monitor the workflow** until it finishes:
   ```sh
   sleep 8 && gh run list --workflow=release.yml --limit 1 \
     --json databaseId,headBranch,status --jq '.[0]'
   # then poll that run id until status == completed
   gh run view <id> --json status,conclusion,jobs \
     --jq '"\(.status) \(.conclusion // "")", (.jobs[] | "\(.name): \(.status) \(.conclusion // "")")'
   ```
   Builds run on `ubuntu-latest`, `macos-14`, and `windows-latest`. macOS/Windows
   runners can queue for several minutes — that's normal, not a failure.

6. **Verify the published release** — must be non-draft with all three assets:
   ```sh
   gh release view vX.Y.Z --json name,isDraft,assets \
     --jq '.name, "draft=\(.isDraft)", (.assets[].name)'
   ```
   Expected assets: `leettui-linux-x64`, `leettui-macos-arm64`,
   `leettui-windows-x64.exe`.

7. **Report** the result: the release URL, the asset list, and remind the user of
   the install command:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/y4nder/leettui/main/install.sh | sh
   ```

## Failure handling

- Build failed → inspect `gh run view <id> --log-failed`, report the cause. Do
  **not** retag the same version; once code is fixed (via PR to main), cut the
  next patch.
- Run stuck queuing on macOS/Windows for a long time → tell the user; offer to
  keep watching or to re-run the failed job (`gh run rerun <id>`), but never
  delete/move the tag.
