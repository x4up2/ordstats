#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Copy this file to refresh-all-launchd.sh and adapt these values.
# The copied machine-specific file is intentionally ignored by Git.
PROJECT_DIR="/absolute/path/to/ordstats"
ORD_STATUS_URL="http://127.0.0.1/status"
NPM_BIN="/opt/homebrew/bin/npm"
LOCK_DIR="/tmp/ordstats-refresh.lock"

if [[ "$PROJECT_DIR" == "/absolute/path/to/ordstats" ]]; then
  echo "ERROR: configure PROJECT_DIR before running this script."
  exit 1
fi

if [[ ! -x "$NPM_BIN" ]]; then
  echo "ERROR: npm is unavailable at $NPM_BIN"
  exit 1
fi

echo
echo "============================================================"
echo "ORDstats automatic refresh"
echo "Started: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "============================================================"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another ORDstats refresh is already running."
  exit 0
fi

trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

if ! /usr/bin/curl \
  --fail \
  --silent \
  --show-error \
  --max-time 20 \
  -H "Accept: application/json" \
  "$ORD_STATUS_URL" \
  > /tmp/ordstats-ord-status.json
then
  echo "ERROR: ord server is unavailable at $ORD_STATUS_URL"
  exit 1
fi

echo "ord server is available."

cd "$PROJECT_DIR"

"$NPM_BIN" run catalog:update:100
"$NPM_BIN" run refresh:all
"$NPM_BIN" run catalog:index
"$NPM_BIN" run catalog:sync
"$NPM_BIN" run catalog:images

echo
echo "============================================================"
echo "Completed: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "============================================================"
