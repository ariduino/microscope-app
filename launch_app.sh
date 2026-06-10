#!/bin/bash

set -euo pipefail

SCRIPT_PATH="$(readlink -f "$0")"
REPO_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
RUNTIME_DIR="$REPO_DIR/.runtime"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
BACKEND_LOG="$RUNTIME_DIR/backend.log"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
APP_URL="http://127.0.0.1:8000"

if [ -z "${LAUNCHER_IN_TERMINAL:-}" ] && [ -n "${DISPLAY:-}" ] && command -v x-terminal-emulator >/dev/null 2>&1; then
  exec x-terminal-emulator -e bash -lc "LAUNCHER_IN_TERMINAL=1 \"$SCRIPT_PATH\""
fi

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo
    echo "Microscope app launcher failed with exit code $status."
    echo "If the backend started, its log is here:"
    echo "  $BACKEND_LOG"
    read -r -p "Press Enter to close this window..."
  fi
}

trap cleanup EXIT

open_browser() {
  if command -v chromium-browser >/dev/null 2>&1; then
    setsid -f chromium-browser --new-window "$APP_URL" >/dev/null 2>&1 || true
  elif command -v chromium >/dev/null 2>&1; then
    setsid -f chromium --new-window "$APP_URL" >/dev/null 2>&1 || true
  else
    setsid -f xdg-open "$APP_URL" >/dev/null 2>&1 || true
  fi
}

mkdir -p "$RUNTIME_DIR"

if [ ! -d "$BACKEND_DIR" ] || [ ! -d "$FRONTEND_DIR" ]; then
  echo "Could not find backend/ and frontend/ directories next to this launcher."
  exit 1
fi

echo "Building frontend for production..."
cd "$FRONTEND_DIR"
npm install
npm run build

echo "Preparing backend environment..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
  python3 -m venv --system-site-packages .venv
fi
source .venv/bin/activate
pip install -r requirements.txt

if [ -z "${SERIAL_PORT:-}" ]; then
  export SERIAL_PORT="/dev/ttyUSB0"
fi

if [ -f "$BACKEND_PID_FILE" ]; then
  OLD_PID="$(cat "$BACKEND_PID_FILE" 2>/dev/null || true)"
  if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping previous backend process..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

echo "Starting backend server..."
nohup bash -lc "cd \"$BACKEND_DIR\" && source .venv/bin/activate && SERIAL_PORT=\"$SERIAL_PORT\" uvicorn app.main:app --host 0.0.0.0 --port 8000" >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

echo "Waiting for backend to become ready..."
READY=0
for _ in $(seq 1 60); do
  if curl -fsS "$APP_URL/api/v1/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -ne 1 ]; then
  echo "Backend did not become ready."
  echo "Check log: $BACKEND_LOG"
  exit 1
fi

sleep 1
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend exited unexpectedly after reporting healthy."
  echo "Check log: $BACKEND_LOG"
  exit 1
fi

echo "Opening Chromium..."
open_browser

echo "Microscope app launched at $APP_URL"
echo "Backend log: $BACKEND_LOG"
echo
echo "This launcher window will close in 8 seconds."
sleep 8
