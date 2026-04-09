#!/usr/bin/env bash

set -Eeuo pipefail

log() {
  printf '[restore] %s\n' "$*"
}

require_env() {
  local key="$1"

  if [[ -z "${!key:-}" ]]; then
    log "Missing required environment variable: ${key}"
    exit 1
  fi
}

latest_local_backup() {
  local archive

  archive="$(find /backups/archives -type f -name '*.tar.gz.enc' | sort | tail -n 1)"
  if [[ -z "$archive" ]]; then
    log "No local encrypted backups were found in /backups/archives."
    exit 1
  fi

  printf '%s' "$archive"
}

github_api() {
  local method="$1"
  local url="$2"

  curl --silent --show-error --fail \
    -X "$method" \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${BACKUP_GITHUB_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$url"
}

download_from_github() {
  require_env BACKUP_GITHUB_TOKEN
  require_env BACKUP_GITHUB_REPOSITORY

  local repo="$BACKUP_GITHUB_REPOSITORY"
  local tag="${RESTORE_GITHUB_RELEASE_TAG:-${BACKUP_GITHUB_RELEASE_TAG:-savepoint-backups}}"
  local asset_base="${RESTORE_ASSET_BASENAME:-}"
  local release_json

  release_json="$(github_api GET "https://api.github.com/repos/${repo}/releases/tags/${tag}")"

  local archive_url checksum_url archive_name checksum_name
  if [[ -n "$asset_base" ]]; then
    archive_name="${asset_base}.tar.gz.enc"
    checksum_name="${asset_base}.sha256"
    archive_url="$(printf '%s' "$release_json" | jq -r --arg name "$archive_name" '.assets[]? | select(.name == $name) | .url' | head -n 1)"
    checksum_url="$(printf '%s' "$release_json" | jq -r --arg name "$checksum_name" '.assets[]? | select(.name == $name) | .url' | head -n 1)"
  else
    archive_url="$(printf '%s' "$release_json" | jq -r '[.assets[]? | select(.name | endswith(".tar.gz.enc"))] | sort_by(.created_at) | last | .url // empty')"
    archive_name="$(printf '%s' "$release_json" | jq -r '[.assets[]? | select(.name | endswith(".tar.gz.enc"))] | sort_by(.created_at) | last | .name // empty')"
    checksum_name="${archive_name%.tar.gz.enc}.sha256"
    checksum_url="$(printf '%s' "$release_json" | jq -r --arg name "$checksum_name" '.assets[]? | select(.name == $name) | .url' | head -n 1)"
  fi

  if [[ -z "$archive_url" || -z "$archive_name" ]]; then
    log "Could not resolve the encrypted archive in GitHub release '${tag}'."
    exit 1
  fi

  if [[ -z "$checksum_url" ]]; then
    log "Could not resolve the checksum asset '${checksum_name}' in GitHub release '${tag}'."
    exit 1
  fi

  ARCHIVE_SOURCE_PATH="${WORK_ROOT}/${archive_name}"
  CHECKSUM_SOURCE_PATH="${WORK_ROOT}/${checksum_name}"

  log "Downloading encrypted archive from GitHub Releases"
  curl --silent --show-error --fail \
    -L \
    -H "Accept: application/octet-stream" \
    -H "Authorization: Bearer ${BACKUP_GITHUB_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$archive_url" \
    -o "$ARCHIVE_SOURCE_PATH"

  log "Downloading checksum from GitHub Releases"
  curl --silent --show-error --fail \
    -L \
    -H "Accept: application/octet-stream" \
    -H "Authorization: Bearer ${BACKUP_GITHUB_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$checksum_url" \
    -o "$CHECKSUM_SOURCE_PATH"
}

download_from_object_storage() {
  require_env BACKUP_OBJECT_STORAGE_ENDPOINT
  require_env BACKUP_OBJECT_STORAGE_BUCKET
  require_env BACKUP_OBJECT_STORAGE_ACCESS_KEY
  require_env BACKUP_OBJECT_STORAGE_SECRET_KEY

  local region="${BACKUP_OBJECT_STORAGE_REGION:-sa-saopaulo-1}"
  local prefix="${BACKUP_OBJECT_STORAGE_PREFIX:-savepoint}"
  local asset_base="${RESTORE_ASSET_BASENAME:-}"

  export AWS_ACCESS_KEY_ID="$BACKUP_OBJECT_STORAGE_ACCESS_KEY"
  export AWS_SECRET_ACCESS_KEY="$BACKUP_OBJECT_STORAGE_SECRET_KEY"
  export AWS_DEFAULT_REGION="$region"

  local base_path
  if [[ -n "$asset_base" ]]; then
    base_path="s3://${BACKUP_OBJECT_STORAGE_BUCKET}/${prefix}/${RESTORE_OBJECT_STORAGE_DATE_PATH:-}/${asset_base}"
    ARCHIVE_SOURCE_PATH="${WORK_ROOT}/${asset_base}.tar.gz.enc"
    CHECKSUM_SOURCE_PATH="${WORK_ROOT}/${asset_base}.sha256"

    log "Downloading encrypted archive from Object Storage"
    aws s3 cp "${base_path}.tar.gz.enc" "$ARCHIVE_SOURCE_PATH" \
      --endpoint-url "$BACKUP_OBJECT_STORAGE_ENDPOINT" \
      --only-show-errors

    log "Downloading checksum from Object Storage"
    aws s3 cp "${base_path}.sha256" "$CHECKSUM_SOURCE_PATH" \
      --endpoint-url "$BACKUP_OBJECT_STORAGE_ENDPOINT" \
      --only-show-errors
    return
  fi

  local latest_archive_key archive_name checksum_name
  latest_archive_key="$(
    aws s3 ls "s3://${BACKUP_OBJECT_STORAGE_BUCKET}/${prefix}/" --recursive --endpoint-url "$BACKUP_OBJECT_STORAGE_ENDPOINT" \
      | awk '{print $4}' \
      | grep '\.tar\.gz\.enc$' \
      | sort \
      | tail -n 1
  )"

  if [[ -z "$latest_archive_key" ]]; then
    log "Could not find an encrypted archive in Object Storage."
    exit 1
  fi

  archive_name="$(basename "$latest_archive_key")"
  checksum_name="${archive_name%.tar.gz.enc}.sha256"
  ARCHIVE_SOURCE_PATH="${WORK_ROOT}/${archive_name}"
  CHECKSUM_SOURCE_PATH="${WORK_ROOT}/${checksum_name}"

  log "Downloading latest encrypted archive from Object Storage"
  aws s3 cp "s3://${BACKUP_OBJECT_STORAGE_BUCKET}/${latest_archive_key}" "$ARCHIVE_SOURCE_PATH" \
    --endpoint-url "$BACKUP_OBJECT_STORAGE_ENDPOINT" \
    --only-show-errors

  log "Downloading checksum from Object Storage"
  aws s3 cp "s3://${BACKUP_OBJECT_STORAGE_BUCKET}/${latest_archive_key%.tar.gz.enc}.sha256" "$CHECKSUM_SOURCE_PATH" \
    --endpoint-url "$BACKUP_OBJECT_STORAGE_ENDPOINT" \
    --only-show-errors
}

resolve_source_files() {
  local source="${RESTORE_SOURCE:-local}"

  case "$source" in
    local)
      ARCHIVE_SOURCE_PATH="${RESTORE_ARCHIVE_PATH:-}"
      if [[ -z "$ARCHIVE_SOURCE_PATH" ]]; then
        ARCHIVE_SOURCE_PATH="$(latest_local_backup)"
      fi

      if [[ ! -f "$ARCHIVE_SOURCE_PATH" ]]; then
        log "Restore archive not found: ${ARCHIVE_SOURCE_PATH}"
        exit 1
      fi

      CHECKSUM_SOURCE_PATH="${RESTORE_CHECKSUM_PATH:-${ARCHIVE_SOURCE_PATH%.tar.gz.enc}.sha256}"
      if [[ ! -f "$CHECKSUM_SOURCE_PATH" ]]; then
        log "Restore checksum not found: ${CHECKSUM_SOURCE_PATH}"
        exit 1
      fi
      ;;
    github)
      download_from_github
      ;;
    object_storage)
      download_from_object_storage
      ;;
    *)
      log "Unsupported RESTORE_SOURCE='${source}'. Use local, github or object_storage."
      exit 1
      ;;
  esac
}

verify_checksum() {
  local expected actual
  expected="$(tr -d '[:space:]' <"$CHECKSUM_SOURCE_PATH")"
  actual="$(sha256sum "$ARCHIVE_SOURCE_PATH" | awk '{print $1}')"

  if [[ "$expected" != "$actual" ]]; then
    log "Checksum mismatch for ${ARCHIVE_SOURCE_PATH}"
    exit 1
  fi
}

decrypt_and_extract() {
  require_env BACKUP_ENCRYPTION_PASSPHRASE

  DECRYPTED_ARCHIVE="${WORK_ROOT}/payload.tar.gz"
  EXTRACT_ROOT="${WORK_ROOT}/payload"

  log "Decrypting archive"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$ARCHIVE_SOURCE_PATH" \
    -out "$DECRYPTED_ARCHIVE" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE

  mkdir -p "$EXTRACT_ROOT"
  log "Extracting payload"
  tar -xzf "$DECRYPTED_ARCHIVE" -C "$EXTRACT_ROOT"

  DATABASE_DUMP_PATH="${EXTRACT_ROOT}/database.dump"
  GLOBALS_DUMP_PATH="${EXTRACT_ROOT}/globals.sql.gz"
  CRITICAL_FILES_PATH="${EXTRACT_ROOT}/critical-files.tar.gz"

  if [[ ! -f "$DATABASE_DUMP_PATH" || ! -f "$GLOBALS_DUMP_PATH" ]]; then
    log "The decrypted payload is incomplete. Required dump files were not found."
    exit 1
  fi
}

restore_database() {
  local mode="${RESTORE_MODE:-test}"
  local db_name="${POSTGRES_DB:-savepoint}"
  local restore_db_name target_label

  if [[ "$mode" == "prod" ]]; then
    if [[ "${RESTORE_PRODUCTION_CONFIRMATION:-}" != "RESTORE_SAVEPOINT_PROD" ]]; then
      log "Production restore requires RESTORE_PRODUCTION_CONFIRMATION=RESTORE_SAVEPOINT_PROD."
      exit 1
    fi

    restore_db_name="${RESTORE_TARGET_DB:-$db_name}"
    target_label="production"
  else
    restore_db_name="${RESTORE_TARGET_DB:-${db_name}_restore_test}"
    target_label="test"
  fi

  log "Applying globals dump to PostgreSQL (${target_label})"
  gunzip -c "$GLOBALS_DUMP_PATH" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres >/dev/null

  log "Recreating target database '${restore_db_name}'"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${restore_db_name}' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS \"${restore_db_name}\";" \
    -c "CREATE DATABASE \"${restore_db_name}\";" >/dev/null

  log "Restoring database dump into '${restore_db_name}'"
  pg_restore \
    --host "$DB_HOST" \
    --port "$DB_PORT" \
    --username "$DB_USER" \
    --dbname "$restore_db_name" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    "$DATABASE_DUMP_PATH" >/dev/null

  RESTORED_DB_NAME="$restore_db_name"
}

extract_critical_files() {
  if [[ ! -f "$CRITICAL_FILES_PATH" ]]; then
    log "No critical files bundle found in the backup payload."
    return
  fi

  local destination="${RESTORE_FILES_DESTINATION:-/backups/restored-files/$(basename "${ARCHIVE_SOURCE_PATH%.tar.gz.enc}")}"
  mkdir -p "$destination"
  log "Extracting critical files to ${destination}"
  tar -xzf "$CRITICAL_FILES_PATH" -C "$destination"
}

export TZ="${TZ:-America/Sao_Paulo}"
DB_HOST="${BACKUP_DB_HOST:-postgres}"
DB_PORT="${BACKUP_DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-savepoint}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"
WORK_ROOT="/tmp/restore-$(date '+%Y-%m-%dT%H-%M-%S%z')"

require_env POSTGRES_PASSWORD
export PGPASSWORD="$DB_PASSWORD"

trap 'rm -rf "$WORK_ROOT"' EXIT

mkdir -p "$WORK_ROOT"

log "Checking database connectivity"
pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres >/dev/null

resolve_source_files
log "Using encrypted archive: ${ARCHIVE_SOURCE_PATH}"
verify_checksum
decrypt_and_extract
restore_database
extract_critical_files

log "Restore finished successfully into database '${RESTORED_DB_NAME}'"
if [[ "${RESTORE_MODE:-test}" == "test" ]]; then
  log "This was a test restore. The application still uses the original production database."
else
  log "Production restore completed. Start the web service again if it was stopped before the restore."
fi
