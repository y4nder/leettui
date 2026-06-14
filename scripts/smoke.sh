#!/usr/bin/env bash
# Build the binary and prepare a clean, throwaway $HOME so the next launch
# behaves like a brand-new install (fresh config + empty DB → migrations run).
# This script does NOT launch the app — it prints the command for you to run.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building binary"
bun run build

FAKEHOME="$(mktemp -d -t leettui-smoke-XXXXXX)"
echo "==> Clean HOME prepared at $FAKEHOME"
echo "    (config -> \$HOME/.config/leettui, data -> \$HOME/.local/share/leettui)"

BIN="$(pwd)/leettui"
echo
echo "Run the executable yourself with:"
echo
echo "    HOME=$FAKEHOME $BIN"
echo
echo "When done, remove the throwaway home with:"
echo
echo "    rm -rf $FAKEHOME"
