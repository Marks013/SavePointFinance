#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-web}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-3}"
RELEASE_MANIFEST_PATH="${1:-${RELEASE_MANIFEST_PATH:-}}"

log() {
  printf '[rollback] %s\n' "$*"
}

print_prefixed_block() {
  local prefix="$1"
  local content="$2"

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '%s %s\n' "$prefix" "$line"
  done <<< "$content"
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

inspect_service_state() {
  local compose_cmd="$1"
  local ps_output
  ps_output="$($compose_cmd ps "$SERVICE_NAME" 2>/dev/null | tail -n +3 | head -n 1 || true)"

  if [[ -z "$ps_output" ]]; then
    printf 'servico-sem-status'
    return 0
  fi

  printf '%s' "$ps_output" | awk '{print $(NF-1) " " $NF}'
}

emit_runtime_hint() {
  local compose_cmd="$1"
  local attempt="$2"
  local service_logs
  service_logs="$($compose_cmd logs --tail=12 "$SERVICE_NAME" 2>&1 || true)"

  if [[ -n "$service_logs" ]]; then
    log "Tentativa ${attempt}: ultimos eventos do servico ${SERVICE_NAME}"
    print_prefixed_block "[rollback][web]" "$service_logs"
  fi
}

wait_for_health() {
  local base_url="${APP_HEALTH_BASE_URL:-http://127.0.0.1:${APP_PORT:-3000}}"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  local compose_cmd="${1:-}"
  local attempt=1

  while (( SECONDS < deadline )); do
    local response=""
    local curl_output=""
    local curl_status=0
    local service_state=""
    local elapsed=0
    local remaining=0

    curl_output="$(curl --silent --show-error --max-time 5 "${base_url}${HEALTH_PATH}" 2>&1)" || curl_status=$?
    elapsed=$((HEALTH_TIMEOUT_SECONDS - (deadline - SECONDS)))
    remaining=$((deadline - SECONDS))
    (( remaining < 0 )) && remaining=0
    service_state="$(inspect_service_state "$compose_cmd")"

    if (( curl_status == 0 )); then
      response="$curl_output"
      log "Tentativa ${attempt}: healthcheck respondeu (container: ${service_state}, ${elapsed}s decorridos, ${remaining}s restantes)"
    else
      response="curl_exit=${curl_status} ${curl_output:-healthcheck sem resposta}"
      log "Tentativa ${attempt}: aguardando restauracao (container: ${service_state}, ${elapsed}s decorridos, ${remaining}s restantes) -> ${response}"
    fi

    if [[ "$response" == *'"status":"ok"'* ]]; then
      log "Healthcheck confirmou a restauracao em ${base_url}${HEALTH_PATH}"
      return 0
    fi

    if (( attempt == 1 || attempt % 3 == 0 )); then
      emit_runtime_hint "$compose_cmd" "$attempt"
    fi

    sleep "$HEALTH_INTERVAL_SECONDS"
    ((attempt++))
  done

  fail "Healthcheck nao confirmou a restauracao dentro de ${HEALTH_TIMEOUT_SECONDS}s."
}

main() {
  if [[ -z "$RELEASE_MANIFEST_PATH" ]]; then
    fail "Uso: ./ops/rollback-release.sh <caminho-do-manifest>"
  fi

  require_file "$RELEASE_MANIFEST_PATH"

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

  wait_for_health "$compose_cmd"
  log "Rollback concluido com sucesso."
}

main "$@"
