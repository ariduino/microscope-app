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
    echo "Backend launcher failed with exit code $status."
    read -r -p "Press Enter to close this window..."
  fi
}

trap cleanup EXIT

cd "$REPO_DIR/backend" || exit 1

echo "Rebuilding backend virtual environment..."
rm -rf .venv
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt

if [ -z "${SERIAL_PORT:-}" ]; then
  export SERIAL_PORT="/dev/ttyUSB0"
fi

echo "Starting backend with SERIAL_PORT=$SERIAL_PORT"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
