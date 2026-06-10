#!/bin/bash

set -u

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

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
