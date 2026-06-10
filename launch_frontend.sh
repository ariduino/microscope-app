#!/bin/bash

set -u

SCRIPT_PATH="$(readlink -f "$0")"
REPO_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

if [ -z "${LAUNCHER_IN_TERMINAL:-}" ] && [ -n "${DISPLAY:-}" ] && command -v x-terminal-emulator >/dev/null 2>&1; then
  exec x-terminal-emulator -e bash -lc "LAUNCHER_IN_TERMINAL=1 \"$SCRIPT_PATH\""
fi

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo
    echo "Frontend launcher failed with exit code $status."
    read -r -p "Press Enter to close this window..."
  fi
}

trap cleanup EXIT

cd "$REPO_DIR/frontend" || exit 1

echo "Installing frontend dependencies..."
npm install

echo "Starting frontend dev server..."
exec npm run dev -- --host 0.0.0.0 --port 5173
