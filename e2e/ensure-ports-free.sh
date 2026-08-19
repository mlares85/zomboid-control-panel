#!/bin/sh
# Ensure the dev server ports (3001 + 5173) are free before E2E tests.
# Called by the Playwright webServer command to prevent stale-process conflicts.
set -e

kill_port() {
  port="$1"
  pid=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "[e2e] Port $port occupied by PID $pid — killing"
    kill "$pid" 2>/dev/null || true
    # Wait up to 3 seconds for graceful shutdown
    for i in 1 2 3; do
      if ! lsof -ti "tcp:$port" >/dev/null 2>&1; then break; fi
      sleep 1
    done
    # Force kill if still running
    if lsof -ti "tcp:$port" >/dev/null 2>&1; then
      kill -9 "$pid" 2>/dev/null || true
      sleep 0.5
    fi
  fi
}

kill_port 3001
kill_port 5173

# Clean stale panel.lock so the server doesn't refuse to start
rm -f data/panel.lock 2>/dev/null || true

# Clean stale test data lock file (test data dir is e2e/.test-data)
rm -f e2e/.test-data/panel.lock 2>/dev/null || true

# Clean stale auth state so the setup phase creates a fresh session
rm -f e2e/.auth/user.json 2>/dev/null || true

echo "[e2e] Ports 3001 and 5173 are free"
