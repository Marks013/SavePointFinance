#!/bin/bash
set -euo pipefail
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="savepoint_backup_${DATE}.sql.gz"
TEMP_FILE="/tmp/${FILENAME}"
echo "[$DATE] Starting backup..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${TEMP_FILE}"
echo "[$DATE] Backup created: $(du -sh ${TEMP_FILE} | cut -f1)"
python3 /b2_upload.py "${TEMP_FILE}" "${FILENAME}"
rm -f "${TEMP_FILE}"
echo "[$DATE] Backup uploaded: ${FILENAME}"
