#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
SERVICE_NAME="${SERVICE_NAME:-web}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-3}"
RELEASE_MANIFEST_PATH="${1:-${RELEASE_MANIFEST_PATH:-}}"

log() {
  printf '[rollback] %s\n' "$*"
}

fail() {
  log "$*"
  exit 1
}

detect_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return
  fi

  fail "Docker Compose nao esta disponivel no host."
}

require_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || fail "Arquivo nao encontrado: ${file_path}"
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

wait_for_health() {
  local base_url="${APP_HEALTH_BASE_URL:-http://127.0.0.1:${APP_PORT:-3000}}"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    local response
    response="$(curl --silent --show-error --max-time 5 "${base_url}${HEALTH_PATH}" || true)"

    if [[ "$response" == *'"status":"ok"'* ]]; then
      log "Healthcheck confirmou a restauracao em ${base_url}${HEALTH_PATH}"
      return 0
    fi

    sleep "$HEALTH_INTERVAL_SECONDS"
  done

  fail "Healthcheck nao confirmou a restauracao dentro de ${HEALTH_TIMEOUT_SECONDS}s."
}

main() {
  require_file "$ENV_FILE"

  if [[ -z "$RELEASE_MANIFEST_PATH" ]]; then
    fail "Uso: ./ops/rollback-release.sh <caminho-do-manifest>"
  fi

  require_file "$RELEASE_MANIFEST_PATH"
  load_env_file

  set -a
  # shellcheck disable=SC1090
  source "$RELEASE_MANIFEST_PATH"
  set +a

  local compose_cmd
  compose_cmd="$(detect_compose_cmd)"

  [[ -n "${ROLLBACK_IMAGE_TAG:-}" ]] || fail "Manifesto nao possui ROLLBACK_IMAGE_TAG."

  if ! docker image inspect "$ROLLBACK_IMAGE_TAG" >/dev/null 2>&1; then
    fail "Imagem de rollback nao encontrada localmente: ${ROLLBACK_IMAGE_TAG}"
  fi

  log "Restaurando imagem anterior ${ROLLBACK_IMAGE_TAG} para savepointfinance-web:latest"
  docker tag "$ROLLBACK_IMAGE_TAG" savepointfinance-web:latest

  log "Recriando servico ${SERVICE_NAME}"
  $compose_cmd up -d --no-deps --force-recreate "$SERVICE_NAME"

  wait_for_health
  log "Rollback concluido com sucesso."
}

main "$@"
