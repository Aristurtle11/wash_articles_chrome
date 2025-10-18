#!/usr/bin/env bash
#
# codex_task_monitor.sh — minimal scheduler that runs
# `export TERM=xterm && codex exec "continue to next task" --full-auto`
# every five minutes and reports each run's outcome.

set -euo pipefail

cmd=(codex exec "continue to next task" --full-auto)

while true; do
  echo "[codex-monitor] starting run at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  if TERM=xterm "${cmd[@]}"; then
    echo "[codex-monitor] codex exec completed successfully (exit 0)."
  else
    exit_code=$?
    echo "[codex-monitor] codex exec exited with errors (exit $exit_code)."
  fi

  echo "[codex-monitor] waiting five minutes before the next run..."
  sleep 300
done