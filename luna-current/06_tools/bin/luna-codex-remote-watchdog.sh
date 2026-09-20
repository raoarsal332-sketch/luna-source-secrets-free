#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || true
LOG=$HOME/logs/luna-codex-remote-watchdog.log
mkdir -p "$HOME/logs"
ts(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
if codex remote-control --json >/tmp/luna-codex-rc-status.json 2>/tmp/luna-codex-rc-status.err; then
  if ! grep -qi 'error' /tmp/luna-codex-rc-status.err /tmp/luna-codex-rc-status.json 2>/dev/null; then
    echo "$(ts) OK" >>"$LOG"
    exit 0
  fi
fi
echo "$(ts) RESTART remote-control" >>"$LOG"
/home/ubuntu/bin/luna-codex-remote-start >>"$LOG" 2>&1 || true
