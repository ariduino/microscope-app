#!/bin/bash

set -u

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

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
