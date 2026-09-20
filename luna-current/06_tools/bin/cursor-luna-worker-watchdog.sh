#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
LOG_DIR="${HOME}/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/cursor-luna-worker.log"
PIDFILE="$LOG_DIR/cursor-luna-worker.pid"
WORKER_DIR="${CURSOR_WORKER_DIR:-/home/ubuntu}"
NAME="${CURSOR_WORKER_NAME:-Luna VPS}"

is_running() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      if ps -p "$pid" -o args= 2>/dev/null | grep -Eqi 'cursor-agent|agent'; then
        return 0
      fi
    fi
  fi
  pgrep -af 'cursor-agent worker start|agent worker start' >/dev/null 2>&1
}

if is_running; then
  echo "$(date -Is) ok cursor worker already running" >>"$LOG"
  exit 0
fi

echo "$(date -Is) starting cursor-agent worker start (idle-release=0 name=$NAME)" >>"$LOG"
cd "$WORKER_DIR"
nohup cursor-agent worker start \
  --worker-dir "$WORKER_DIR" \
  --idle-release-timeout 0 \
  --name "$NAME" \
  >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"
sleep 4
if is_running; then
  echo "$(date -Is) started pid=$(cat "$PIDFILE")" >>"$LOG"
  exit 0
fi
echo "$(date -Is) FAILED; tail:" >>"$LOG"
tail -40 "$LOG" >>"$LOG" || true
exit 1
