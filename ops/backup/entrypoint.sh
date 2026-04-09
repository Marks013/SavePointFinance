#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
BACKUP_RUN_ON_STARTUP="${BACKUP_RUN_ON_STARTUP:-false}"

if [[ "$#" -gt 0 ]]; then
  exec "$@"
fi

if [[ "$BACKUP_RUN_ON_STARTUP" == "true" ]]; then
  /usr/local/bin/run-backup.sh
fi

cat <<EOF >/etc/crontabs/root
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TZ=${TZ:-America/Sao_Paulo}
${BACKUP_CRON_SCHEDULE} /usr/local/bin/run-backup.sh >> /proc/1/fd/1 2>&1
EOF

echo "Backup scheduler enabled with cron '${BACKUP_CRON_SCHEDULE}'"

echo "Using busybox crond"
exec busybox crond -f -l 2 -c /etc/crontabs
