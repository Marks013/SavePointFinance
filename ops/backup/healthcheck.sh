#!/usr/bin/env bash

set -Eeuo pipefail

success_file="/backups/last-success.txt"
failure_file="/backups/last-failure.txt"
startup_file="/backups/health-started.txt"
grace_hours="${BACKUP_INITIAL_HEALTH_GRACE_HOURS:-24}"
grace_seconds=$((grace_hours * 3600))

is_recent_file() {
  local file_path="$1"
  local max_age_seconds="$2"

  [[ -f "$file_path" ]] || return 1

  local now last_modified
  now="$(date +%s)"
  last_modified="$(stat -c %Y "$file_path" 2>/dev/null || echo 0)"

  (( now - last_modified <= max_age_seconds ))
}

if is_recent_file "$success_file" $((2 * 24 * 3600)); then
  exit 0
fi

if [[ -f "$failure_file" ]]; then
  exit 1
fi

if [[ -f "$startup_file" ]]; then
  now="$(date +%s)"
  started_at="$(stat -c %Y "$startup_file" 2>/dev/null || echo 0)"

  if (( now - started_at <= grace_seconds )); then
    exit 0
  fi
fi

exit 1
