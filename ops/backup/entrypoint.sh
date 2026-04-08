#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
BACKUP_RUN_ON_STARTUP="${BACKUP_RUN_ON_STARTUP:-false}"

if [[ "${1:-}" == "/usr/local/bin/run-backup.sh" ]]; then
  exec /usr/local/bin/run-backup.sh
fi

if [[ "$BACKUP_RUN_ON_STARTUP" == "true" ]]; then
  /usr/local/bin/run-backup.sh
fi

cat <<EOF >/etc/crontabs/root
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TZ=${TZ:-America/Sao_Paulo}
${BACKUP_CRON_SCHEDULE} /usr/local/bin/run-backup.sh >> /var/log/backup-cron.log 2>&1
EOF

echo "Backup scheduler enabled with cron '${BACKUP_CRON_SCHEDULE}'"
exec crond -f -l 2
