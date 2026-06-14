#!/bin/sh
# leettui installer — downloads the latest release binary for your platform.
#
#   curl -fsSL https://raw.githubusercontent.com/y4nder/leettui/main/install.sh | sh
#
# Overrides:
#   LEETTUI_INSTALL_DIR=/usr/local/bin   install location (default: ~/.local/bin)
#   LEETTUI_VERSION=v0.1.0               pin a version (default: latest)
#
# Linux and macOS only. Windows users: download leettui-windows-x64.exe from
# the Releases page manually.
set -eu

REPO="y4nder/leettui"
INSTALL_DIR="${LEETTUI_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${LEETTUI_VERSION:-latest}"

err() { printf 'error: %s\n' "$1" >&2; exit 1; }

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

printf 'Downloading %s (%s)...\n' "$asset" "$VERSION"
if command -v curl >/dev/null 2>&1; then
  curl -fSL --progress-bar "$url" -o "$dest" || err "download failed from $url"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$dest" "$url" || err "download failed from $url"
else
  err "need curl or wget to download"
fi

chmod +x "$dest"
printf 'Installed leettui to %s\n' "$dest"

# Nudge if the install dir isn't on PATH.
case ":$PATH:" in
  *":$INSTALL_DIR:"*) printf 'Run: leettui\n' ;;
  *) printf '\n%s is not on your PATH. Add this to your shell profile:\n\n    export PATH="%s:$PATH"\n\nThen run: leettui\n' "$INSTALL_DIR" "$INSTALL_DIR" ;;
esac
