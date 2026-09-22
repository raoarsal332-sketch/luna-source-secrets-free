#!/usr/bin/env bash
# Keep Claude Code (tmux luna-claude) + /remote-control alive 24/7.
set -euo pipefail

SESSION=luna-claude
LOG="$HOME/logs/claude-luna-watchdog.log"
URL_FILE="$HOME/logs/claude-remote-control-url.txt"
LAUNCHER="$HOME/bin/claude-luna"
mkdir -p "$HOME/logs"

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(ts) $*" >>"$LOG"; }

pane_text() {
  tmux capture-pane -t "$SESSION" -p -S -80 2>/dev/null | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | tr -d '\r' || true
}

extract_url() {
  pane_text | grep -Eo 'https://claude\.ai/code/session_[A-Za-z0-9]+' | tail -1 || true
}

claude_running_in_session() {
  tmux has-session -t "$SESSION" 2>/dev/null || return 1
  # pane has a live process tree containing claude
  local pid
  pid=$(tmux list-panes -t "$SESSION" -F '#{pane_pid}' 2>/dev/null | head -1 || true)
  [ -n "${pid:-}" ] || return 1
  pgrep -P "$pid" -a 2>/dev/null | grep -q '[c]laude' && return 0
  # sometimes claude is the pane process itself
  ps -p "$pid" -o args= 2>/dev/null | grep -q '[c]laude' && return 0
  # broader: any claude under session
  pgrep -af '[c]laude' >/dev/null 2>&1 && tmux has-session -t "$SESSION" 2>/dev/null
}

ensure_session() {
  if claude_running_in_session; then
    return 0
  fi
  log "RESTART session (claude missing)"
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  sleep 1
  tmux new-session -d -s "$SESSION" -c /home/ubuntu "bash -lc '$LAUNCHER'"
  sleep 5

  local text
  text=$(pane_text)
  if echo "$text" | grep -qi 'trust this folder\|Is this a project'; then
    # pick Yes (second option)
    tmux send-keys -t "$SESSION" Down
    sleep 0.2
    tmux send-keys -t "$SESSION" Enter
    sleep 5
  fi
  # dismiss other one-shot prompts with Enter if at a clear prompt
  text=$(pane_text)
  if echo "$text" | grep -qi 'Enter to confirm'; then
    tmux send-keys -t "$SESSION" Enter
    sleep 3
  fi
}

ensure_remote_control() {
  local text url prev
  text=$(pane_text)
  if echo "$text" | grep -qiE '/rc active|remote-control is active'; then
    url=$(extract_url)
    if [ -n "$url" ]; then
      prev=$(cat "$URL_FILE" 2>/dev/null || true)
      if [ "$url" != "$prev" ]; then
        echo "$url" >"$URL_FILE"
        log "URL updated $url"
      fi
    fi
    return 0
  fi

  log "ENABLE /remote-control"
  # clear any partial input
  tmux send-keys -t "$SESSION" C-c
  sleep 0.4
  tmux send-keys -t "$SESSION" Escape
  sleep 0.3
  tmux send-keys -t "$SESSION" '/remote-control'
  sleep 0.2
  tmux send-keys -t "$SESSION" Enter
  sleep 6

  url=$(extract_url)
  if [ -n "$url" ]; then
    prev=$(cat "$URL_FILE" 2>/dev/null || true)
    echo "$url" >"$URL_FILE"
    if [ "$url" != "$prev" ]; then
      log "URL new after rc $url"
    else
      log "URL same $url"
    fi
  else
    log "WARN no session URL after /remote-control"
  fi
}

# light keep-alive: if idle prompt visible, send a no-op that does not start work
# (avoid waking the model). Just ensure process not dead.
main() {
  ensure_session
  if ! claude_running_in_session; then
    log "FAIL claude still down after restart"
    exit 1
  fi
  ensure_remote_control
  log "OK session up rc=$(pane_text | grep -qiE '/rc active|remote-control is active' && echo yes || echo no) url=$(cat "$URL_FILE" 2>/dev/null || echo none)"
}

main
