#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-${ROOT_DIR}/.deploy/runtime.env}"
RELEASES_DIR="${RELEASES_DIR:-${ROOT_DIR}/.deploy/releases}"
SERVICE_NAME="${SERVICE_NAME:-web}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-3}"
RELEASE_RETENTION_COUNT="${RELEASE_RETENTION_COUNT:-5}"
ROLLBACK_IMAGE_RETENTION_COUNT="${ROLLBACK_IMAGE_RETENTION_COUNT:-2}"
RUN_DB_MIGRATIONS="${RUN_DB_MIGRATIONS:-true}"
RUN_BACKUP_ON_DEPLOY="${RUN_BACKUP_ON_DEPLOY:-false}"
SMOKE_REQUIRED="${SMOKE_REQUIRED:-true}"
KEEP_MAINTENANCE_ON_FAILURE="${KEEP_MAINTENANCE_ON_FAILURE:-true}"
KEEP_MAINTENANCE_AFTER_DEPLOY="${KEEP_MAINTENANCE_AFTER_DEPLOY:-false}"
UPDATE_VERBOSE="${UPDATE_VERBOSE:-false}"
MAINTENANCE_WAS_ENABLED="false"
MAINTENANCE_IS_ENABLED="false"
DEPLOY_SUCCEEDED="false"
AUTO_ROLLBACK_ATTEMPTED="false"
DEPLOY_STARTED_AT_EPOCH="$(date +%s)"
RELEASE_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_TIMESTAMP}"
RELEASE_MANIFEST="${RELEASE_DIR}/release.env"
STEP_INDEX=0
CURRENT_STEP=""
CURRENT_STEP_STARTED_AT=0

log() {
  printf '[%s][deploy] %s\n' "$(date '+%H:%M:%S')" "$*"
}

format_duration() {
  local total_seconds="$1"
  local hours=$((total_seconds / 3600))
  local minutes=$(((total_seconds % 3600) / 60))
  local seconds=$((total_seconds % 60))

  if (( hours > 0 )); then
    printf '%dh %02dm %02ds' "$hours" "$minutes" "$seconds"
    return
  fi

  if (( minutes > 0 )); then
    printf '%dm %02ds' "$minutes" "$seconds"
    return
  fi

  printf '%ds' "$seconds"
}

print_prefixed_block() {
  local prefix="$1"
  local content="$2"

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '%s %s\n' "$prefix" "$line"
  done <<< "$content"
}

print_log_tail() {
  local log_file="$1"
  local lines="${2:-40}"

  if [[ -f "$log_file" ]]; then
    log "Ultimas linhas de ${log_file}:"
    tail -n "$lines" "$log_file" | sed 's/^/[log] /'
  fi
}

step_start() {
  STEP_INDEX=$((STEP_INDEX + 1))
  CURRENT_STEP="$1"
  CURRENT_STEP_STARTED_AT="$SECONDS"
  log "PASSO ${STEP_INDEX}: ${CURRENT_STEP}"
}

step_ok() {
  local elapsed=$((SECONDS - CURRENT_STEP_STARTED_AT))
  log "OK PASSO ${STEP_INDEX}: ${CURRENT_STEP} ($(format_duration "$elapsed"))"
  CURRENT_STEP=""
}

step_fail() {
  local exit_code="$1"
  local log_file="${2:-}"
  local elapsed=$((SECONDS - CURRENT_STEP_STARTED_AT))

  log "ERRO PASSO ${STEP_INDEX}: ${CURRENT_STEP} falhou com codigo ${exit_code} ($(format_duration "$elapsed"))"

  if [[ -n "$log_file" && "$log_file" != "-" ]]; then
    print_log_tail "$log_file"
  fi
}

run_step() {
  local title="$1"
  local log_file="$2"
  shift 2

  step_start "$title"

  set +e
  if [[ "$log_file" == "-" || "$UPDATE_VERBOSE" == "true" ]]; then
    "$@"
  else
    "$@" > "$log_file" 2>&1
  fi

  local exit_code=$?
  set -e

  if (( exit_code == 0 )); then
    step_ok
    return 0
  fi

  step_fail "$exit_code" "$log_file"
  return "$exit_code"
}

run_compose_step() {
  local title="$1"
  local log_file="$2"
  shift 2

  step_start "$title"

  set +e
  if [[ "$log_file" == "-" || "$UPDATE_VERBOSE" == "true" ]]; then
    $COMPOSE_CMD "$@"
  else
    $COMPOSE_CMD "$@" > "$log_file" 2>&1
  fi

  local exit_code=$?
  set -e

  if (( exit_code == 0 )); then
    step_ok
    return 0
  fi

  step_fail "$exit_code" "$log_file"
  return "$exit_code"
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

APP_HEALTH_BASE_URL=""
COMPOSE_CMD=""
ROLLBACK_IMAGE_TAG=""

ensure_runtime_env_file() {
  mkdir -p "$(dirname "$RUNTIME_ENV_FILE")"
  touch "$RUNTIME_ENV_FILE"
}

read_env_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  local raw_value
  raw_value="$(sed -n "s/^${key}=//p" "$file_path" | tail -n 1)"

  if [[ -z "$raw_value" ]]; then
    return 1
  fi

  raw_value="${raw_value%$'\r'}"
  raw_value="${raw_value#\"}"
  raw_value="${raw_value%\"}"
  printf '%s' "$raw_value"
}

write_env_value() {
  local file_path="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  mkdir -p "$(dirname "$file_path")"
  touch "$file_path"
  tmp_file="$(mktemp)"

  if grep -q "^${key}=" "$file_path"; then
    awk -v key="$key" -v value="$value" '
      $0 ~ "^" key "=" {
        print key "=" value
        next
      }
      { print }
    ' "$file_path" > "$tmp_file"
  else
    cat "$file_path" > "$tmp_file"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi

  mv "$tmp_file" "$file_path"
}

sync_maintenance_bypass_token() {
  local token
  token="$(read_env_value "$RUNTIME_ENV_FILE" MAINTENANCE_BYPASS_TOKEN || true)"

  if [[ -z "$token" ]]; then
    return 0
  fi

  export MAINTENANCE_BYPASS_TOKEN="$token"

  if [[ -z "${AUDIT_MAINTENANCE_BYPASS_TOKEN:-}" ]]; then
    export AUDIT_MAINTENANCE_BYPASS_TOKEN="$token"
  fi
}

inspect_service_state() {
  if [[ -z "$COMPOSE_CMD" ]]; then
    return 0
  fi

  local ps_output
  ps_output="$($COMPOSE_CMD ps --format json "$SERVICE_NAME" 2>/dev/null | head -n 1 || true)"

  if [[ -z "$ps_output" ]]; then
    ps_output="$($COMPOSE_CMD ps "$SERVICE_NAME" 2>/dev/null | tail -n +3 | head -n 1 || true)"

    if [[ -z "$ps_output" ]]; then
      printf 'servico-sem-status'
      return 0
    fi

    printf '%s' "$ps_output" | awk '{print $(NF-1) " " $NF}'
    return 0
  fi

  local state
  state="$(printf '%s' "$ps_output" | sed -n 's/.*"State":"\([^"]*\)".*/\1/p')"
  local health
  health="$(printf '%s' "$ps_output" | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p')"

  if [[ -n "$health" ]]; then
    printf '%s (%s)' "${state:-estado-desconhecido}" "$health"
    return 0
  fi

  printf '%s' "${state:-estado-desconhecido}"
}

emit_runtime_hint() {
  local attempt="$1"

  if [[ -z "$COMPOSE_CMD" ]]; then
    return 0
  fi

  local service_logs
  service_logs="$($COMPOSE_CMD logs --tail=12 "$SERVICE_NAME" 2>&1 || true)"

  if [[ -n "$service_logs" ]]; then
    log "Tentativa ${attempt}: ultimos eventos do servico ${SERVICE_NAME}"
    print_prefixed_block "[deploy][web]" "$service_logs"
  fi
}

set_maintenance_mode() {
  local target_mode="$1"

  if [[ "$target_mode" == "on" && "$MAINTENANCE_IS_ENABLED" == "true" ]]; then
    sync_maintenance_bypass_token

    if [[ -n "${AUDIT_MAINTENANCE_BYPASS_TOKEN:-}" ]]; then
      return 0
    fi
  fi

  if [[ "$target_mode" == "off" && "$MAINTENANCE_IS_ENABLED" == "false" ]]; then
    return 0
  fi

  if [[ -f "${ROOT_DIR}/ops/toggle-maintenance.sh" ]]; then
    ENV_FILE="$RUNTIME_ENV_FILE" sh "${ROOT_DIR}/ops/toggle-maintenance.sh" "$target_mode" >> "${RELEASE_DIR}/maintenance.log" 2>&1
  else
    log "Helper ops/toggle-maintenance.sh nao encontrado; alternando manutencao diretamente em ${RUNTIME_ENV_FILE}"
    if [[ "$target_mode" == "on" ]]; then
      write_env_value "$RUNTIME_ENV_FILE" MAINTENANCE_MODE true
    else
      write_env_value "$RUNTIME_ENV_FILE" MAINTENANCE_MODE false
    fi
    $COMPOSE_CMD up -d --no-deps --force-recreate "$SERVICE_NAME" >> "${RELEASE_DIR}/maintenance.log" 2>&1
  fi

  if [[ "$target_mode" == "on" ]]; then
    MAINTENANCE_IS_ENABLED="true"
    sync_maintenance_bypass_token
    return 0
  fi

  MAINTENANCE_IS_ENABLED="false"
}

wait_for_health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  local attempt=1

  while (( SECONDS < deadline )); do
    local response=""
    local curl_output=""
    local curl_status=0
    local service_state=""
    local elapsed=0
    local remaining=0

    curl_output="$(curl --silent --show-error --max-time 5 "${APP_HEALTH_BASE_URL}${HEALTH_PATH}" 2>&1)" || curl_status=$?
    elapsed=$((HEALTH_TIMEOUT_SECONDS - (deadline - SECONDS)))
    remaining=$((deadline - SECONDS))
    (( remaining < 0 )) && remaining=0
    service_state="$(inspect_service_state)"

    if (( curl_status == 0 )); then
      response="$curl_output"
      log "Tentativa ${attempt}: healthcheck respondeu (container: ${service_state}, ${elapsed}s decorridos, ${remaining}s restantes)"
    else
      response="curl_exit=${curl_status} ${curl_output:-healthcheck sem resposta}"
      log "Tentativa ${attempt}: aguardando app (container: ${service_state}, ${elapsed}s decorridos, ${remaining}s restantes) -> ${response}"
    fi

    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${response:-healthcheck sem resposta}" >> "${RELEASE_DIR}/health.log"

    if [[ "$response" == *'"status":"ok"'* ]]; then
      log "Healthcheck respondeu com status ok."
      return 0
    fi

    if (( attempt == 1 || attempt % 3 == 0 )); then
      emit_runtime_hint "$attempt"
    fi

    sleep "$HEALTH_INTERVAL_SECONDS"
    ((attempt++))
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
  bash "${ROOT_DIR}/ops/rollback-release.sh" "$RELEASE_MANIFEST" >> "${RELEASE_DIR}/rollback.log" 2>&1 || true
}

cleanup_success_artifacts() {
  if [[ -n "$ROLLBACK_IMAGE_TAG" ]] && docker image inspect "$ROLLBACK_IMAGE_TAG" >/dev/null 2>&1; then
    log "Removendo snapshot local de rollback deste ciclo"
    docker image rm -f "$ROLLBACK_IMAGE_TAG" >> "${RELEASE_DIR}/cleanup.log" 2>&1 || true
  fi

  if [[ -d "$RELEASES_DIR" ]] && [[ "$RELEASE_RETENTION_COUNT" =~ ^[0-9]+$ ]] && (( RELEASE_RETENTION_COUNT >= 1 )); then
    local old_release_dirs
    old_release_dirs="$(
      find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n -"${RELEASE_RETENTION_COUNT}" 2>/dev/null || true
    )"

    if [[ -n "$old_release_dirs" ]]; then
      log "Removendo evidencias antigas e mantendo os ultimos ${RELEASE_RETENTION_COUNT} releases"
      while IFS= read -r old_release_dir; do
        [[ -n "$old_release_dir" ]] || continue
        rm -rf -- "$old_release_dir"
      done <<< "$old_release_dirs"
    fi
  fi

  if [[ "$ROLLBACK_IMAGE_RETENTION_COUNT" =~ ^[0-9]+$ ]] && (( ROLLBACK_IMAGE_RETENTION_COUNT >= 0 )); then
    local rollback_tags
    rollback_tags="$(
      docker image ls --format '{{.Repository}}:{{.Tag}}' |
        grep '^savepointfinance-web:rollback-' |
        sort |
        head -n -"${ROLLBACK_IMAGE_RETENTION_COUNT}" 2>/dev/null || true
    )"

    if [[ -n "$rollback_tags" ]]; then
      log "Removendo snapshots antigos de rollback e mantendo os ultimos ${ROLLBACK_IMAGE_RETENTION_COUNT}"
      while IFS= read -r rollback_tag; do
        [[ -n "$rollback_tag" ]] || continue
        docker image rm -f "$rollback_tag" >> "${RELEASE_DIR}/cleanup.log" 2>&1 || true
      done <<< "$rollback_tags"
    fi
  fi
}

on_error() {
  local exit_code=$?
  local elapsed_seconds=$(( $(date +%s) - DEPLOY_STARTED_AT_EPOCH ))
  capture_logs

  if [[ "$DEPLOY_SUCCEEDED" != "true" ]]; then
    rollback_release

    if [[ "$KEEP_MAINTENANCE_ON_FAILURE" == "true" ]]; then
      if [[ "$MAINTENANCE_IS_ENABLED" != "true" ]]; then
        log "Religando modo de manutencao apos falha"
        set_maintenance_mode on || true
      fi
      log "Falha detectada. O sistema sera mantido em manutencao para triagem."
    else
      set_maintenance_mode off || true
    fi
  fi

  log "Tempo total ate a falha: $(format_duration "$elapsed_seconds")"
  log "Deploy falhou. Consulte ${RELEASE_DIR}"
  exit "$exit_code"
}

trap on_error ERR

mkdir -p "$RELEASE_DIR"
ensure_runtime_env_file
COMPOSE_CMD="$(detect_compose_cmd)"
APP_PORT_VALUE="$(read_env_value "$ENV_FILE" APP_PORT || true)"
APP_HEALTH_BASE_URL="${APP_HEALTH_BASE_URL:-http://127.0.0.1:${APP_PORT_VALUE:-3000}}"
ROLLBACK_IMAGE_TAG="savepointfinance-web:rollback-${RELEASE_TIMESTAMP}"

log "Iniciando update do SavePointFinance"
log "Release: ${RELEASE_TIMESTAMP}"
log "Evidencias e logs: ${RELEASE_DIR}"

cat > "$RELEASE_MANIFEST" <<EOF
RELEASE_TIMESTAMP=${RELEASE_TIMESTAMP}
SERVICE_NAME=${SERVICE_NAME}
HEALTH_PATH=${HEALTH_PATH}
APP_HEALTH_BASE_URL=${APP_HEALTH_BASE_URL}
ROLLBACK_IMAGE_TAG=${ROLLBACK_IMAGE_TAG}
EOF

if docker image inspect savepointfinance-web:latest >/dev/null 2>&1; then
  run_step "Salvar snapshot local da imagem anterior para rollback" "${RELEASE_DIR}/rollback-snapshot.log" docker tag savepointfinance-web:latest "$ROLLBACK_IMAGE_TAG"
else
  log "Nenhuma imagem anterior encontrada; rollback automatico por imagem ficara indisponivel neste ciclo."
  sed -i '/^ROLLBACK_IMAGE_TAG=/d' "$RELEASE_MANIFEST"
  ROLLBACK_IMAGE_TAG=""
fi

if [[ "$(read_env_value "$RUNTIME_ENV_FILE" MAINTENANCE_MODE || true)" == "true" ]]; then
  MAINTENANCE_WAS_ENABLED="true"
  MAINTENANCE_IS_ENABLED="true"
  sync_maintenance_bypass_token
  run_step "Garantir bypass de manutencao para auditorias" "-" set_maintenance_mode on
  log "Modo de manutencao ja estava ativo antes do deploy."
else
  run_step "Ativar modo de manutencao" "-" set_maintenance_mode on
fi

if [[ "$RUN_BACKUP_ON_DEPLOY" == "true" ]]; then
  run_compose_step "Executar backup preventivo" "${RELEASE_DIR}/backup.log" --profile ops run --rm backup-once
fi

run_step "Atualizar codigo com git pull --ff-only" "${RELEASE_DIR}/git-pull.log" git pull --ff-only

run_compose_step "Construir imagens do Docker Compose" "${RELEASE_DIR}/build.log" --profile ops build

if [[ "$RUN_DB_MIGRATIONS" == "true" ]]; then
  run_compose_step "Aplicar migrations do banco" "${RELEASE_DIR}/migrate.log" --profile ops run --rm migrate
else
  log "Migrations ignoradas porque RUN_DB_MIGRATIONS=false."
fi

run_compose_step "Recriar o servico ${SERVICE_NAME}" "${RELEASE_DIR}/up.log" up -d --no-deps --force-recreate "$SERVICE_NAME"

run_step "Aguardar healthcheck publico ${APP_HEALTH_BASE_URL}${HEALTH_PATH}" "-" wait_for_health

log "Auditoria de fumaca usara bypass de manutencao enquanto o site permanece protegido."
if run_compose_step "Executar auditoria de fumaca" "${RELEASE_DIR}/smoke.log" --profile ops run --rm -e "AUDIT_MAINTENANCE_BYPASS_TOKEN=${AUDIT_MAINTENANCE_BYPASS_TOKEN:-}" audit-server-smoke; then
  SMOKE_EXIT_CODE=0
else
  SMOKE_EXIT_CODE=$?
fi

if (( SMOKE_EXIT_CODE != 0 )); then
  capture_logs

  if [[ "$SMOKE_REQUIRED" == "true" ]]; then
    log "Auditoria de fumaca falhou e esta configurada como obrigatoria."
    if [[ "$MAINTENANCE_IS_ENABLED" != "true" ]]; then
      log "Religando modo de manutencao apos falha na auditoria de fumaca"
      set_maintenance_mode on || true
    fi
    exit "$SMOKE_EXIT_CODE"
  fi

  log "Auditoria de fumaca falhou, mas o deploy seguira porque SMOKE_REQUIRED=false."
  log "Consulte ${RELEASE_DIR}/smoke.log para diagnostico."
fi

capture_logs

if [[ "$KEEP_MAINTENANCE_AFTER_DEPLOY" == "true" && "$MAINTENANCE_WAS_ENABLED" == "true" ]]; then
  run_step "Manter modo de manutencao que ja estava ativo antes do deploy" "-" set_maintenance_mode on
elif [[ "$MAINTENANCE_IS_ENABLED" == "true" ]]; then
  run_step "Desativar modo de manutencao" "-" set_maintenance_mode off
fi

DEPLOY_SUCCEEDED="true"
DEPLOY_FINISHED_AT_EPOCH="$(date +%s)"
DEPLOY_ELAPSED_SECONDS=$((DEPLOY_FINISHED_AT_EPOCH - DEPLOY_STARTED_AT_EPOCH))
run_step "Limpar artefatos antigos de deploy" "-" cleanup_success_artifacts
log "Deploy concluido com sucesso"
log "Tempo total do deploy: $(format_duration "$DEPLOY_ELAPSED_SECONDS")"
log "Manifesto: ${RELEASE_MANIFEST}"
