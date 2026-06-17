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
  HIDE_CURSOR=$(printf '\033[?25l'); SHOW_CURSOR=$(printf '\033[?25h')
else
  BOLD=''; DIM=''; ACCENT=''; GREEN=''; RESET=''
  HIDE_CURSOR=''; SHOW_CURSOR=''
fi

# Always put the cursor back, even on Ctrl-C or an early error exit.
trap 'printf "%s" "$SHOW_CURSOR"' EXIT INT HUP

err() { printf '%s\n' "${BOLD}error:${RESET} $1" >&2; exit 1; }
step() { printf '%s\n' "${ACCENT}::${RESET} $1"; }

# ── branded download progress ─────────────────────────────────────────────────
# curl's own --progress-bar can't be restyled, so we render our own: the same
# █/░ accent bar as the in-app updater, led by the `star` spinner glyph the TUI
# uses. Falls back to an indeterminate spinner when the size is unknown and to a
# plain quiet download when stdout isn't a terminal.

BAR_WIDTH=28
SPIN_I=0

repeat() { # repeat <char> <count>
  _c=$1; _k=$2; _s=''; _i=0
  while [ "$_i" -lt "$_k" ]; do _s="$_s$_c"; _i=$(( _i + 1 )); done
  printf '%s' "$_s"
}

human_bytes() {
  awk -v b="${1:-0}" 'BEGIN {
    if (b >= 1048576) printf "%.1f MB", b / 1048576;
    else if (b >= 1024) printf "%.0f KB", b / 1024;
    else printf "%d B", b
  }'
}

render_progress() { # render_progress <received> <total(0=indeterminate)>
  _recv=$1; _total=$2
  set -- ✶ ✸ ✹ ✺ ✹ ✷
  _idx=$(( SPIN_I % $# )); SPIN_I=$(( SPIN_I + 1 ))
  shift "$_idx"; _glyph=$1
  if [ "$_total" -gt 0 ]; then
    _pct=$(( _recv * 100 / _total )); [ "$_pct" -gt 100 ] && _pct=100
    _filled=$(( _recv * BAR_WIDTH / _total )); [ "$_filled" -gt "$BAR_WIDTH" ] && _filled=$BAR_WIDTH
    _bar="${ACCENT}$(repeat '█' "$_filled")${DIM}$(repeat '░' $(( BAR_WIDTH - _filled )))${RESET}"
    printf '\r  %s%s%s %s %s%3d%%%s  %s%s / %s%s  ' \
      "$ACCENT" "$_glyph" "$RESET" "$_bar" "$ACCENT" "$_pct" "$RESET" \
      "$DIM" "$(human_bytes "$_recv")" "$(human_bytes "$_total")" "$RESET"
  else
    printf '\r  %s%s%s Downloading… %s%s%s  ' \
      "$ACCENT" "$_glyph" "$RESET" "$DIM" "$(human_bytes "$_recv")" "$RESET"
  fi
}

curl_download() { # curl_download <url> <dest>  (curl only; wget keeps its own bar)
  _url=$1; _dest=$2

  # No animation when piped to a log/CI — keep the output clean.
  if [ ! -t 1 ]; then
    curl -fsSL "$_url" -o "$_dest"; return
  fi

  # Final asset size: follow redirects and take the LAST Content-Length, since
  # GitHub's intermediate 302s each carry a 0-length one of their own.
  _total=$(curl -fsIL "$_url" 2>/dev/null \
    | awk 'tolower($0) ~ /^content-length:/ { v = $2 } END { gsub(/[^0-9]/, "", v); print v }')
  [ -n "$_total" ] || _total=0

  printf '%s' "$HIDE_CURSOR"
  curl -fsSL "$_url" -o "$_dest" &
  _pid=$!
  while kill -0 "$_pid" 2>/dev/null; do
    [ -f "$_dest" ] && _recv=$(wc -c < "$_dest" 2>/dev/null | tr -dc '0-9')
    [ -n "${_recv:-}" ] || _recv=0
    render_progress "$_recv" "$_total"
    sleep 0.1
  done
  _status=0; wait "$_pid" || _status=$?
  [ "$_status" -eq 0 ] && [ "$_total" -gt 0 ] && render_progress "$_total" "$_total"
  printf '%s\n' "$SHOW_CURSOR"
  return "$_status"
}

# Fetch <url> to <dest>: curl gets the branded bar, wget keeps its own.
fetch_to() { # fetch_to <url> <dest>
  if command -v curl >/dev/null 2>&1; then
    curl_download "$1" "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$2" "$1"
  else
    err "need curl or wget to download"
  fi
}

# True when <url> resolves (a 200 after following GitHub's asset redirect) —
# used to detect whether a release has the Stage 19 .gz sibling before fetching.
remote_exists() { # remote_exists <url>
  if command -v curl >/dev/null 2>&1; then
    curl -fsIL "$1" >/dev/null 2>&1
  elif command -v wget >/dev/null 2>&1; then
    wget -q --spider "$1" >/dev/null 2>&1
  else
    err "need curl or wget to download"
  fi
}

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

# Stage 19: prefer the gzip-compressed asset (~half the bytes) and decompress
# locally; fall back to the raw binary when the .gz is absent (an older pinned
# VERSION whose release predates Stage 19) or gunzip isn't available. The
# branded bar measures the compressed Content-Length on the .gz path.
if command -v gunzip >/dev/null 2>&1 && remote_exists "$url.gz"; then
  step "Downloading ${BOLD}$asset.gz${RESET} (${VERSION}) for ${os}/${arch}…"
  tmp_gz="$dest.download.gz"
  fetch_to "$url.gz" "$tmp_gz" || err "download failed from $url.gz"
  # gunzip -c writes partial output before detecting a truncation, so remove
  # both the archive and any partial binary on failure — never leave a
  # truncated binary in place.
  gunzip -c "$tmp_gz" > "$dest" || { rm -f "$tmp_gz" "$dest"; err "decompression failed — the download was corrupt or truncated"; }
  rm -f "$tmp_gz"
else
  step "Downloading ${BOLD}$asset${RESET} (${VERSION}) for ${os}/${arch}…"
  fetch_to "$url" "$dest" || err "download failed from $url"
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
