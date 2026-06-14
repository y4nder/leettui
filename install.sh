#!/bin/sh
# leettui installer — downloads the latest release binary for your platform.
#
#   curl -fsSL https://raw.githubusercontent.com/y4nder/leettui/main/install.sh | sh
#
# Overrides:
#   LEETTUI_INSTALL_DIR=/usr/local/bin   install location (default: ~/.local/bin)
#   LEETTUI_VERSION=v0.1.0               pin a version (default: latest)
#   NO_COLOR=1                           disable colored output
#
# Linux and macOS only. Windows users: download leettui-windows-x64.exe from
# the Releases page manually.
set -eu

REPO="y4nder/leettui"
INSTALL_DIR="${LEETTUI_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${LEETTUI_VERSION:-latest}"

# Colors only when stdout is a terminal and NO_COLOR isn't set.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m')
  ACCENT=$(printf '\033[38;5;75m'); GREEN=$(printf '\033[32m'); RESET=$(printf '\033[0m')
else
  BOLD=''; DIM=''; ACCENT=''; GREEN=''; RESET=''
fi

err() { printf '%s\n' "${BOLD}error:${RESET} $1" >&2; exit 1; }
step() { printf '%s\n' "${ACCENT}::${RESET} $1"; }

banner() {
  printf '\n%s\n' "${ACCENT}█   █▀▀ █▀▀ ▀█▀ ▀█▀ █ █ █${RESET}"
  printf '%s\n'   "${ACCENT}█   █▀  █▀   █   █  █ █ █${RESET}"
  printf '%s\n'   "${ACCENT}█▄▄ █▄▄ █▄▄  █   █  █▄█ █${RESET}"
  printf '%s\n\n' "${DIM}LeetCode in your terminal${RESET}"
}

banner

# Map uname output to the release asset naming used by the workflow.
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) os="linux" ;;
  Darwin) os="macos" ;;
  *) err "unsupported OS '$os' — on Windows, download leettui-windows-x64.exe from https://github.com/$REPO/releases" ;;
esac

case "$arch" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) err "unsupported architecture '$arch'" ;;
esac

# Only the combinations the workflow actually builds. Intel Macs (x64) have no
# prebuilt binary — Apple Silicon users are covered by the arm64 build.
asset="leettui-${os}-${arch}"
case "$asset" in
  leettui-linux-x64 | leettui-macos-arm64) ;;
  *) err "no prebuilt binary for ${os}/${arch}; build from source with 'bun run build'" ;;
esac

if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/$asset"
else
  url="https://github.com/$REPO/releases/download/$VERSION/$asset"
fi

mkdir -p "$INSTALL_DIR"
dest="$INSTALL_DIR/leettui"

step "Downloading ${BOLD}$asset${RESET} (${VERSION}) for ${os}/${arch}…"
if command -v curl >/dev/null 2>&1; then
  curl -fSL --progress-bar "$url" -o "$dest" || err "download failed from $url"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$dest" "$url" || err "download failed from $url"
else
  err "need curl or wget to download"
fi

chmod +x "$dest"
printf '%s\n' "${GREEN}✓${RESET} Installed leettui to ${BOLD}$dest${RESET}"

# Nudge if the install dir isn't on PATH.
case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    printf '\n%s\n' "Run ${ACCENT}leettui${RESET} to get started — it'll walk you through signing in."
    ;;
  *)
    printf '\n%s is not on your PATH. Add this to your shell profile:\n\n    %s\n\nThen run: %s\n' \
      "${BOLD}$INSTALL_DIR${RESET}" \
      "${BOLD}export PATH=\"$INSTALL_DIR:\$PATH\"${RESET}" \
      "${ACCENT}leettui${RESET}"
    ;;
esac
