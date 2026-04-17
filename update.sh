#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
RELEASES_DIR="${RELEASES_DIR:-${ROOT_DIR}/.deploy/releases}"
SERVICE_NAME="${SERVICE_NAME:-web}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-3}"
RUN_DB_MIGRATIONS="${RUN_DB_MIGRATIONS:-false}"
RUN_BACKUP_ON_DEPLOY="${RUN_BACKUP_ON_DEPLOY:-false}"
KEEP_MAINTENANCE_ON_FAILURE="${KEEP_MAINTENANCE_ON_FAILURE:-true}"
MAINTENANCE_WAS_ENABLED="false"
DEPLOY_SUCCEEDED="false"
AUTO_ROLLBACK_ATTEMPTED="false"
RELEASE_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_TIMESTAMP}"
RELEASE_MANIFEST="${RELEASE_DIR}/release.env"

log() {
  printf '[deploy] %s\n' "$*"
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

  log "Docker Compose nao esta disponivel no host."
  exit 1
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

APP_HEALTH_BASE_URL=""
COMPOSE_CMD=""
ROLLBACK_IMAGE_TAG=""

wait_for_health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    local response
    response="$(curl --silent --show-error --max-time 5 "${APP_HEALTH_BASE_URL}${HEALTH_PATH}" || true)"
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${response:-healthcheck sem resposta}" >> "${RELEASE_DIR}/health.log"

    if [[ "$response" == *'"status":"ok"'* ]]; then
      log "Healthcheck respondeu com status ok."
      return 0
    fi

    sleep "$HEALTH_INTERVAL_SECONDS"
  done

  log "Healthcheck nao respondeu com status ok dentro do tempo limite."
  return 1
}

capture_logs() {
  if [[ -n "$COMPOSE_CMD" ]]; then
    $COMPOSE_CMD logs --tail=200 "$SERVICE_NAME" > "${RELEASE_DIR}/web.log" 2>&1 || true
    $COMPOSE_CMD ps > "${RELEASE_DIR}/compose-ps.log" 2>&1 || true
  fi
}

rollback_release() {
  if [[ "$AUTO_ROLLBACK_ATTEMPTED" == "true" || -z "$ROLLBACK_IMAGE_TAG" ]]; then
    return
  fi

  if ! docker image inspect "$ROLLBACK_IMAGE_TAG" >/dev/null 2>&1; then
    log "Imagem de rollback indisponivel, rollback automatico ignorado."
    return
  fi

  AUTO_ROLLBACK_ATTEMPTED="true"
  log "Acionando rollback automatico para ${ROLLBACK_IMAGE_TAG}"
  "${ROOT_DIR}/ops/rollback-release.sh" "$RELEASE_MANIFEST" >> "${RELEASE_DIR}/rollback.log" 2>&1 || true
}

on_error() {
  local exit_code=$?
  capture_logs

  if [[ "$DEPLOY_SUCCEEDED" != "true" ]]; then
    rollback_release

    if [[ "$KEEP_MAINTENANCE_ON_FAILURE" == "true" ]]; then
      log "Falha detectada. O sistema sera mantido em manutencao para triagem."
    else
      "${ROOT_DIR}/ops/toggle-maintenance.sh" off >> "${RELEASE_DIR}/maintenance.log" 2>&1 || true
    fi
  fi

  log "Deploy falhou. Consulte ${RELEASE_DIR}"
  exit "$exit_code"
}

trap on_error ERR

mkdir -p "$RELEASE_DIR"
load_env_file
COMPOSE_CMD="$(detect_compose_cmd)"
APP_HEALTH_BASE_URL="${APP_HEALTH_BASE_URL:-http://127.0.0.1:${APP_PORT:-3000}}"
ROLLBACK_IMAGE_TAG="savepointfinance-web:rollback-${RELEASE_TIMESTAMP}"

log "Iniciando deploy robusto do SavePointFinance"
log "Release atual: ${RELEASE_TIMESTAMP}"
log "Evidencias: ${RELEASE_DIR}"

cat > "$RELEASE_MANIFEST" <<EOF
RELEASE_TIMESTAMP=${RELEASE_TIMESTAMP}
SERVICE_NAME=${SERVICE_NAME}
HEALTH_PATH=${HEALTH_PATH}
APP_HEALTH_BASE_URL=${APP_HEALTH_BASE_URL}
ROLLBACK_IMAGE_TAG=${ROLLBACK_IMAGE_TAG}
EOF

if docker image inspect savepointfinance-web:latest >/dev/null 2>&1; then
  log "Salvando snapshot local da imagem anterior para rollback"
  docker tag savepointfinance-web:latest "$ROLLBACK_IMAGE_TAG"
else
  log "Nenhuma imagem anterior encontrada; rollback automatico por imagem ficara indisponivel neste ciclo."
  sed -i '/^ROLLBACK_IMAGE_TAG=/d' "$RELEASE_MANIFEST"
  ROLLBACK_IMAGE_TAG=""
fi

if grep -q '^MAINTENANCE_MODE=true' "$ENV_FILE"; then
  MAINTENANCE_WAS_ENABLED="true"
  log "Modo de manutencao ja estava ativo antes do deploy."
else
  log "Ativando modo de manutencao"
  "${ROOT_DIR}/ops/toggle-maintenance.sh" on >> "${RELEASE_DIR}/maintenance.log" 2>&1
fi

if [[ "$RUN_BACKUP_ON_DEPLOY" == "true" ]]; then
  log "Executando backup preventivo antes do deploy"
  $COMPOSE_CMD run --rm backup-once > "${RELEASE_DIR}/backup.log" 2>&1
fi

log "Atualizando codigo com git pull --ff-only"
git pull --ff-only > "${RELEASE_DIR}/git-pull.log" 2>&1

if [[ "$RUN_DB_MIGRATIONS" == "true" ]]; then
  log "Aplicando migrations do banco"
  $COMPOSE_CMD run --rm migrate > "${RELEASE_DIR}/migrate.log" 2>&1
fi

log "Construindo imagens de aplicacao e smoke audit"
$COMPOSE_CMD build web audit-server-smoke > "${RELEASE_DIR}/build.log" 2>&1

log "Recriando o servico ${SERVICE_NAME}"
$COMPOSE_CMD up -d --no-deps --force-recreate "$SERVICE_NAME" > "${RELEASE_DIR}/up.log" 2>&1

log "Aguardando healthcheck publico ${APP_HEALTH_BASE_URL}${HEALTH_PATH}"
wait_for_health

log "Executando auditoria de fumaça ainda sob manutencao"
$COMPOSE_CMD run --rm audit-server-smoke > "${RELEASE_DIR}/smoke.log" 2>&1

capture_logs

if [[ "$MAINTENANCE_WAS_ENABLED" != "true" ]]; then
  log "Desativando modo de manutencao"
  "${ROOT_DIR}/ops/toggle-maintenance.sh" off >> "${RELEASE_DIR}/maintenance.log" 2>&1
fi

DEPLOY_SUCCEEDED="true"
log "Deploy concluido com sucesso"
log "Manifesto: ${RELEASE_MANIFEST}"
