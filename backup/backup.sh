#!/bin/bash
# Save Point Finanças — Automatic Database Backup to Backblaze B2
set -euo pipefail

DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="savepoint_backup_${DATE}.sql.gz"
TEMP_FILE="/tmp/${FILENAME}"

echo "[$DATE] Starting backup..."

# Dump and compress
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  "${POSTGRES_DB}" | gzip > "${TEMP_FILE}"

echo "[$DATE] Backup created: ${TEMP_FILE} ($(du -sh ${TEMP_FILE} | cut -f1))"

# Upload to Backblaze B2
python3 /b2_upload.py "${TEMP_FILE}" "${FILENAME}"

# Cleanup local file
rm -f "${TEMP_FILE}"

echo "[$DATE] Backup uploaded successfully to B2: ${FILENAME}"
