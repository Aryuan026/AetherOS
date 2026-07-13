#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/aetheros-frontstage.pid"
LOG_FILE="$RUN_DIR/aetheros-frontstage.log"
HOST="127.0.0.1"
PORT="5174"
URL="http://$HOST:$PORT/"

http_ok() {
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$URL" 2>/dev/null || true)
  [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 500 ] 2>/dev/null
}

managed_pid() {
  [ -f "$PID_FILE" ] || return 1
  pid=$(sed -n '1p' "$PID_FILE")
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

show_status() {
  if http_ok; then
    if managed_pid; then
      printf 'healthy url=%s pid=%s log=%s\n' "$URL" "$pid" "$LOG_FILE"
    else
      printf 'healthy url=%s pid=external log=unmanaged\n' "$URL"
    fi
    return 0
  fi

  printf 'offline url=%s\n' "$URL"
  return 1
}

start() {
  mkdir -p "$RUN_DIR"
  if http_ok; then
    show_status
    return 0
  fi

  if managed_pid; then
    printf 'stale-startup pid=%s url=%s\n' "$pid" "$URL" >&2
    return 1
  fi

  rm -f "$PID_FILE"
  python3 - "$PID_FILE" "$LOG_FILE" "$ROOT" "$(command -v node)" <<'PY'
import os
import subprocess
import sys

pid_file, log_file, root, node = sys.argv[1:]
log = open(log_file, "ab", buffering=0)
proc = subprocess.Popen(
    [
        node,
        os.path.join(root, "node_modules/vite/bin/vite.js"),
        root,
        "--host", "127.0.0.1",
        "--port", "5174",
        "--strictPort",
    ],
    cwd=root,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
    close_fds=True,
)
with open(pid_file, "w", encoding="utf-8") as fh:
    fh.write(f"{proc.pid}\n")
PY

  attempts=0
  while [ "$attempts" -lt 20 ]; do
    if http_ok; then
      show_status
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 0.25
  done

  printf 'failed url=%s log=%s\n' "$URL" "$LOG_FILE" >&2
  tail -n 30 "$LOG_FILE" >&2 || true
  return 1
}

stop() {
  if ! managed_pid; then
    if http_ok; then
      printf 'refusing-to-stop unmanaged server at %s\n' "$URL" >&2
      return 1
    fi
    rm -f "$PID_FILE"
    printf 'already-offline url=%s\n' "$URL"
    return 0
  fi

  kill "$pid"
  attempts=0
  while kill -0 "$pid" 2>/dev/null && [ "$attempts" -lt 20 ]; do
    attempts=$((attempts + 1))
    sleep 0.25
  done
  rm -f "$PID_FILE"
  printf 'stopped pid=%s url=%s\n' "$pid" "$URL"
}

case "${1:-status}" in
  start) start ;;
  status) show_status ;;
  stop) stop ;;
  *) printf 'usage: %s {start|status|stop}\n' "$0" >&2; exit 2 ;;
esac
